/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Real pinned-core capsule qualification. Fault control is executable-only.
   This is additional coverage, never a reduced EX01/shape-family denominator. */
#define AIR_B3_BRIDGE_QUALIFICATION
#include "world_bridge.c"
#include "body.h"
#include "physics_world.h"
#include "shape.h"
#include <box3d/constants.h>
#include <stdio.h>
#define CHECK(x) do { if(!(x)){fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x);exit(1);} }while(0)
static b3BodyId body_id(const uint32_t* p){return b3LoadBodyId(((uint64_t)p[1]<<32)|p[0]);}
static b3ShapeId shape_id(const uint32_t* p){return b3LoadShapeId(((uint64_t)p[1]<<32)|p[0]);}
static int near(float a,float b){return fabsf(a-b)<=2e-5f*fmaxf(1.0f,fabsf(b));}
static void body_create(uint32_t w,int type,uint32_t* id){
    float p[16]={0,0,0,0,0,0,1};CHECK(!air_b3_body_create(w,type,p,1,id));
}
static void pf(uint32_t* p,float f){memcpy(p,&f,4);}
static float gf(const uint32_t* p){float f;memcpy(&f,p,4);return f;}
static int rejected;
static void reject(uint32_t w,const uint32_t* body,const float* p,int sensor,float target,int expected){
    float before[49],after[49];uint32_t counts[6],nextCounts[6],memory[6],nextMemory[6],out[2]={0x5a5a5a5a,0xa5a5a5a5};
    CHECK(!air_b3_body_state(w,body[0],body[1],0,before));CHECK(!air_b3_world_counts(w,counts));CHECK(!air_b3_bridge_memory(w,memory));
    CHECK(air_b3_mass_shape_create(w,body[0],body[1],2,p,sensor,target,out)==expected);
    CHECK(out[0]==0x5a5a5a5a&&out[1]==0xa5a5a5a5);CHECK(!air_b3_body_state(w,body[0],body[1],0,after));
    CHECK(!memcmp(before,after,sizeof(before)));CHECK(!air_b3_world_counts(w,nextCounts));CHECK(!memcmp(counts,nextCounts,sizeof(counts)));
    CHECK(!air_b3_bridge_memory(w,nextMemory));CHECK(!memcmp(memory,nextMemory,sizeof(memory)));++rejected;
}
static void check_mass(const float* state,int axis,float radius,float half,float density,float target){
    float length=2*half,mc=density*B3_PI*radius*radius*length,ms=density*(4.0f/3.0f)*B3_PI*radius*radius*radius;
    float scale=target/(mc+ms),parallel=(0.5f*mc+0.4f*ms)*radius*radius*scale;
    float transverse=(mc*(3*radius*radius+length*length)/12+0.4f*ms*radius*radius+
        0.125f*ms*(3*radius+2*length)*length)*scale;
    CHECK(near(state[31],target));
    for(int col=0;col<3;++col)for(int row=0;row<3;++row)
        CHECK(near(state[35+3*col+row],col!=row?0:col==axis?parallel:transverse));
}
static void debug_geometry(uint32_t w,const uint32_t* body,const float* capsule){
    uint32_t size=0,wire[1+100*8],memory[6];CHECK(!air_b3_world_debug_capture(w,1,1,&size));CHECK(size==1+100*8);
    CHECK(!air_b3_world_debug_copy(w,wire,size)&&wire[0]==100);CHECK(!air_b3_bridge_memory(w,memory)&&memory[3]==1);
    b3WorldTransform pose=b3Body_GetTransform(body_id(body));int axis=(int)capsule[5];float minimum[3]={FLT_MAX,FLT_MAX,FLT_MAX},maximum[3]={-FLT_MAX,-FLT_MAX,-FLT_MAX};
    for(int line=0;line<100;++line){CHECK(wire[1+8*line]==1);
        for(int end=0;end<2;++end){const uint32_t* p=wire+1+8*line+2+3*end;
            b3Pos world={gf(p),gf(p+1),gf(p+2)};b3Vec3 local=b3InvRotateVector(pose.q,b3SubPos(world,pose.p));float xyz[3]={local.x,local.y,local.z};
            float distance2=0;for(int i=0;i<3;++i){CHECK(isfinite(xyz[i]));minimum[i]=fminf(minimum[i],xyz[i]);maximum[i]=fmaxf(maximum[i],xyz[i]);
                float nearest=capsule[i];if(i==axis)nearest=fmaxf(capsule[i]-capsule[4],fminf(capsule[i]+capsule[4],xyz[i]));
                float d=xyz[i]-nearest;distance2+=d*d;}
            CHECK(near(distance2,capsule[3]*capsule[3]));
        }
    }
    for(int i=0;i<3;++i){float extent=capsule[3]+(i==axis?capsule[4]:0);CHECK(near(minimum[i],capsule[i]-extent)&&near(maximum[i],capsule[i]+extent));}
    uint32_t small[4]={11,12,13,14};CHECK(air_b3_world_debug_copy(w,small,4)==AIR_B3_CAPACITY);CHECK(small[0]==11&&small[3]==14);
    CHECK(!air_b3_world_debug_release(w));CHECK(!air_b3_bridge_memory(w,memory)&&memory[3]==1&&memory[4]==0&&memory[5]==0);
}
static void transport(uint32_t w,const uint32_t* body){
    uint32_t motion[18]={body[0],body[1],AIR_B3_MOTION_RESET,0};float reset[7]={1,2,3,0,0,0,1};memcpy(motion+4,reset,sizeof(reset));
    float before[49],after[49],result[61];CHECK(!air_b3_body_state(w,body[0],body[1],2,before));
    CHECK(!air_b3_motion_batch(w,motion,1,18,1.0f/60,4,NULL,0,0));CHECK(!air_b3_body_state(w,body[0],body[1],2,after));CHECK(!memcmp(before,after,sizeof(before)));
    CHECK(!air_b3_motion_batch(w,motion,1,18,1.0f/60,4,result,61,1));CHECK(result[0]==1&&result[1]==2&&result[2]==3);
    uint32_t packet[48]={AIR_B3_COMMAND_INPUT_MAGIC,1,48,1,2,4,16,12,16,0,4,0},out[332];pf(packet+9,1.0f/60);
    packet[12]=body[0];packet[13]=body[1];pf(packet+14,2);
    packet[17]=AIR_B3_COMMAND_RESET;packet[19]=1;pf(packet+21,4);pf(packet+22,5);pf(packet+23,6);pf(packet+27,1);
    packet[33]=AIR_B3_COMMAND_ANGULAR_IMPULSE;packet[35]=2;pf(packet+37,.25f);pf(packet+38,.5f);pf(packet+39,.75f);
    CHECK(!air_b3_body_state(w,body[0],body[1],2,before));CHECK(!air_b3_command_batch(w,packet,48,NULL,0,0));
    CHECK(!air_b3_body_state(w,body[0],body[1],2,after));CHECK(!memcmp(before,after,sizeof(before)));
    CHECK(!air_b3_command_batch(w,packet,48,out,332,1));CHECK(out[4]==2);
    for(int i=0;i<2;++i){const uint32_t* operation=out+out[8]+80*i;CHECK(!memcmp(operation+30,operation+48,12*4));}
    CHECK(!air_b3_body_state(w,body[0],body[1],2,after));CHECK(after[16]!=0&&after[17]!=0&&after[18]!=0);
    float type[1]={0};CHECK(!air_b3_body_control(w,body[0],body[1],AIR_B3_CTL_TYPE,type,2));
    type[0]=1;CHECK(!air_b3_body_control(w,body[0],body[1],AIR_B3_CTL_TYPE,type,2));
    memset(motion,0,sizeof(motion));motion[0]=body[0];motion[1]=body[1];motion[3]=AIR_B3_MOTION_TARGET;
    float target[7]={4.01f,5,6,0,0,0,1};memcpy(motion+11,target,sizeof(target));
    CHECK(!air_b3_motion_batch(w,motion,1,18,1.0f/60,4,result,61,1));CHECK(near(result[10],.6000137f));
    type[0]=2;CHECK(!air_b3_body_control(w,body[0],body[1],AIR_B3_CTL_TYPE,type,2));
}
int main(void){
    uint32_t baseline[2],final[2],memory[6],body[2],shape[2];air_b3_live_bytes(baseline);
    CHECK(!air_b3_bridge_memory(0,memory)&&memory[0]==0&&memory[2]==0);
    uint32_t w=air_b3_world_create(0,0,0);CHECK(w);
    for(int axis=0;axis<3;++axis){
        body_create(w,2,body);float p[7]={1,-2,3,.5f,1,(float)axis,2},state[49];
        CHECK(!air_b3_mass_shape_create(w,body[0],body[1],2,p,0,12,shape));CHECK(b3Shape_GetType(shape_id(shape))==b3_capsuleShape);
        b3Capsule capsule=b3Shape_GetCapsule(shape_id(shape));float a[3]={capsule.center1.x,capsule.center1.y,capsule.center1.z},b[3]={capsule.center2.x,capsule.center2.y,capsule.center2.z};
        for(int i=0;i<3;++i)CHECK(a[i]==p[i]-(i==axis?1:0)&&b[i]==p[i]+(i==axis?1:0));CHECK(capsule.radius==.5f);
        CHECK(!air_b3_body_state(w,body[0],body[1],12,state));CHECK(state[32]==1&&state[33]==-2&&state[34]==3);check_mass(state,axis,.5f,1,2,12);
        float impulse[6]={0};impulse[axis]=state[35+4*axis];CHECK(!air_b3_body_apply(w,body[0],body[1],3,0,impulse));
        CHECK(!air_b3_body_state(w,body[0],body[1],12,state));for(int i=0;i<3;++i)CHECK(near(state[16+i],i==axis?1:0));
        b3Body_SetTransform(body_id(body),(b3Pos){4,5,6},(b3Quat){{0,0,sqrtf(.5f)},sqrtf(.5f)});debug_geometry(w,body,p);
        CHECK(!air_b3_mass_shape_destroy(w,body[0],body[1],shape[0],shape[1],12));CHECK(air_b3_body_mass_ready(w,body[0],body[1],12)==AIR_B3_MASS_PENDING);
        CHECK(!air_b3_bridge_memory(w,memory)&&memory[3]==0);CHECK(!air_b3_body_destroy(body[0],body[1]));
    }
    body_create(w,2,body);float p[7]={.25f,-.5f,.75f,.5f,1,1,1},state[49];
    CHECK(!air_b3_mass_shape_create(w,body[0],body[1],2,p,0,2,shape));transport(w,body);
    /* Failed replacements leave the old capsule, body, output and allocation/counter state intact. */
    float bad[7];for(int i=0;i<7;++i){memcpy(bad,p,sizeof(bad));bad[i]=NAN;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);}
    memcpy(bad,p,sizeof(bad));bad[3]=0;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);bad[3]=-1;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);
    memcpy(bad,p,sizeof(bad));bad[4]=-1;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);
    float invalidAxes[3]={-1,.5f,3};for(int i=0;i<3;++i){memcpy(bad,p,sizeof(bad));bad[5]=invalidAxes[i];reject(w,body,bad,0,2,AIR_B3_ARGUMENT);}
    memcpy(bad,p,sizeof(bad));bad[6]=0;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);
    reject(w,body,p,2,2,AIR_B3_ARGUMENT);reject(w,body,p,0,NAN,AIR_B3_ARGUMENT);
    memcpy(bad,p,sizeof(bad));bad[0]=bad[1]=bad[2]=0;bad[4]=.5f*B3_LINEAR_SLOP;reject(w,body,bad,0,2,AIR_B3_UNSUPPORTED);
    bad[4]=.25f*B3_LINEAR_SLOP;reject(w,body,bad,0,2,AIR_B3_UNSUPPORTED);
    memcpy(bad,p,sizeof(bad));bad[1]=1e8f;bad[4]=1;reject(w,body,bad,0,2,AIR_B3_UNSUPPORTED);
    memcpy(bad,p,sizeof(bad));bad[1]=FLT_MAX;bad[4]=FLT_MAX;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);
    memcpy(bad,p,sizeof(bad));bad[0]=FLT_MAX;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);
    memcpy(bad,p,sizeof(bad));bad[3]=1e9f;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);
    memcpy(bad,p,sizeof(bad));bad[6]=FLT_MAX;reject(w,body,bad,0,2,AIR_B3_ARGUMENT);
    memcpy(bad,p,sizeof(bad));bad[0]=1e30f;bad[6]=1e10f;reject(w,body,bad,0,0,AIR_B3_ARGUMENT);
    CHECK(air_b3_shape_valid(shape[0],shape[1]));CHECK(b3Shape_GetType(shape_id(shape))==b3_capsuleShape);
    uint32_t foreign=air_b3_world_create(0,0,0),canary[2]={11,12};CHECK(foreign);
    CHECK(air_b3_mass_shape_create(foreign,body[0],body[1],2,p,0,2,canary)==AIR_B3_INVALID&&canary[0]==11&&canary[1]==12);
    b3World* internal=b3GetWorldFromId(b3LoadWorldId(w));internal->locked=true;
    CHECK(air_b3_mass_shape_create(w,body[0],body[1],2,p,0,2,canary)==AIR_B3_LOCKED&&canary[0]==11&&canary[1]==12);internal->locked=false;
    CHECK(!air_b3_world_destroy(foreign));CHECK(!air_b3_body_destroy(body[0],body[1]));
    /* Exact zero means an actual sphere, with sphere mass and debug identity. */
    for(int axis=0;axis<3;++axis){body_create(w,2,body);p[4]=0;p[5]=(float)axis;
        CHECK(!air_b3_mass_shape_create(w,body[0],body[1],2,p,0,12,shape));CHECK(b3Shape_GetType(shape_id(shape))==b3_sphereShape);
        b3Sphere sphere=b3Shape_GetSphere(shape_id(shape));CHECK(sphere.radius==p[3]&&sphere.center.x==p[0]&&sphere.center.y==p[1]&&sphere.center.z==p[2]);
        CHECK(!air_b3_body_state(w,body[0],body[1],12,state));check_mass(state,axis,p[3],0,p[6],12);
        uint32_t size;CHECK(!air_b3_world_debug_capture(w,1,1,&size)&&size==1+72*8);CHECK(!air_b3_world_debug_release(w));CHECK(!air_b3_body_destroy(body[0],body[1]));}
    /* Just above the native slop boundary remains a capsule, never a sphere. */
    body_create(w,2,body);p[0]=p[1]=p[2]=0;p[4]=nextafterf(.5f*B3_LINEAR_SLOP,INFINITY);p[5]=1;
    CHECK(!air_b3_mass_shape_create(w,body[0],body[1],2,p,0,2,shape));CHECK(b3Shape_GetType(shape_id(shape))==b3_capsuleShape);CHECK(!air_b3_body_destroy(body[0],body[1]));
    /* Density-based mass remains distinct from requested total mass. */
    body_create(w,2,body);p[4]=1;p[6]=2;CHECK(!air_b3_mass_shape_create(w,body[0],body[1],2,p,0,0,shape));
    CHECK(!air_b3_body_state(w,body[0],body[1],0,state));float naturalMass=2*B3_PI*.25f*2+2*(4.0f/3.0f)*B3_PI*.125f;check_mass(state,1,.5f,1,2,naturalMass);
    CHECK(!air_b3_body_mass_set(w,body[0],body[1],12));CHECK(!air_b3_body_state(w,body[0],body[1],12,state));check_mass(state,1,.5f,1,2,12);CHECK(!air_b3_body_destroy(body[0],body[1]));
    /* Sensor-only fallback and mixed-solid exclusion use the existing mass plan. */
    body_create(w,2,body);p[0]=1;CHECK(!air_b3_mass_shape_create(w,body[0],body[1],2,p,1,2,shape));
    CHECK(!air_b3_body_state(w,body[0],body[1],2,state)&&state[48]==1&&state[32]==1);
    float solid[5]={-1,0,0,.5f,1};uint32_t sphere[2];CHECK(!air_b3_mass_shape_create(w,body[0],body[1],0,solid,0,2,sphere));
    CHECK(!air_b3_body_state(w,body[0],body[1],2,state)&&state[48]==0&&state[32]==-1);
    CHECK(!air_b3_mass_shape_destroy(w,body[0],body[1],sphere[0],sphere[1],2));CHECK(!air_b3_body_state(w,body[0],body[1],2,state)&&state[48]==1&&state[32]==1);
    CHECK(!air_b3_body_destroy(body[0],body[1]));
    /* Real lazy debug allocation failures, including a retained cached shape. */
    body_create(w,2,body);CHECK(!air_b3_mass_shape_create(w,body[0],body[1],2,p,0,2,shape));uint32_t size=99;
    allocation_budget=0;CHECK(air_b3_world_debug_capture(w,1,1,&size)==AIR_B3_ALLOCATION&&size==99);allocation_budget=-1;
    CHECK(!air_b3_bridge_memory(w,memory)&&memory[3]==0&&memory[4]==0&&memory[2]==1);
    allocation_budget=1;CHECK(air_b3_world_debug_capture(w,1,1,&size)==AIR_B3_ALLOCATION&&size==99);allocation_budget=-1;
    CHECK(!air_b3_bridge_memory(w,memory)&&memory[3]==1&&memory[4]==0&&memory[2]==2);debug_geometry(w,body,p);
    CHECK(!air_b3_world_destroy(w));
    for(int cycle=0;cycle<128;++cycle){w=air_b3_world_create(0,0,0);CHECK(w);body_create(w,2,body);p[5]=(float)(cycle%3);
        CHECK(!air_b3_mass_shape_create(w,body[0],body[1],2,p,cycle%2,2,shape));CHECK(!air_b3_world_debug_capture(w,1,1,&size));
        if(cycle%3==0)CHECK(!air_b3_mass_shape_destroy(w,body[0],body[1],shape[0],shape[1],2));
        else if(cycle%3==1)CHECK(!air_b3_body_destroy(body[0],body[1]));CHECK(!air_b3_world_destroy(w));}
    air_b3_live_bytes(final);CHECK(!memcmp(baseline,final,sizeof(final)));CHECK(!air_b3_bridge_memory(0,memory)&&memory[0]==0&&memory[1]==0&&memory[2]==0&&memory[3]==0);
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"negativeCases\":%d,\"allThreeAxes\":true,\"analyticMassAndImpulse\":true,\"exactZeroSphere\":true,\"shortPositiveRejectNoWrite\":true,\"finiteDerivedAndAutomaticMassPreflight\":true,\"commandAndMotion\":true,\"trueCapsuleDebugSurface\":true,\"sensorMassLifecycle\":true,\"debugAllocationFailures\":true,\"lifecycle128\":true,\"coreAndBridgeBytesRestored\":true}\n",sizeof(void*),rejected);
    return 0;
}
