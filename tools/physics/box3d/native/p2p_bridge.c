/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#include "air_box3d.h"
#include "p2p_bridge.h"
#include <box3d/box3d.h>
#include <math.h>
#include <stddef.h>
#include <string.h>

_Static_assert(sizeof(float) == sizeof(uint32_t), "float32 wire required");
_Static_assert(sizeof(b3JointId) == 8, "Review full joint ID layout");
static uint64_t join(uint32_t lo, uint32_t hi) { return (uint64_t)lo | ((uint64_t)hi << 32); }
static int aligned(const void* p) { return p && (uintptr_t)p % sizeof(uint32_t) == 0; }
static void put_float(uint32_t* p, float v) { memcpy(p, &v, sizeof(v)); }
static void put_id(uint32_t* p, uint64_t id) { p[0]=(uint32_t)id; p[1]=(uint32_t)(id>>32); }
static void put_vec(uint32_t* p, b3Vec3 v) { put_float(p,v.x);put_float(p+1,v.y);put_float(p+2,v.z); }
static void put_frame(uint32_t* p, b3Transform t) { put_vec(p,t.p);put_vec(p+3,t.q.v);put_float(p+6,t.q.s); }
static int owned_body(uint32_t world,b3BodyId id) {return id.index1>0&&b3Body_IsValid(id)&&b3StoreWorldId(b3Body_GetWorld(id))==world;}
static int owned_p2p(uint32_t world,uint32_t lo,uint32_t hi,b3JointId* joint) {
    int status=air_b3_world_unlocked(world);if(status)return status;
    *joint=b3LoadJointId(join(lo,hi));
    if(joint->index1<=0||!b3Joint_IsValid(*joint)||b3StoreWorldId(b3Joint_GetWorld(*joint))!=world)return AIR_B3_INVALID;
    if(b3Joint_GetType(*joint)!=b3_sphericalJoint)return AIR_B3_UNSUPPORTED;
    return AIR_B3_OK;
}
static int finite_vec(b3Vec3 v) {return isfinite(v.x)&&isfinite(v.y)&&isfinite(v.z);}
int air_b3_p2p_create(uint32_t world,uint32_t alo,uint32_t ahi,uint32_t blo,uint32_t bhi,
    const float* geometry,int geometry_count,int auto_pivot_b,int collide,uint32_t* out) {
    int status=air_b3_world_unlocked(world);if(status)return status;
    if(!aligned(geometry)||geometry_count!=AIR_B3_P2P_GEOMETRY_FLOATS||!aligned(out)
        ||(auto_pivot_b!=0&&auto_pivot_b!=1)||(collide!=0&&collide!=1))return AIR_B3_ARGUMENT;
    float g[AIR_B3_P2P_GEOMETRY_FLOATS];memcpy(g,geometry,sizeof(g));
    for(int i=0;i<AIR_B3_P2P_GEOMETRY_FLOATS;++i)if(!isfinite(g[i]))return AIR_B3_ARGUMENT;
    b3BodyId a=b3LoadBodyId(join(alo,ahi)),b=b3LoadBodyId(join(blo,bhi));
    if(!owned_body(world,a)||!owned_body(world,b))return AIR_B3_INVALID;
    if(join(alo,ahi)==join(blo,bhi))return AIR_B3_ARGUMENT;
    b3Transform fa={{g[0],g[1],g[2]},b3Quat_identity};
    b3Transform fb={{g[3],g[4],g[5]},b3Quat_identity};
    if(auto_pivot_b) {
        const b3WorldTransform wa=b3MulWorldTransforms(b3Body_GetTransform(a),fa);
        fb.p=b3InvMulWorldTransforms(b3Body_GetTransform(b),wa).p;
    }
    if(!finite_vec(fa.p)||!finite_vec(fb.p))return AIR_B3_ARGUMENT;
    b3SphericalJointDef def=b3DefaultSphericalJointDef();
    def.base.bodyIdA=a;def.base.bodyIdB=b;def.base.localFrameA=fa;def.base.localFrameB=fb;
    def.base.collideConnected=collide!=0;
    def.enableSpring=false;def.enableMotor=false;def.enableConeLimit=false;def.enableTwistLimit=false;
    b3JointId joint=b3CreateSphericalJoint(b3LoadWorldId(world),&def);
    if(!b3Joint_IsValid(joint))return AIR_B3_CREATION;
    put_id(out,b3StoreJointId(joint));return AIR_B3_OK;
}
int air_b3_p2p_configure(uint32_t world,uint32_t lo,uint32_t hi,int collide) {
    b3JointId joint;int status=owned_p2p(world,lo,hi,&joint);if(status)return status;
    if(collide!=0&&collide!=1)return AIR_B3_ARGUMENT;
    b3Joint_SetCollideConnected(joint,collide!=0);b3Joint_WakeBodies(joint);return AIR_B3_OK;
}
int air_b3_p2p_state(uint32_t world,uint32_t lo,uint32_t hi,uint32_t* out,int capacity) {
    b3JointId joint;int status=owned_p2p(world,lo,hi,&joint);if(status)return status;
    if(!aligned(out)||capacity<0)return AIR_B3_ARGUMENT;
    if(capacity<AIR_B3_P2P_STATE_WORDS)return AIR_B3_CAPACITY;
    uint32_t copy[AIR_B3_P2P_STATE_WORDS]={3};
    const b3BodyId a=b3Joint_GetBodyA(joint),b=b3Joint_GetBodyB(joint);
    put_id(copy+1,b3StoreBodyId(a));put_id(copy+3,b3StoreBodyId(b));copy[5]=b3Joint_GetCollideConnected(joint);
    put_frame(copy+6,b3Joint_GetLocalFrameA(joint));put_frame(copy+13,b3Joint_GetLocalFrameB(joint));
    copy[20]=b3SphericalJoint_IsSpringEnabled(joint);copy[21]=b3SphericalJoint_IsMotorEnabled(joint);
    copy[22]=b3SphericalJoint_IsConeLimitEnabled(joint);copy[23]=b3SphericalJoint_IsTwistLimitEnabled(joint);
    put_float(copy+24,b3Joint_GetLinearSeparation(joint));
    for(int i=6;i<20;++i) { float value;memcpy(&value,copy+i,sizeof(value));if(!isfinite(value))return AIR_B3_UNSUPPORTED; }
    float separation;memcpy(&separation,copy+24,sizeof(separation));
    if(!isfinite(separation)||separation<0)return AIR_B3_UNSUPPORTED;
    memcpy(out,copy,sizeof(copy));return AIR_B3_OK;
}
