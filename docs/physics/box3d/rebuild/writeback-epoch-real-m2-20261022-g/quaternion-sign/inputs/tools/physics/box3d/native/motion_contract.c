/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Real native motion qualification. Allocator/raw-state setup is isolated to this executable. */
#define AIR_B3_BRIDGE_QUALIFICATION
#include "world_bridge.c"
#include "body.h"
#include "physics_world.h"
#include <float.h>
#include <stdio.h>
#define CHECK(x) do {if(!(x)){fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x);exit(1);}}while(0)
static b3BodyId load(const uint32_t* id){return b3LoadBodyId(((uint64_t)id[1]<<32)|id[0]);}
static void putf(uint32_t* p,float f){memcpy(p,&f,4);}
static void pose(uint32_t* p,float x,float y,float z,float qx,float qy,float qz,float qw){
    float f[7]={x,y,z,qx,qy,qz,qw};memcpy(p,f,sizeof(f));
}
static void record(uint32_t* p,const uint32_t* id,uint32_t flags,uint32_t intent){
    memset(p,0,AIR_B3_MOTION_INPUT_WORDS*4);p[0]=id[0];p[1]=id[1];p[2]=flags;p[3]=intent;
}
static int run(uint32_t world,const uint32_t* records,int n,float* out,int apply){
    return air_b3_motion_batch(world,records,n,n*18,1.0f/60,4,out,n*61,apply);
}
static void capture(uint32_t w,const uint32_t* ids,int n,float* out){
    for(int i=0;i<n;++i){CHECK(!air_b3_body_snapshot(ids[2*i],ids[2*i+1],out+78*i));
        CHECK(!air_b3_body_state(w,ids[2*i],ids[2*i+1],0,out+78*i+29));}
}
static void negative(uint32_t w,uint32_t* ids,uint32_t* wire,int expected){
    float before[156],after[156],out[122];uint32_t memoryBefore[6],memoryAfter[6];
    memset(out,0x5a,sizeof(out));float canary[122];memcpy(canary,out,sizeof(out));
    capture(w,ids,2,before);CHECK(!air_b3_bridge_memory(w,memoryBefore));
    CHECK(run(w,wire,2,out,1)==expected);capture(w,ids,2,after);CHECK(!memcmp(before,after,sizeof(before)));
    CHECK(!memcmp(out,canary,sizeof(out)));CHECK(!air_b3_bridge_memory(w,memoryAfter));CHECK(!memcmp(memoryBefore,memoryAfter,sizeof(memoryBefore)));
}
int main(void){
    uint32_t baseline[2],final[2];air_b3_live_bytes(baseline);
    uint32_t w=air_b3_world_create(0,0,0),other=air_b3_world_create(0,0,0),ids[4],foreign[2],stat[2],shape[2];CHECK(w&&other);
    float input[16]={0,0,0,0,0,0,1};
    CHECK(!air_b3_body_create(w,2,input,1,ids));CHECK(!air_b3_shape_sphere_ex(ids[0],ids[1],.5f,0,0,.5f,1,0,shape));
    CHECK(!air_b3_body_create(w,1,input,1,ids+2));CHECK(!air_b3_shape_box(ids[2],ids[3],1,.5f,.5f,1,shape));
    CHECK(!air_b3_body_create(other,1,input,1,foreign));CHECK(!air_b3_body_create(w,0,input,1,stat));
    uint32_t wire[36];record(wire,ids,AIR_B3_MOTION_RESET,0);pose(wire+4,2,3,4,0,0,0,2);
    record(wire+18,ids+2,0,AIR_B3_MOTION_TARGET);pose(wire+29,.01f,0,0,0,0,0,1);
    float before[156],after[156],out[122];capture(w,ids,2,before);memset(out,0x5a,sizeof(out));float canary[122];memcpy(canary,out,sizeof(out));
    CHECK(!run(w,wire,2,out,0));capture(w,ids,2,after);CHECK(!memcmp(before,after,sizeof(before)));CHECK(!memcmp(out,canary,sizeof(out)));
    uint32_t saved[36];memcpy(saved,wire,sizeof(wire));
    wire[18]=foreign[0];wire[19]=foreign[1];negative(w,ids,wire,AIR_B3_INVALID);memcpy(wire,saved,sizeof(wire));
    wire[18]=ids[0];wire[19]=ids[1];negative(w,ids,wire,AIR_B3_ARGUMENT);memcpy(wire,saved,sizeof(wire));
    wire[19]=UINT32_MAX;negative(w,ids,wire,AIR_B3_INVALID);memcpy(wire,saved,sizeof(wire));
    putf(wire+35,0);negative(w,ids,wire,AIR_B3_ARGUMENT);memcpy(wire,saved,sizeof(wire));
    putf(wire+29,INFINITY);negative(w,ids,wire,AIR_B3_ARGUMENT);memcpy(wire,saved,sizeof(wire));
    putf(wire+29,FLT_MAX);negative(w,ids,wire,AIR_B3_ARGUMENT);memcpy(wire,saved,sizeof(wire));
    CHECK(air_b3_motion_batch(w,wire,2,36,1.0f/60,4,out,121,1)==AIR_B3_CAPACITY);
    CHECK(air_b3_motion_batch(w,wire,2,35,1.0f/60,4,out,122,1)==AIR_B3_CAPACITY);
    CHECK(air_b3_motion_batch(w,wire,2,36,1.0f/60,4,(float*)wire,122,1)==AIR_B3_ARGUMENT);
    CHECK(air_b3_motion_batch(w,wire,4097,36,1.0f/60,4,out,122,1)==AIR_B3_CAPACITY);
    for(int n=0;n<10;++n)if(n!=1&&n!=2&&n!=4&&n!=8)CHECK(air_b3_motion_batch(w,wire,2,36,1.0f/60,n,out,122,1)==AIR_B3_ARGUMENT);
    CHECK(air_b3_motion_batch(w,wire,2,36,FLT_TRUE_MIN,4,out,122,1)==AIR_B3_ARGUMENT);
    b3World* internal=b3GetWorldFromId(b3LoadWorldId(w));capture(w,ids,2,before);internal->locked=true;
    CHECK(run(w,wire,2,out,1)==AIR_B3_LOCKED);internal->locked=false;capture(w,ids,2,after);
    CHECK(!memcmp(before,after,sizeof(before)));CHECK(!memcmp(out,canary,sizeof(out)));
    /* Allocation control is fixture-only; the real batch obtains/frees its per-world native scratch. */
    allocation_budget=0;negative(w,ids,wire,AIR_B3_ALLOCATION);allocation_budget=-1;
    CHECK(!air_b3_motion_batch(w,NULL,0,0,1.0f/60,4,out,122,1));CHECK(!memcmp(out,canary,sizeof(out)));
    b3BodyId dynamic=load(ids),kinematic=load(ids+2);
    b3Body_SetLinearVelocity(dynamic,(b3Vec3){1,2,3});b3Body_SetAngularVelocity(dynamic,(b3Vec3){.1f,.2f,.3f});
    b3Body_ApplyForceToCenter(dynamic,(b3Vec3){4,5,6},true);b3Body_ApplyTorque(dynamic,(b3Vec3){7,8,9},true);
    CHECK(!run(w,wire,2,out,1));CHECK(out[0]==2&&out[1]==3&&out[2]==4);CHECK(out[10]==0&&out[13]==0);CHECK(out[36]==4&&out[39]==7);
    b3Body_Disable(dynamic);record(wire,ids,AIR_B3_MOTION_RESET|AIR_B3_MOTION_WAKE|AIR_B3_MOTION_PRESERVE,0);pose(wire+4,5,6,7,0,0,0,1);
    CHECK(!run(w,wire,1,out,1));CHECK(!b3Body_IsEnabled(dynamic));CHECK(out[0]==5&&out[34]==0&&out[35]==0);b3Body_Enable(dynamic);
    /* Real public core SetMassData with zero mass supplies an independent nonzero kinematic COM.
       Ordinary managed kinematic shape mass recomputation uses COM zero; no product setter is claimed. */
    b3Body_SetMassData(kinematic,(b3MassData){.mass=0,.center={.5f,.25f,0},.inertia={0}});
    record(wire,ids+2,AIR_B3_MOTION_RESET,AIR_B3_MOTION_TARGET);pose(wire+4,1,2,3,0,0,0,1);
    float theta=.1f;pose(wire+11,1,2,3,0,0,sinf(theta/2),cosf(theta/2));
    CHECK(!run(w,wire,1,out,1));
    float expectedX=(.5f*cosf(theta)-.25f*sinf(theta)-.5f)*60;
    float expectedY=(.5f*sinf(theta)+.25f*cosf(theta)-.25f)*60;
    CHECK(fabsf(out[10]-expectedX)<1e-4f&&fabsf(out[11]-expectedY)<1e-4f);CHECK(out[42]==.5f&&out[43]==.25f);
    float offsetApplied[3]={out[10],out[11],out[15]};
    b3Body_SetMotionLocks(kinematic,(b3MotionLocks){.linearX=true});CHECK(run(w,wire,1,out,1)==AIR_B3_MOTION_LOCK_CONFLICT);
    b3Body_SetMotionLocks(kinematic,(b3MotionLocks){0});
    pose(wire+11,100,2,3,0,0,0,1);CHECK(run(w,wire,1,out,1)==AIR_B3_MOTION_SPEED_CAP);
    b3Body_SetMassData(kinematic,(b3MassData){0});
    b3Body_SetTransform(kinematic,(b3Pos){0,0,0},b3Quat_identity);b3Body_SetAwake(kinematic,false);CHECK(!b3Body_IsAwake(kinematic));
    record(wire,ids+2,0,AIR_B3_MOTION_TARGET);pose(wire+11,1e-7f,0,0,0,0,0,1);CHECK(!run(w,wire,1,out,1));CHECK(b3Body_IsAwake(kinematic));CHECK(out[10]>0&&out[10]<.05f);
    b3World_SetMaximumLinearSpeed(b3LoadWorldId(w),FLT_MIN);
    pose(wire+11,0,0,0,0,0,0,1);CHECK(!run(w,wire,1,out,1));CHECK(out[10]==0&&out[13]==0);
    wire[3]=AIR_B3_MOTION_CLEAR;memset(wire+11,0,28);CHECK(!run(w,wire,1,out,1));b3World_SetMaximumLinearSpeed(b3LoadWorldId(w),400);
    record(wire,ids+2,0,AIR_B3_MOTION_TARGET);pose(wire+11,0,0,0,0,0,1,0);
    CHECK(run(w,wire,1,out,1)==AIR_B3_MOTION_SPEED_CAP);
    b3Body_AllowFastRotation(kinematic,true);CHECK(!run(w,wire,1,out,1));CHECK(out[31]==0&&out[32]==1&&out[15]>100);
    b3Body_AllowFastRotation(kinematic,false);
    b3Body_SetLinearVelocity(kinematic,b3Vec3_zero);b3Body_SetAngularVelocity(kinematic,b3Vec3_zero);
    b3Body_SetMotionLocks(kinematic,(b3MotionLocks){.linearX=true});
    pose(wire+11,1e-9f,0,0,0,0,0,1);CHECK(!run(w,wire,1,out,1));CHECK(out[10]==0&&out[22]>0&&out[22]<=1e-6f);
    b3Body_SetMotionLocks(kinematic,(b3MotionLocks){0});
    record(wire,stat,AIR_B3_MOTION_RESET|AIR_B3_MOTION_SCENE,0);pose(wire+4,3,2,1,0,0,0,1);CHECK(!run(w,wire,1,out,1));CHECK(out[33]==0&&out[0]==3);
    wire[2]=AIR_B3_MOTION_RESET;CHECK(run(w,wire,1,out,1)==AIR_B3_UNSUPPORTED);
    uint32_t old[2],replacement[2];CHECK(!air_b3_body_create(w,1,input,1,old));CHECK(!air_b3_body_destroy(old[0],old[1]));
    CHECK(!air_b3_body_create(w,1,input,1,replacement));CHECK(old[1]==replacement[1]&&old[0]!=replacement[0]);
    record(wire,old,0,AIR_B3_MOTION_CLEAR);CHECK(run(w,wire,1,out,1)==AIR_B3_INVALID);
    uint32_t memory[6];CHECK(!air_b3_bridge_memory(w,memory));uint64_t prior=((uint64_t)memory[1]<<32)|memory[0];
    void* temp=air_b3_bridge_temp_alloc(w,128);CHECK(temp);CHECK(!air_b3_bridge_memory(w,memory));CHECK((((uint64_t)memory[1]<<32)|memory[0])>prior);
    air_b3_bridge_temp_free(w,temp,128);CHECK(!air_b3_bridge_memory(w,memory));CHECK((((uint64_t)memory[1]<<32)|memory[0])==prior);
    CHECK(air_b3_bridge_temp_alloc(w,64)); /* Owned orphan is reclaimed at actual world destruction. */
    CHECK(!air_b3_world_destroy(w));CHECK(!air_b3_world_destroy(other));air_b3_live_bytes(final);CHECK(!memcmp(baseline,final,8));
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"batchPreflightNoPartialMutation\":true,\"capacityOverlapLockedCanaries\":true,\"strictQuaternionAndOverflow\":true,\"disabledResetForcePreserve\":true,\"tinyTargetWakeAndStationaryCap\":true,\"postResetCOMTarget\":true,\"offsetApplied\":[%.9g,%.9g,%.9g],\"worldAxisLockAndCaps\":true,\"actualFastRotationFlag\":true,\"fullGenerationWorld\":true,\"scratchTrackedAndCleanup\":true,\"substepDomain\":true,\"emptyNoOutputWrite\":true,\"coreBytesRestored\":true}\n",sizeof(void*),offsetApplied[0],offsetApplied[1],offsetApplied[2]);
}
