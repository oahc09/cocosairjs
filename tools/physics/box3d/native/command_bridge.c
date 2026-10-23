/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Frozen UCM1/UCR1: entire-stream pure float planning, then nonrecoverable replay.
   No vendor changes, persistent plan, callback, queue or world step. */
#include "air_box3d.h"
#include "command_bridge.h"
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

_Static_assert(sizeof(float) == 4 && sizeof(uint32_t) == 4, "command word size");
_Static_assert(12 + 4 * 4096 + 16 * 16384 == AIR_B3_COMMAND_MAX_INPUT_WORDS, "input bound");
_Static_assert(12 + 160 * 4096 + 80 * 16384 == AIR_B3_COMMAND_MAX_OUTPUT_WORDS, "output bound");
typedef struct CommandBody {
    b3BodyId id;
    b3WorldTransform pose;
    b3Pos center;
    b3Vec3 localCenter, v, w, force, torque;
    b3Matrix3 inverseLocal, inverseWorld;
    float inverseMass, requestedMass, linearDamping, angularDamping, linearCap, angularCap;
    uint32_t locks, count, lastLow, lastHigh;
    int fastRotation, pending, fallback;
} CommandBody;
typedef struct CommandOperation {
    b3WorldTransform pose; /* normalized reset/target request, not reached target */
} CommandOperation;
static float rf(const uint32_t* p) { float f; memcpy(&f, p, 4); return f; }
static void wf(uint32_t* p, float f) { memcpy(p, &f, 4); }
static b3Vec3 rv(const uint32_t* p) { return (b3Vec3){rf(p), rf(p+1), rf(p+2)}; }
static void wv(uint32_t* p, b3Vec3 v) { wf(p,v.x); wf(p+1,v.y); wf(p+2,v.z); }
static int vok(b3Vec3 v) { return isfinite(v.x) && isfinite(v.y) && isfinite(v.z); }
static int mok(b3Matrix3 m) { return vok(m.cx) && vok(m.cy) && vok(m.cz); }
static void wp(uint32_t* p, b3WorldTransform t, b3Pos c) { wv(p,t.p); wv(p+3,t.q.v); wf(p+6,t.q.s); wv(p+7,c); }
static b3BodyId rid(const uint32_t* p) { return b3LoadBodyId(((uint64_t)p[1]<<32)|p[0]); }
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
static int pose_read(const uint32_t* p,b3WorldTransform* pose) {
    float f[7]; for(int i=0;i<7;++i) {f[i]=rf(p+i);if(!isfinite(f[i]))return AIR_B3_ARGUMENT;}
    double scale=0;for(int i=3;i<7;++i)scale=fmax(scale,fabs((double)f[i]));
    if(scale==0)return AIR_B3_ARGUMENT;
    double q[4],sum=0;for(int i=0;i<4;++i){q[i]=f[i+3]/scale;sum+=q[i]*q[i];}
    double norm=sqrt(sum);for(int i=0;i<4;++i)f[i+3]=(float)(q[i]/norm);
    *pose=(b3WorldTransform){{f[0],f[1],f[2]},{{f[3],f[4],f[5]},f[6]}};
    return b3IsValidWorldTransform(*pose)?AIR_B3_OK:AIR_B3_ARGUMENT;
}
static int pose_safe(b3World* world,const b3Body* body,const CommandBody* b,b3WorldTransform pose) {
    if(!b3IsValidWorldTransform(pose)||!vok(b3TransformWorldPoint(pose,b->localCenter)))return AIR_B3_ARGUMENT;
    b3Matrix3 r=b3MakeMatrixFromQuat(pose.q),a=b3MulMM(r,b->inverseLocal);
    if(!mok(r)||!mok(a)||!mok(b3MulMM(a,b3Transpose(r))))return AIR_B3_ARGUMENT;
    for(int i=body->headShapeId;i!=B3_NULL_INDEX;){
        const b3Shape* shape=b3Array_Get(world->shapes,i);i=shape->nextShapeId;
        if(shape->type!=b3_sphereShape&&shape->type!=b3_hullShape&&shape->type!=b3_capsuleShape)return AIR_B3_UNSUPPORTED;
        if(!isfinite(shape->aabbMargin)||shape->aabbMargin<0)return AIR_B3_ARGUMENT;
        b3AABB box=b3ComputeFatShapeAABB(shape,pose,B3_SPECULATIVE_DISTANCE);
        if(!b3IsValidAABB(box)||!b3IsValidAABB(b3AABB_Inflate(box,shape->aabbMargin)))return AIR_B3_ARGUMENT;
    }
    return 0;
}
static void mask(b3Vec3* v,b3Vec3* w,uint32_t flags) {
    if(flags&b3_lockLinearX)v->x=0;if(flags&b3_lockLinearY)v->y=0;if(flags&b3_lockLinearZ)v->z=0;
    if(flags&b3_lockAngularX)w->x=0;if(flags&b3_lockAngularY)w->y=0;if(flags&b3_lockAngularZ)w->z=0;
}
static int locks(b3Vec3* v,uint32_t* residue,uint32_t flags,int shift) {
    float p[3]={v->x,v->y,v->z};
    for(int i=0;i<3;++i)if(flags&(1u<<(i+shift))){
        if(fabsf(p[i])>1e-6f)return AIR_B3_MOTION_LOCK_CONFLICT;
        wf(residue+i,p[i]);p[i]=0;
    }
    *v=(b3Vec3){p[0],p[1],p[2]};return 0;
}
static int speed(b3Vec3 v,float cap,int capped) {
    if(!vok(v)||!isfinite(b3LengthSquared(v)))return AIR_B3_ARGUMENT;
    if(!capped)return 0;
    if(!isfinite(cap)||cap<=0||!isfinite(cap*cap))return AIR_B3_ARGUMENT;
    if(v.x==0&&v.y==0&&v.z==0)return 0;
    double margin=8.0*FLT_EPSILON*fmax(1.0,cap),magnitude=hypot(hypot((double)v.x,v.y),v.z);
    return magnitude>=(double)cap-margin?AIR_B3_MOTION_SPEED_CAP:0;
}
/* Nonallocating actual observation, with previously admitted mass metadata. No
   status branch may be introduced here after replay has begun. Reacquire after wake. */
static void state_read(b3World* world,const CommandBody* b,uint32_t* out) {
    b3Body* body=b3GetBodyFullId(world,b->id);b3BodySim* sim=b3GetBodySim(world,body);
    wf(out,body->type);wf(out+1,body->setIndex!=b3_disabledSet);wf(out+2,body->setIndex==b3_awakeSet);
    wf(out+3,body->setIndex>=b3_firstSleepingSet);
    wf(out+4,body->setIndex!=b3_disabledSet&&body->setIndex==b3_awakeSet&&body->type!=b3_staticBody&&world->enableSleep&&(body->flags&b3_enableSleep)&&body->sleepTime>0);
    wf(out+5,(body->flags&b3_enableSleep)!=0);wf(out+6,b3Body_IsBullet(b->id));
    wf(out+7,body->sleepTime);wf(out+8,body->sleepVelocity);wf(out+9,body->sleepThreshold);
    wf(out+10,sim->linearDamping);wf(out+11,sim->angularDamping);wf(out+12,sim->gravityScale);
    wv(out+13,b3Body_GetLinearVelocity(b->id));wv(out+16,b3Body_GetAngularVelocity(b->id));wv(out+19,sim->force);wv(out+22,sim->torque);
    b3MotionLocks l=b3Body_GetMotionLocks(b->id);float factors[6]={!l.linearX,!l.linearY,!l.linearZ,!l.angularX,!l.angularY,!l.angularZ};
    for(int i=0;i<6;++i)wf(out+25+i,factors[i]);
    wf(out+31,body->mass);wv(out+32,sim->localCenter);wv(out+35,sim->inertia.cx);wv(out+38,sim->inertia.cy);wv(out+41,sim->inertia.cz);wv(out+44,sim->center);
    wf(out+47,b->pending);wf(out+48,b->fallback);
}
static int body_start(b3World* world,uint32_t wid,const uint32_t* row,float dt,CommandBody* b,uint32_t* out) {
    b->id=rid(row);b->requestedMass=rf(row+2);
    b3Body* body=b3GetBodyFullId(world,b->id);b3BodySim* sim=b3GetBodySim(world,body);
    float state[49];int status=air_b3_body_state(wid,row[0],row[1],b->requestedMass,state);if(status)return status;
    for(int i=0;i<49;++i)if(!isfinite(state[i]))return AIR_B3_ARGUMENT;
    b->pending=state[47]!=0;b->fallback=state[48]!=0;
    b->pose=sim->transform;b->center=sim->center;b->localCenter=sim->localCenter;
    b->v=b3Body_GetLinearVelocity(b->id);b->w=b3Body_GetAngularVelocity(b->id);b->force=sim->force;b->torque=sim->torque;
    b->inverseLocal=sim->invInertiaLocal;b->inverseWorld=sim->invInertiaWorld;b->inverseMass=sim->invMass;
    b->locks=body->flags;b->linearDamping=sim->linearDamping;b->angularDamping=sim->angularDamping;
    b->linearCap=world->maxLinearSpeed;b->fastRotation=(body->flags&b3_allowFastRotation)!=0;
    b->angularCap=b->fastRotation?0:B3_MAX_ROTATION*(1.0f/dt);
    if(!b3IsValidWorldTransform(b->pose)||!vok(b->center)||!vok(b->localCenter)||!mok(b->inverseLocal)||!mok(b->inverseWorld)||
       !isfinite(b->inverseMass)||b->inverseMass<0||!isfinite(b->linearCap)||b->linearCap<=0||!isfinite(b->angularCap))return AIR_B3_ARGUMENT;
    out[0]=row[0];out[1]=row[1];wp(out+4,b->pose,b->center);for(int i=0;i<49;++i)wf(out+14+i,state[i]);
    return 0;
}
/* Structural and ownership admission uses only a 4096-byte bounded stack table.
   No tracked allocation is made before all table rows/canonical order are checked. */
static int rows(b3World* world,uint32_t wid,const uint32_t* input,uint32_t count,uint32_t operations) {
    const uint32_t* bodies=input+12;const uint32_t* ops=bodies+4*count;
    for(uint32_t i=0;i<count;++i){const uint32_t* row=bodies+4*i;b3BodyId id=rid(row);
        if(!b3Body_IsValid(id)||b3StoreWorldId(b3Body_GetWorld(id))!=wid)return AIR_B3_INVALID;
        float mass=rf(row+2);if(row[3]||!isfinite(mass)||mass<0)return AIR_B3_ARGUMENT;
        for(uint32_t j=0;j<i;++j)if(row[0]==bodies[4*j]&&row[1]==bodies[4*j+1])return AIR_B3_ARGUMENT;
        int s=air_b3_body_mass_ready(wid,row[0],row[1],mass);if(s)return s;
    }
    unsigned char seen[AIR_B3_COMMAND_MAX_BODIES]={0};uint32_t next=0;uint64_t sequence=0;
    for(uint32_t i=0;i<operations;++i){const uint32_t* op=ops+16*i;
        uint32_t bi=op[0],kind=op[1],flags=op[2];if(bi>=count||kind<1||kind>10)return AIR_B3_ARGUMENT;
        int end=5,internal=0;
        if(kind<=4){if(flags&~1u)return AIR_B3_ARGUMENT;end=(kind==1||kind==3)?11:8;}
        else if(kind<=7){if(flags)return AIR_B3_ARGUMENT;}
        else if(kind==8){if(flags&~14u)return AIR_B3_ARGUMENT;end=12;internal=(flags&8)!=0;}
        else if(kind==9){if(flags)return AIR_B3_ARGUMENT;end=12;}
        else {if(flags!=0&&flags!=16&&flags!=32)return AIR_B3_ARGUMENT;internal=flags!=0;}
        uint64_t seq=((uint64_t)op[4]<<32)|op[3];
        if(internal?seq!=0:(seq==0||seq>UINT64_C(9007199254740991)||seq<=sequence))return AIR_B3_ARGUMENT;
        if(!internal)sequence=seq;
        for(int j=5;j<end;++j)if(!isfinite(rf(op+j)))return AIR_B3_ARGUMENT;
        for(int j=end;j<16;++j)if(op[j])return AIR_B3_ARGUMENT;
        if(!seen[bi]){if(bi!=next++)return AIR_B3_ARGUMENT;seen[bi]=1;}
        if(seen[bi]&8)return AIR_B3_ARGUMENT; /* protected cleanup is last */
        if(kind==8||kind==6||kind==7){if(seen[bi]&2)return AIR_B3_ARGUMENT;seen[bi]|=4;}
        if(kind==9||kind==10){if(seen[bi]&2)return AIR_B3_ARGUMENT;
            if(flags==16&&(seen[bi]&4))return AIR_B3_ARGUMENT;seen[bi]|=2;if(flags==32)seen[bi]|=8;}
        b3Body* body=b3GetBodyFullId(world,rid(bodies+4*bi));
        if(kind<=4&&(body->type!=b3_dynamicBody||body->setIndex==b3_disabledSet))return AIR_B3_UNSUPPORTED;
        if(kind==8&&(((flags&8)!=0)!=(body->type==b3_staticBody)))return AIR_B3_UNSUPPORTED;
        if(kind>=9&&(body->type!=b3_kinematicBody||body->setIndex==b3_disabledSet))return AIR_B3_UNSUPPORTED;
    }
    return next==count?0:AIR_B3_ARGUMENT;
}
static int plan_op(b3World* world,CommandBody* b,const uint32_t* op,float dt,int substeps,CommandOperation* saved,uint32_t* out) {
    uint32_t kind=op[1],flags=op[2];memcpy(out,op,5*4);wp(out+8,b->pose,b->center);
    b3Vec3 v=b3Vec3_zero,point=b3Vec3_zero,lever=b3Vec3_zero,effect=b3Vec3_zero;
    if(kind<=4){
        v=rv(op+5);if(flags&1)v=b3RotateVector(b->pose.q,v);if(!vok(v))return AIR_B3_ARGUMENT;
        if(kind==1||kind==3){b3Vec3 offset=rv(op+8);if(flags&1)offset=b3RotateVector(b->pose.q,offset);
            if(!vok(offset))return AIR_B3_ARGUMENT;point=b3OffsetPos(b->center,offset);lever=b3SubPos(point,b->center);effect=b3Cross(lever,v);
            if(!vok(point)||!vok(lever)||!vok(effect))return AIR_B3_ARGUMENT;
        }else effect=v;
        wv(out+18,v);if(kind==1||kind==3){wv(out+21,point);wv(out+24,lever);}wv(out+27,effect);out[5]|=2;
        if(kind==1){b->force=b3Add(b->force,v);b->torque=b3Add(b->torque,effect);}
        if(kind==2)b->torque=b3Add(b->torque,v);
        if(kind==3){
            b3Vec3 product=b3MulSV(b->inverseMass,v);if(!vok(product))return AIR_B3_ARGUMENT;
            b->v=b3MulAdd(b->v,b->inverseMass,v);float length=b3LengthSquared(b->v),cap2=b->linearCap*b->linearCap;
            if(!vok(b->v)||!isfinite(length)||!isfinite(cap2))return AIR_B3_ARGUMENT;
            if(length>cap2){b->v=b3MulSV(b->linearCap,b3Normalize(b->v));out[5]|=1;}
            b3Vec3 delta=b3MulMV(b->inverseWorld,effect);if(!vok(delta))return AIR_B3_ARGUMENT;b->w=b3Add(b->w,delta);
        }
        if(kind==4){b3Vec3 local=b3InvRotateVector(b->pose.q,v),deltaLocal=b3MulMV(b->inverseLocal,local),delta=b3RotateVector(b->pose.q,deltaLocal);
            if(!vok(local)||!vok(deltaLocal)||!vok(delta))return AIR_B3_ARGUMENT;b->w=b3Add(b->w,delta);}
        if(!vok(b->v)||!vok(b->w)||!vok(b->force)||!vok(b->torque))return AIR_B3_ARGUMENT;
        if(kind==3||kind==4){mask(&b->v,&b->w,b->locks);out[5]|=4;}
    }else if(kind<=7||kind==10){
        if(kind==5||kind==7)b->force=b->torque=b3Vec3_zero;
        if(kind!=5)b->v=b->w=b3Vec3_zero;
    }else{
        int status=pose_read(op+5,&saved->pose);if(status)return status;
        b3Body* body=b3GetBodyFullId(world,b->id);status=pose_safe(world,body,b,saved->pose);if(status)return status;
        if(kind==8){b->pose=saved->pose;b->center=b3TransformWorldPoint(b->pose,b->localCenter);
            b3Matrix3 r=b3MakeMatrixFromQuat(b->pose.q);b->inverseWorld=b3MulMM(b3MulMM(r,b->inverseLocal),b3Transpose(r));
            if(!(flags&2))b->v=b->w=b3Vec3_zero;out[5]|=16;
            if((flags&4)&&body->type!=b3_staticBody&&body->setIndex!=b3_disabledSet)out[5]|=2;
        }else{
            float h=dt/substeps,inverse=1.0f/dt;
            if(!isfinite(b->linearDamping)||b->linearDamping<0||!isfinite(b->angularDamping)||b->angularDamping<0||
               !isfinite(h*b->linearDamping)||!isfinite(h*b->angularDamping)||!isfinite(1.0f+h*b->linearDamping)||!isfinite(1.0f+h*b->angularDamping))return AIR_B3_ARGUMENT;
            b3Vec3 distance=b3SubPos(b3TransformWorldPoint(saved->pose,b->localCenter),b->center);if(!vok(distance))return AIR_B3_ARGUMENT;
            b->v=b3MulSV(inverse,distance);b3Quat q=saved->pose.q;if(b3DotQuat(b->pose.q,q)<0)q=b3NegateQuat(q);
            b3Quat difference={b3Sub(q.v,b->pose.q.v),q.s-b->pose.q.s},product=b3MulQuat(difference,b3Conjugate(b->pose.q));
            if(!vok(difference.v)||!isfinite(difference.s)||!vok(product.v)||!isfinite(product.s))return AIR_B3_ARGUMENT;
            b->w=b3MulSV(2.0f*inverse,product.v);
            status=speed(b->v,b->linearCap,1);if(status)return status;status=speed(b->w,b->angularCap,!b->fastRotation);if(status)return status;
            b3Vec3 delta=b3MulSV(dt,b->v),rotation=b3MulSV(h,b->w);
            if(!vok(delta)||!vok(rotation)||!isfinite(b3LengthSquared(rotation))||!vok(b3OffsetPos(b->center,delta)))return AIR_B3_ARGUMENT;
        }
        if(!vok(b->v)||!vok(b->w))return AIR_B3_ARGUMENT;
        status=locks(&b->v,out+42,b->locks,0);if(status)return status;status=locks(&b->w,out+45,b->locks,3);if(status)return status;
        if(kind==9){if(b->v.x==0&&b->v.y==0&&b->v.z==0&&b->w.x==0&&b->w.y==0&&b->w.z==0)out[5]|=8;else out[5]|=2;}
    }
    wv(out+30,b->v);wv(out+33,b->w);wv(out+36,b->force);wv(out+39,b->torque);
    ++b->count;b->lastLow=op[3];b->lastHigh=op[4];return 0;
}
static void replay(b3World* world,const CommandBody* b,const uint32_t* op,const CommandOperation* saved,float dt,uint32_t* out) {
    uint32_t kind=op[1],flags=op[2];
    if(kind==1)b3Body_ApplyForce(b->id,rv(out+18),rv(out+21),true);
    else if(kind==2)b3Body_ApplyTorque(b->id,rv(out+18),true);
    else if(kind==3)b3Body_ApplyLinearImpulse(b->id,rv(out+18),rv(out+21),true);
    else if(kind==4)b3Body_ApplyAngularImpulse(b->id,rv(out+18),true);
    else if(kind==8){b3Body_SetTransform(b->id,saved->pose.p,saved->pose.q);
        b3Body* body=b3GetBodyFullId(world,b->id);
        if((flags&4)&&body->type!=b3_staticBody&&body->setIndex!=b3_disabledSet)b3Body_SetAwake(b->id,true);
    }else if(kind==9&&!(out[5]&8)){b3Body_SetAwake(b->id,true);b3Body_SetTargetTransform(b->id,saved->pose,dt,true);}
    b3Body* body=b3GetBodyFullId(world,b->id);b3BodySim* sim=b3GetBodySim(world,body);b3BodyState* state=b3GetBodyState(world,body);
    if(kind==5||kind==7)sim->force=sim->torque=b3Vec3_zero;
    if(state){
        if(kind==6||kind==7||kind==8||kind==10||(kind==9&&(out[5]&8))){state->linearVelocity=rv(out+30);state->angularVelocity=rv(out+33);}
        else if(kind==3||kind==4||kind==9)mask(&state->linearVelocity,&state->angularVelocity,body->flags);
    }
    wv(out+48,b3Body_GetLinearVelocity(b->id));wv(out+51,b3Body_GetAngularVelocity(b->id));wv(out+54,sim->force);wv(out+57,sim->torque);
    out[60]=body->setIndex==b3_awakeSet;out[61]=body->setIndex!=b3_disabledSet;wp(out+64,sim->transform,sim->center);
}
int air_b3_command_batch(uint32_t wid,const uint32_t* input,int inputWords,uint32_t* output,int capacity,int apply) {
    int status=air_b3_world_unlocked(wid);if(status)return status;
    if((apply!=0&&apply!=1)||inputWords<0||capacity<0)return AIR_B3_ARGUMENT;
    if(inputWords<12||inputWords>AIR_B3_COMMAND_MAX_INPUT_WORDS)return AIR_B3_CAPACITY;
    size_t inputBytes=(size_t)inputWords*4;if(!region(input,inputBytes))return AIR_B3_ARGUMENT;
    if(input[0]!=AIR_B3_COMMAND_INPUT_MAGIC||input[1]!=1||input[2]!=(uint32_t)inputWords)return AIR_B3_ARGUMENT;
    uint32_t count=input[3],operations=input[4];
    if(count>AIR_B3_COMMAND_MAX_BODIES||operations>AIR_B3_COMMAND_MAX_OPERATIONS)return AIR_B3_CAPACITY;
    if(input[5]!=4||input[6]!=16||input[7]!=12||input[8]!=12+4*count||input[11])return AIR_B3_ARGUMENT;
    if((uint32_t)inputWords!=12+4*count+16*operations)return AIR_B3_CAPACITY;
    float dt=rf(input+9);int substeps=(int)input[10];
    if(!isfinite(dt)||dt<=0||(substeps!=1&&substeps!=2&&substeps!=4&&substeps!=8))return AIR_B3_ARGUMENT;
    float inverse=1.0f/dt,h=dt/substeps;
    if(!isfinite(inverse)||!isfinite(2.0f*inverse)||!isfinite(substeps*inverse)||!isfinite(h)||h<=0)return AIR_B3_ARGUMENT;
    uint32_t words=12+160*count+80*operations;size_t outputBytes=0;
    if(!apply||!operations){if(output||capacity)return AIR_B3_ARGUMENT;}
    else {
        if(capacity<(int)words||capacity>AIR_B3_COMMAND_MAX_OUTPUT_WORDS)return AIR_B3_CAPACITY;
        outputBytes=(size_t)capacity*4;
        if(!region(output,outputBytes)||overlap(input,inputBytes,output,outputBytes))return AIR_B3_ARGUMENT;
    }
    if((count==0)!=(operations==0))return AIR_B3_ARGUMENT;
    b3World* world=b3GetWorldFromId(b3LoadWorldId(wid));status=rows(world,wid,input,count,operations);if(status)return status;
    if(!operations)return 0;
    size_t bodyBytes=(size_t)count*sizeof(CommandBody),opBytes=(size_t)operations*sizeof(CommandOperation),resultBytes=(size_t)words*4;
    CommandBody* bodies=air_b3_bridge_temp_alloc(wid,bodyBytes);if(!bodies)return AIR_B3_ALLOCATION;
    CommandOperation* plans=air_b3_bridge_temp_alloc(wid,opBytes);uint32_t* result=NULL;
    if(!plans){status=AIR_B3_ALLOCATION;goto done;}
    result=air_b3_bridge_temp_alloc(wid,resultBytes);if(!result){status=AIR_B3_ALLOCATION;goto done;}
    memset(bodies,0,bodyBytes);memset(plans,0,opBytes);memset(result,0,resultBytes);
    uint32_t* bodyResults=result+12;uint32_t* opResults=bodyResults+160*count;const uint32_t* ops=input+12+4*count;
    for(uint32_t i=0;i<count;++i){status=body_start(world,wid,input+12+4*i,dt,bodies+i,bodyResults+160*i);if(status)goto done;}
    for(uint32_t i=0;i<operations;++i){status=plan_op(world,bodies+ops[16*i],ops+16*i,dt,substeps,plans+i,opResults+80*i);if(status)goto done;}
    if(apply){
        /* No known return/fallible admission after this point. A core trap is unknown.
           Awake flags are not shadow predictions: island wake can affect peers. */
        for(uint32_t i=0;i<operations;++i)replay(world,bodies+ops[16*i],ops+16*i,plans+i,dt,opResults+80*i);
        for(uint32_t i=0;i<count;++i){CommandBody* b=bodies+i;uint32_t* out=bodyResults+160*i;
            b3Body* body=b3GetBodyFullId(world,b->id);b3BodySim* sim=b3GetBodySim(world,body);
            out[2]=b->count;wp(out+63,b->pose,b->center);wv(out+73,b->v);wv(out+76,b->w);wv(out+79,b->force);wv(out+82,b->torque);
            wp(out+85,sim->transform,sim->center);state_read(world,b,out+95);
            wv(out+144,b->inverseWorld.cx);wv(out+147,b->inverseWorld.cy);wv(out+150,b->inverseWorld.cz);
            wf(out+153,b->inverseMass);wf(out+154,b->requestedMass);wf(out+155,b->linearCap);wf(out+156,b->angularCap);
            out[157]=b->fastRotation;out[158]=b->lastLow;out[159]=b->lastHigh;
        }
        uint32_t header[12]={AIR_B3_COMMAND_OUTPUT_MAGIC,1,words,count,operations,160,80,12,12+160*count,1,0,0};
        memcpy(result,header,sizeof(header));memcpy(output,result,resultBytes);
    }
done:
    if(result)air_b3_bridge_temp_free(wid,result,resultBytes);
    if(plans)air_b3_bridge_temp_free(wid,plans,opBytes);
    air_b3_bridge_temp_free(wid,bodies,bodyBytes);return status;
}
