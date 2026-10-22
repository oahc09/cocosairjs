/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Fixed-core ST motion planning. No vendor patch, persistent plan or borrowed pointer escapes. */
#include "air_box3d.h"
#include "motion_bridge.h"
#include "world_bridge.h"
#include "body.h"
#include "physics_world.h"
#include "shape.h"
#include <box3d/box3d.h>
#include <box3d/constants.h>
#include <float.h>
#include <math.h>
#include <stddef.h>
#include <string.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/heap.h>
#endif

typedef struct MotionPlan {
    b3BodyId id;
    uint32_t flags, intent;
    b3WorldTransform before, reset, target;
    b3Pos beforeCenter;
    b3Vec3 beforeV, beforeW, linear, angular, linearResidue, angularResidue;
    float linearDamping, angularDamping, linearCap, angularCap;
    int fastRotation;
} MotionPlan;

static int vec_ok(b3Vec3 v) { return isfinite(v.x) && isfinite(v.y) && isfinite(v.z); }
static int matrix_ok(b3Matrix3 m) { return vec_ok(m.cx) && vec_ok(m.cy) && vec_ok(m.cz); }
static void put(float* p, b3Vec3 v) { p[0]=v.x; p[1]=v.y; p[2]=v.z; }
static void put_pose(float* p, b3WorldTransform t, b3Pos c) {
    put(p,t.p); put(p+3,t.q.v); p[6]=t.q.s; put(p+7,c);
}
static float read_float(const uint32_t* p) { float f; memcpy(&f,p,4); return f; }
static int region(const void* p, size_t bytes) {
    uintptr_t start=(uintptr_t)p;
    if (!p || start%4 || start>UINTPTR_MAX-bytes) return 0;
#ifdef __EMSCRIPTEN__
    if (start+bytes>emscripten_get_heap_size()) return 0;
#endif
    return 1;
}
static int overlap(const void* a,size_t na,const void* b,size_t nb) {
    return (uintptr_t)a<(uintptr_t)b+nb && (uintptr_t)b<(uintptr_t)a+na;
}
/* Scaling before normalization avoids overflow/underflow and never maps zero to identity. */
static int read_pose(const uint32_t* words,b3WorldTransform* out) {
    float p[7]; for(int i=0;i<7;++i) {p[i]=read_float(words+i);if(!isfinite(p[i]))return AIR_B3_ARGUMENT;}
    double scale=0;for(int i=3;i<7;++i)scale=fmax(scale,fabs((double)p[i]));
    if(scale==0)return AIR_B3_ARGUMENT;
    double q[4],sum=0;for(int i=0;i<4;++i){q[i]=p[i+3]/scale;sum+=q[i]*q[i];}
    double norm=sqrt(sum);for(int i=0;i<4;++i)p[i+3]=(float)(q[i]/norm);
    *out=(b3WorldTransform){{p[0],p[1],p[2]},{{p[3],p[4],p[5]},p[6]}};
    return b3IsValidWorldTransform(*out)?AIR_B3_OK:AIR_B3_ARGUMENT;
}
static int pose_safe(b3World* world,const b3Body* body,const b3BodySim* sim,b3WorldTransform pose) {
    if(!b3IsValidWorldTransform(pose) || !vec_ok(b3TransformWorldPoint(pose,sim->localCenter)))return AIR_B3_ARGUMENT;
    b3Matrix3 r=b3MakeMatrixFromQuat(pose.q);
    if(!matrix_ok(b3MulMM(b3MulMM(r,sim->invInertiaLocal),b3Transpose(r))))return AIR_B3_ARGUMENT;
    for(int i=body->headShapeId;i!=B3_NULL_INDEX;){
        const b3Shape* shape=b3Array_Get(world->shapes,i);i=shape->nextShapeId;
        if(shape->type!=b3_sphereShape && shape->type!=b3_hullShape)return AIR_B3_UNSUPPORTED;
        if(!isfinite(shape->aabbMargin) || shape->aabbMargin<0)return AIR_B3_ARGUMENT;
        b3AABB box=b3ComputeFatShapeAABB(shape,pose,B3_SPECULATIVE_DISTANCE);
        if(!b3IsValidAABB(box) || !b3IsValidAABB(b3AABB_Inflate(box,shape->aabbMargin)))return AIR_B3_ARGUMENT;
    }
    return AIR_B3_OK;
}
static int locks(b3Vec3* v,b3Vec3* residue,uint32_t flags,int shift) {
    float p[3];put(p,*v);float r[3]={0};
    for(int i=0;i<3;++i)if(flags&(1u<<(i+shift))){
        if(fabsf(p[i])>1e-6f)return AIR_B3_MOTION_LOCK_CONFLICT;
        r[i]=p[i];p[i]=0;
    }
    *v=(b3Vec3){p[0],p[1],p[2]};*residue=(b3Vec3){r[0],r[1],r[2]};return AIR_B3_OK;
}
static int speed(b3Vec3 v,float cap,int capped) {
    if(!vec_ok(v) || !isfinite(b3LengthSquared(v)))return AIR_B3_ARGUMENT;
    if(!capped)return AIR_B3_OK;
    if(!isfinite(cap) || cap<=0 || !isfinite(cap*cap))return AIR_B3_ARGUMENT;
    if(v.x==0 && v.y==0 && v.z==0)return AIR_B3_OK;
    double margin=8.0*FLT_EPSILON*fmax(1.0,cap);
    double magnitude=hypot(hypot((double)v.x,v.y),v.z);
    return magnitude>=(double)cap-margin?AIR_B3_MOTION_SPEED_CAP:AIR_B3_OK;
}
static int make_plan(b3World* world,uint32_t wid,const uint32_t* record,float dt,int substeps,MotionPlan* plan) {
    memset(plan,0,sizeof(*plan));
    plan->id=b3LoadBodyId(((uint64_t)record[1]<<32)|record[0]);
    if(!b3Body_IsValid(plan->id) || b3StoreWorldId(b3Body_GetWorld(plan->id))!=wid)return AIR_B3_INVALID;
    b3Body* body=b3GetBodyFullId(world,plan->id);b3BodySim* sim=b3GetBodySim(world,body);
    plan->flags=record[2];plan->intent=record[3];
    if(plan->flags&~15u || plan->intent>AIR_B3_MOTION_CLEAR)return AIR_B3_ARGUMENT;
    if(!(plan->flags&AIR_B3_MOTION_RESET) && (plan->flags || plan->intent==AIR_B3_MOTION_NONE))return AIR_B3_ARGUMENT;
    if((plan->flags&AIR_B3_MOTION_RESET) && (((plan->flags&AIR_B3_MOTION_SCENE)!=0)!=(body->type==b3_staticBody)))return AIR_B3_UNSUPPORTED;
    if(plan->intent && (body->type!=b3_kinematicBody || body->setIndex==b3_disabledSet))return AIR_B3_UNSUPPORTED;
    /* Unused pose words must be canonical zero, not hidden NaNs or a second interpretation. */
    for(int i=4;i<18;++i)if((i<11?!(plan->flags&AIR_B3_MOTION_RESET):plan->intent!=AIR_B3_MOTION_TARGET) && record[i])return AIR_B3_ARGUMENT;
    plan->before=sim->transform;plan->beforeCenter=sim->center;
    plan->beforeV=b3Body_GetLinearVelocity(plan->id);plan->beforeW=b3Body_GetAngularVelocity(plan->id);
    if(!vec_ok(plan->beforeV)||!vec_ok(plan->beforeW)||!vec_ok(sim->force)||!vec_ok(sim->torque)||!vec_ok(sim->center))return AIR_B3_ARGUMENT;
    int status=pose_safe(world,body,sim,sim->transform);if(status)return status;
    b3WorldTransform basis=sim->transform;b3Pos center=sim->center;
    if(plan->flags&AIR_B3_MOTION_RESET){
        status=read_pose(record+4,&plan->reset);if(status)return status;
        status=pose_safe(world,body,sim,plan->reset);if(status)return status;
        basis=plan->reset;center=b3TransformWorldPoint(basis,sim->localCenter);
    }
    plan->linearDamping=sim->linearDamping;plan->angularDamping=sim->angularDamping;
    plan->linearCap=world->maxLinearSpeed;plan->fastRotation=(body->flags&b3_allowFastRotation)!=0;
    plan->angularCap=plan->fastRotation?0.0f:B3_MAX_ROTATION*(1.0f/dt);
    if(!isfinite(plan->linearCap)||plan->linearCap<=0||!isfinite(plan->angularCap))return AIR_B3_ARGUMENT;
    float h=dt/substeps;
    if(!isfinite(sim->linearDamping)||sim->linearDamping<0||!isfinite(sim->angularDamping)||sim->angularDamping<0 ||
       !isfinite(1.0f+h*sim->linearDamping)||!isfinite(1.0f+h*sim->angularDamping))return AIR_B3_ARGUMENT;
    plan->linear=plan->beforeV;plan->angular=plan->beforeW;
    if((plan->flags&AIR_B3_MOTION_RESET) && !(plan->flags&AIR_B3_MOTION_PRESERVE))plan->linear=plan->angular=b3Vec3_zero;
    if(plan->intent==AIR_B3_MOTION_CLEAR)plan->linear=plan->angular=b3Vec3_zero;
    if(plan->intent==AIR_B3_MOTION_TARGET){
        status=read_pose(record+11,&plan->target);if(status)return status;
        status=pose_safe(world,body,sim,plan->target);if(status)return status;
        float inverse=1.0f/dt;
        plan->linear=b3MulSV(inverse,b3SubPos(b3TransformWorldPoint(plan->target,sim->localCenter),center));
        b3Quat q=plan->target.q;if(b3DotQuat(basis.q,q)<0)q=b3NegateQuat(q);
        b3Quat difference={b3Sub(q.v,basis.q.v),q.s-basis.q.s};
        plan->angular=b3MulSV(2.0f*inverse,b3MulQuat(difference,b3Conjugate(basis.q)).v);
    }
    if(!vec_ok(plan->linear)||!vec_ok(plan->angular))return AIR_B3_ARGUMENT;
    /* Validate target cap BEFORE projecting its admitted numeric-zero lock residue. */
    if(plan->intent==AIR_B3_MOTION_TARGET){
        status=speed(plan->linear,plan->linearCap,1);if(status)return status;
        status=speed(plan->angular,plan->angularCap,!plan->fastRotation);if(status)return status;
        b3Vec3 delta=b3MulSV(dt,plan->linear),rotation=b3MulSV(h,plan->angular);
        if(!vec_ok(delta)||!vec_ok(rotation)||!isfinite(b3LengthSquared(rotation))||!vec_ok(b3OffsetPos(center,delta)))return AIR_B3_ARGUMENT;
    }
    status=locks(&plan->linear,&plan->linearResidue,body->flags,0);if(status)return status;
    status=locks(&plan->angular,&plan->angularResidue,body->flags,3);if(status)return status;
    return AIR_B3_OK;
}
static void apply_plan(b3World* world,const MotionPlan* plan,float dt) {
    if(plan->flags&AIR_B3_MOTION_RESET){
        b3Body_SetTransform(plan->id,plan->reset.p,plan->reset.q);
        b3Body* body=b3GetBodyFullId(world,plan->id);
        if((plan->flags&AIR_B3_MOTION_WAKE) && body->type!=b3_staticBody && body->setIndex!=b3_disabledSet)
            b3Body_SetAwake(plan->id,true);
    }
    int moving=plan->linear.x!=0||plan->linear.y!=0||plan->linear.z!=0||plan->angular.x!=0||plan->angular.y!=0||plan->angular.z!=0;
    if(plan->intent==AIR_B3_MOTION_TARGET && moving){
        b3Body_SetAwake(plan->id,true);
        b3Body_SetTargetTransform(plan->id,plan->target,dt,true);
    }
    /* Reacquire after wake, which may move body/state storage. Private write only implements
       paired clear/preserve and admitted lock residues; forces and torque remain untouched. */
    b3Body* body=b3GetBodyFullId(world,plan->id);b3BodyState* state=b3GetBodyState(world,body);
    if(state){
        if(plan->intent!=AIR_B3_MOTION_TARGET || !moving){state->linearVelocity=plan->linear;state->angularVelocity=plan->angular;}
        else{
            if(body->flags&b3_lockLinearX)state->linearVelocity.x=0;
            if(body->flags&b3_lockLinearY)state->linearVelocity.y=0;
            if(body->flags&b3_lockLinearZ)state->linearVelocity.z=0;
            if(body->flags&b3_lockAngularX)state->angularVelocity.x=0;
            if(body->flags&b3_lockAngularY)state->angularVelocity.y=0;
            if(body->flags&b3_lockAngularZ)state->angularVelocity.z=0;
        }
    }
}
static void read_result(b3World* world,const MotionPlan* plan,float* out) {
    b3Body* body=b3GetBodyFullId(world,plan->id);b3BodySim* sim=b3GetBodySim(world,body);
    put_pose(out,sim->transform,sim->center);
    put(out+10,b3Body_GetLinearVelocity(plan->id));put(out+13,b3Body_GetAngularVelocity(plan->id));
    put(out+16,plan->linear);put(out+19,plan->angular);
    put(out+22,plan->linearResidue);put(out+25,plan->angularResidue);
    out[28]=plan->linearDamping;out[29]=plan->angularDamping;out[30]=plan->linearCap;out[31]=plan->angularCap;
    out[32]=(float)plan->fastRotation;out[33]=(float)body->type;out[34]=body->setIndex!=b3_disabledSet;out[35]=body->setIndex==b3_awakeSet;
    put(out+36,sim->force);put(out+39,sim->torque);put(out+42,sim->localCenter);
    put_pose(out+45,plan->before,plan->beforeCenter);put(out+55,plan->beforeV);put(out+58,plan->beforeW);
}
int air_b3_motion_batch(uint32_t wid,const uint32_t* records,int count,int inputWords,
    float dt,int substeps,float* out,int capacityFloats,int apply) {
    int status=air_b3_world_unlocked(wid);if(status)return status;
    if((apply!=0&&apply!=1)||count<0||inputWords<0||capacityFloats<0||!isfinite(dt)||dt<=0||
       (substeps!=1&&substeps!=2&&substeps!=4&&substeps!=8))return AIR_B3_ARGUMENT;
    float inverse=1.0f/dt,h=dt/substeps;
    if(!isfinite(inverse)||!isfinite(2.0f*inverse)||!isfinite(substeps*inverse)||!isfinite(h)||h<=0)return AIR_B3_ARGUMENT;
    if(count>AIR_B3_MOTION_MAX_BODIES || inputWords!=count*AIR_B3_MOTION_INPUT_WORDS ||
       (apply && capacityFloats<count*AIR_B3_MOTION_OUTPUT_FLOATS))return AIR_B3_CAPACITY;
    if(!count)return AIR_B3_OK;
    size_t inputBytes=(size_t)inputWords*4,outputBytes=(size_t)count*AIR_B3_MOTION_OUTPUT_FLOATS*4;
    if(!region(records,inputBytes) || (apply && (!region(out,outputBytes)||overlap(records,inputBytes,out,outputBytes))))return AIR_B3_ARGUMENT;
    b3World* world=b3GetWorldFromId(b3LoadWorldId(wid));
    size_t bytes=(size_t)count*sizeof(MotionPlan);
    MotionPlan* plans=air_b3_bridge_temp_alloc(wid,bytes);if(!plans)return AIR_B3_ALLOCATION;
    for(int i=0;i<count;++i){
        const uint32_t* record=records+i*AIR_B3_MOTION_INPUT_WORDS;
        for(int j=0;j<i;++j)if(record[0]==records[j*AIR_B3_MOTION_INPUT_WORDS]&&record[1]==records[j*AIR_B3_MOTION_INPUT_WORDS+1]){
            status=AIR_B3_ARGUMENT;goto done;
        }
        status=make_plan(world,wid,record,dt,substeps,plans+i);if(status)goto done;
    }
    if(apply){
        /* No recoverable status branch after the first mutation. A trap/allocator failure
           has unknown completion; facade faults rather than asserting rollback or replay. */
        for(int i=0;i<count;++i)apply_plan(world,plans+i,dt);
        for(int i=0;i<count;++i)read_result(world,plans+i,out+i*AIR_B3_MOTION_OUTPUT_FLOATS);
    }
done:
    air_b3_bridge_temp_free(wid,plans,bytes);
    return status;
}
