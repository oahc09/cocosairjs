/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#include "air_box3d.h"
#include "hinge_bridge.h"
#include "joint.h"
#include "physics_world.h"
#include <box3d/box3d.h>
#include <math.h>
#include <stddef.h>
#include <string.h>

_Static_assert(sizeof(float) == sizeof(uint32_t), "float32 wire required");
_Static_assert(sizeof(b3JointId) == 8, "Review full joint ID layout");
_Static_assert(sizeof(((b3RevoluteJoint*)0)->perpImpulse) == 2 * sizeof(float), "Review pinned revolute impulse layout");
_Static_assert(sizeof(((b3RevoluteJoint*)0)->rotationAxisZ) == 3 * sizeof(float), "Review pinned revolute basis layout");
static uint64_t join(uint32_t lo, uint32_t hi) { return (uint64_t)lo | ((uint64_t)hi << 32); }
static int aligned(const void* p) { return p && (uintptr_t)p % sizeof(uint32_t) == 0; }
static void put_float(uint32_t* p, float v) { memcpy(p, &v, sizeof(v)); }
static float get_float(const uint32_t* p) { float v; memcpy(&v, p, sizeof(v)); return v; }
static void put_id(uint32_t* p, uint64_t id) { p[0]=(uint32_t)id; p[1]=(uint32_t)(id>>32); }
static void put_vec(uint32_t* p, b3Vec3 v) { put_float(p,v.x);put_float(p+1,v.y);put_float(p+2,v.z); }
static void put_frame(uint32_t* p, b3Transform t) { put_vec(p,t.p);put_vec(p+3,t.q.v);put_float(p+6,t.q.s); }
typedef struct { int collide,limit,motor; float lower,upper,speed,torque; } HingeConfig;
static int copy_config(const uint32_t* p, int count, HingeConfig* c) {
    if (!aligned(p) || count != AIR_B3_HINGE_CONFIG_WORDS) return AIR_B3_ARGUMENT;
    uint32_t w[AIR_B3_HINGE_CONFIG_WORDS];memcpy(w,p,sizeof(w));
    if (w[0]>1 || w[1]>1 || w[4]>1) return AIR_B3_ARGUMENT;
    *c=(HingeConfig){(int)w[0],(int)w[1],(int)w[4],get_float(w+2),get_float(w+3),get_float(w+5),get_float(w+6)};
    const float bound=0.99f*B3_PI;
    if (!isfinite(c->lower)||!isfinite(c->upper)||!isfinite(c->speed)||!isfinite(c->torque)
        ||c->lower>c->upper||c->lower < -bound||c->upper>bound||c->torque<0) return AIR_B3_ARGUMENT;
    return AIR_B3_OK;
}
static int owned_body(uint32_t world,b3BodyId id) {return id.index1>0&&b3Body_IsValid(id)&&b3StoreWorldId(b3Body_GetWorld(id))==world;}
static int owned_hinge(uint32_t world,uint32_t lo,uint32_t hi,b3JointId* joint) {
    int status=air_b3_world_unlocked(world);if(status)return status;
    *joint=b3LoadJointId(join(lo,hi));
    if(joint->index1<=0||!b3Joint_IsValid(*joint)||b3StoreWorldId(b3Joint_GetWorld(*joint))!=world)return AIR_B3_INVALID;
    if(b3Joint_GetType(*joint)!=b3_revoluteJoint)return AIR_B3_UNSUPPORTED;
    return AIR_B3_OK;
}
static int valid_frame(b3Transform t) {
    float norm=b3Dot(t.q.v,t.q.v)+t.q.s*t.q.s;
    return isfinite(t.p.x)&&isfinite(t.p.y)&&isfinite(t.p.z)&&isfinite(norm)&&fabsf(norm-1.0f)<=1e-4f;
}
/* Pinned core efca0c184d40fd6a82016983f1601c4d23965867, staged source identity
   is checked by the build/audit lock. The upstream generic revolute torque getter
   both adds the axial impulse twice and overwrites the solver's final perp axes.
   Read the current retained solver cache without calling that getter or changing it.
   This is the world-space angular constraint couple on B, in N.m, excluding the
   separate linear constraint force's r x F about a body's COM. It is not an
   entire-outer-step average. Configuration can clear individual impulse terms;
   sleeping joints retain old cache while world.inv_h may change. There is no
   per-joint freshness tracking: this is not a current-load sensor/break input.
   The exact world/type/generation/unlocked admission above precedes this read. */
static b3Vec3 copied_constraint_couple(uint32_t world, b3JointId id) {
    const b3World* w = b3GetWorldFromId(b3LoadWorldId(world));
    const b3JointSim* sim = b3GetJointSimCheckType(id, b3_revoluteJoint);
    const b3RevoluteJoint* h = &sim->revoluteJoint;
    const float axial = h->springImpulse + h->motorImpulse + h->lowerImpulse - h->upperImpulse;
    b3Vec3 impulse = b3Add(b3MulSV(h->perpImpulse.x, h->perpAxisX), b3MulSV(h->perpImpulse.y, h->perpAxisY));
    impulse = b3MulAdd(impulse, axial, h->rotationAxisZ);
    return b3MulSV(w->inv_h, impulse);
}
int air_b3_hinge_create(uint32_t world,uint32_t alo,uint32_t ahi,uint32_t blo,uint32_t bhi,
    const float* geometry,int geometry_count,int auto_pivot_b,const uint32_t* config,int config_count,uint32_t* out) {
    int status=air_b3_world_unlocked(world);if(status)return status;
    if(!aligned(geometry)||geometry_count!=AIR_B3_HINGE_GEOMETRY_FLOATS||!aligned(out)
        ||(auto_pivot_b!=0&&auto_pivot_b!=1))return AIR_B3_ARGUMENT;
    HingeConfig c;status=copy_config(config,config_count,&c);if(status)return status;
    float g[AIR_B3_HINGE_GEOMETRY_FLOATS];memcpy(g,geometry,sizeof(g));
    for(int i=0;i<AIR_B3_HINGE_GEOMETRY_FLOATS;++i)if(!isfinite(g[i]))return AIR_B3_ARGUMENT;
    double length=hypot(hypot((double)g[6],(double)g[7]),(double)g[8]);
    if(!(length>0.0)||!isfinite(length))return AIR_B3_ARGUMENT;
    b3Vec3 axis={(float)(g[6]/length),(float)(g[7]/length),(float)(g[8]/length)};
    b3BodyId a=b3LoadBodyId(join(alo,ahi)),b=b3LoadBodyId(join(blo,bhi));
    if(!owned_body(world,a)||!owned_body(world,b))return AIR_B3_INVALID;
    if(join(alo,ahi)==join(blo,bhi))return AIR_B3_ARGUMENT;
    b3WorldTransform ta=b3Body_GetTransform(a),tb=b3Body_GetTransform(b);
    b3Transform fa={{g[0],g[1],g[2]},b3ComputeQuatBetweenUnitVectors((b3Vec3){0,0,1},axis)};
    b3WorldTransform wa=b3MulWorldTransforms(ta,fa);
    b3Transform fb=b3InvMulWorldTransforms(tb,wa);
    if(!auto_pivot_b)fb.p=(b3Vec3){g[3],g[4],g[5]};
    if(!valid_frame(fa)||!valid_frame(fb))return AIR_B3_ARGUMENT;
    b3RevoluteJointDef def=b3DefaultRevoluteJointDef();
    def.base.bodyIdA=a;def.base.bodyIdB=b;def.base.localFrameA=fa;def.base.localFrameB=fb;
    def.base.collideConnected=c.collide!=0;
    def.enableSpring=false;def.enableLimit=c.limit!=0;def.lowerAngle=c.lower;def.upperAngle=c.upper;
    def.enableMotor=c.motor!=0;def.motorSpeed=c.speed;def.maxMotorTorque=c.torque;
    b3JointId joint=b3CreateRevoluteJoint(b3LoadWorldId(world),&def);
    if(!b3Joint_IsValid(joint))return AIR_B3_CREATION;
    put_id(out,b3StoreJointId(joint));return AIR_B3_OK;
}
int air_b3_hinge_configure(uint32_t world,uint32_t lo,uint32_t hi,const uint32_t* config,int config_count) {
    b3JointId joint;int status=owned_hinge(world,lo,hi,&joint);if(status)return status;
    HingeConfig c;status=copy_config(config,config_count,&c);if(status)return status;
    /* All copied input validation precedes every native mutation. Preserve local frames/zero reference. */
    b3Joint_SetCollideConnected(joint,c.collide!=0);
    b3RevoluteJoint_SetLimits(joint,c.lower,c.upper);b3RevoluteJoint_EnableLimit(joint,c.limit!=0);
    b3RevoluteJoint_SetMotorSpeed(joint,c.speed);b3RevoluteJoint_SetMaxMotorTorque(joint,c.torque);
    b3RevoluteJoint_EnableMotor(joint,c.motor!=0);b3Joint_WakeBodies(joint);return AIR_B3_OK;
}
int air_b3_hinge_state(uint32_t world,uint32_t lo,uint32_t hi,uint32_t* out,int capacity) {
    b3JointId joint;int status=owned_hinge(world,lo,hi,&joint);if(status)return status;
    if(!aligned(out)||capacity<0)return AIR_B3_ARGUMENT;
    if(capacity<AIR_B3_HINGE_STATE_WORDS)return AIR_B3_CAPACITY;
    uint32_t copy[AIR_B3_HINGE_STATE_WORDS]={2};
    b3BodyId a=b3Joint_GetBodyA(joint),b=b3Joint_GetBodyB(joint);
    b3Transform fa=b3Joint_GetLocalFrameA(joint),fb=b3Joint_GetLocalFrameB(joint);
    put_id(copy+1,b3StoreBodyId(a));put_id(copy+3,b3StoreBodyId(b));copy[5]=b3Joint_GetCollideConnected(joint);
    put_frame(copy+6,fa);put_frame(copy+13,fb);copy[20]=b3RevoluteJoint_IsLimitEnabled(joint);
    put_float(copy+21,b3RevoluteJoint_GetLowerLimit(joint));put_float(copy+22,b3RevoluteJoint_GetUpperLimit(joint));
    copy[23]=b3RevoluteJoint_IsMotorEnabled(joint);put_float(copy+24,b3RevoluteJoint_GetMotorSpeed(joint));
    put_float(copy+25,b3RevoluteJoint_GetMaxMotorTorque(joint));put_float(copy+26,b3RevoluteJoint_GetAngle(joint));
    put_float(copy+27,b3RevoluteJoint_GetMotorTorque(joint));put_vec(copy+28,b3Joint_GetConstraintForce(joint));
    put_vec(copy+31,copied_constraint_couple(world,joint));put_float(copy+34,b3Joint_GetLinearSeparation(joint));
    b3Vec3 za=b3RotateVector(b3MulQuat(b3Body_GetRotation(a),fa.q),(b3Vec3){0,0,1});
    b3Vec3 zb=b3RotateVector(b3MulQuat(b3Body_GetRotation(b),fb.q),(b3Vec3){0,0,1});
    b3Vec3 cross=b3Cross(za,zb);
    put_float(copy+35,atan2f(sqrtf(b3Dot(cross,cross)),b3Dot(za,zb)));
    for(int i=6;i<AIR_B3_HINGE_STATE_WORDS;++i)if(i!=20&&i!=23&&!isfinite(get_float(copy+i)))return AIR_B3_UNSUPPORTED;
    memcpy(out,copy,sizeof(copy));return AIR_B3_OK;
}
