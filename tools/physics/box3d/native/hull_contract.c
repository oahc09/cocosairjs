/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* True fixed-core/native point-cloud contract. Execution evidence is in build receipts.
   This TU owns world_bridge.c, so omit its separate object for this target. */
#define AIR_B3_BRIDGE_QUALIFICATION
#include "world_bridge.c"
#include "hull_bridge.h"
#include "body.h"
#include "physics_world.h"
#include "shape.h"
#include <box3d/constants.h>
#include <limits.h>
#include <stdio.h>
#define CHECK(x) do{if(!(x)){fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x);exit(1);}}while(0)
static b3BodyId body_id(const uint32_t* p){return b3LoadBodyId(((uint64_t)p[1]<<32)|p[0]);}
static b3ShapeId shape_id(const uint32_t* p){return b3LoadShapeId(((uint64_t)p[1]<<32)|p[0]);}
static int near(float a,float b){return fabsf(a-b)<=2e-5f*fmaxf(1,fabsf(b));}
static void pf(uint32_t* p,float f){memcpy(p,&f,4);}
static float gf(const uint32_t* p){float f;memcpy(&f,p,4);return f;}
static void body_create(uint32_t w,uint32_t* id){float p[16]={0,0,0,0,0,0,1};CHECK(!air_b3_body_create(w,2,p,1,id));}
static int create(uint32_t w,const uint32_t* b,const float* p,int n,int sensor,float mass,uint32_t* out){return air_b3_mass_hull_create(w,b[0],b[1],p,n,3*n,3,sensor,mass,out);}
static void reject(uint32_t w,const uint32_t* b,const float* p,int n,int floats,int sensor,float mass,int expected){
    float before[49],after[49];uint32_t counts[6],next[6],memory[6],memory2[6],core[2],core2[2],out[2]={11,12};
    CHECK(!air_b3_body_state(w,b[0],b[1],0,before));CHECK(!air_b3_world_counts(w,counts));CHECK(!air_b3_bridge_memory(w,memory));air_b3_live_bytes(core);
    CHECK(air_b3_mass_hull_create(w,b[0],b[1],p,n,floats,3,sensor,mass,out)==expected);
    CHECK(out[0]==11&&out[1]==12);CHECK(!air_b3_body_state(w,b[0],b[1],0,after));CHECK(!memcmp(before,after,sizeof before));
    CHECK(!air_b3_world_counts(w,next)&&!memcmp(counts,next,sizeof counts));CHECK(!air_b3_bridge_memory(w,memory2)&&!memcmp(memory,memory2,sizeof memory));
    air_b3_live_bytes(core2);CHECK(!memcmp(core,core2,sizeof core));
}
static void validate_geometry(uint32_t w,const uint32_t* b,const float* p,int n,int floats,int expected){
    float before[49],after[49];uint32_t counts[6],next[6],memory[6],memory2[6],core[2],core2[2];
    CHECK(!air_b3_body_state(w,b[0],b[1],0,before));CHECK(!air_b3_world_counts(w,counts));CHECK(!air_b3_bridge_memory(w,memory));air_b3_live_bytes(core);
    CHECK(air_b3_hull_validate(w,p,n,floats)==expected);
    CHECK(!air_b3_body_state(w,b[0],b[1],0,after)&&!memcmp(before,after,sizeof before));
    CHECK(!air_b3_world_counts(w,next)&&!memcmp(counts,next,sizeof counts));CHECK(!air_b3_bridge_memory(w,memory2)&&!memcmp(memory,memory2,sizeof memory));
    air_b3_live_bytes(core2);CHECK(!memcmp(core,core2,sizeof core));
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
static void log_stderr(const char* message){fprintf(stderr,"Box3D: %s\n",message);}
int main(void){
    b3SetLogFcn(log_stderr);
    uint32_t baseline[2],final[2],body[2],shape[2];air_b3_live_bytes(baseline);
    uint32_t w=air_b3_world_create(0,0,0);CHECK(w);body_create(w,body);
    const float tetra[]={0,0,0,2,0,0,0,3,0,0,0,4};
    validate_geometry(w,body,tetra,4,12,AIR_B3_OK);
    CHECK(!create(w,body,tetra,4,0,12,shape));CHECK(b3Shape_GetType(shape_id(shape))==b3_hullShape);
    const b3HullData* h=b3Shape_GetHull(shape_id(shape));CHECK(h->vertexCount==4&&h->faceCount==4&&h->edgeCount==12);
    float state[49];CHECK(!air_b3_body_state(w,body[0],body[1],12,state));
    const float inertia[]={11.25f,.9f,1.2f,.9f,9,1.8f,1.2f,1.8f,5.85f};
    CHECK(near(state[31],12)&&near(state[32],.5f)&&near(state[33],.75f)&&near(state[34],1));
    for(int i=0;i<9;++i)CHECK(near(state[35+i],inertia[i]));
    float ray[]={1.8f,2.8f,5,0,0,-6};uint32_t hit[11],count,size;
    CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,hit,11,&count)&&count==0);
    ray[0]=.2f;ray[1]=.3f;CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,hit,11,&count)&&count==1);
    CHECK(near(gf(hit+4),3.2f)&&near(gf(hit+8),.3f));
    CHECK(!air_b3_world_debug_capture(w,1,1,&size)&&size==1+6*8);CHECK(!air_b3_world_debug_release(w));
    reject(w,body,tetra,3,9,0,12,AIR_B3_ARGUMENT);reject(w,body,tetra,4,11,0,12,AIR_B3_ARGUMENT);
    reject(w,body,tetra,INT_MAX,12,0,12,AIR_B3_CAPACITY);reject(w,body,tetra,4,12,2,12,AIR_B3_ARGUMENT);
    reject(w,body,tetra,4,12,0,NAN,AIR_B3_ARGUMENT);
    float bad[12];for(int i=0;i<12;++i){memcpy(bad,tetra,sizeof bad);bad[i]=NAN;reject(w,body,bad,4,12,0,12,AIR_B3_ARGUMENT);validate_geometry(w,body,bad,4,12,AIR_B3_ARGUMENT);bad[i]=INFINITY;reject(w,body,bad,4,12,0,12,AIR_B3_ARGUMENT);}
    const float coincident[12]={0};const float line[]={0,0,0,1,0,0,2,0,0,3,0,0};const float plane[]={0,0,0,1,0,0,0,1,0,1,1,0};
    reject(w,body,coincident,4,12,0,12,AIR_B3_UNSUPPORTED);reject(w,body,line,4,12,0,12,AIR_B3_UNSUPPORTED);reject(w,body,plane,4,12,0,12,AIR_B3_UNSUPPORTED);validate_geometry(w,body,plane,4,12,AIR_B3_UNSUPPORTED);
    memcpy(bad,plane,sizeof bad);bad[11]=nextafterf(0,1);reject(w,body,bad,4,12,0,12,AIR_B3_UNSUPPORTED);
    memcpy(bad,tetra,sizeof bad);for(int i=0;i<12;++i)bad[i]*=1e9f;reject(w,body,bad,4,12,0,12,AIR_B3_UNSUPPORTED);
    uint32_t foreign=air_b3_world_create(0,0,0),canary[2]={11,12};CHECK(foreign);
    CHECK(air_b3_mass_hull_create(foreign,body[0],body[1],tetra,4,12,3,0,12,canary)==AIR_B3_INVALID&&canary[0]==11&&canary[1]==12);
    CHECK(!air_b3_world_destroy(foreign));b3World* internal=b3GetWorldFromId(b3LoadWorldId(w));internal->locked=true;
    CHECK(air_b3_mass_hull_create(w,body[0],body[1],tetra,4,12,3,0,12,canary)==AIR_B3_LOCKED&&canary[0]==11&&canary[1]==12);internal->locked=false;
    memcpy(bad,tetra,sizeof bad);bad[0]=-FLT_MAX;bad[3]=FLT_MAX;reject(w,body,bad,4,12,0,12,AIR_B3_ARGUMENT);
    memcpy(bad,tetra,sizeof bad);CHECK(air_b3_mass_hull_create(w,body[0],body[1],bad,4,12,3,0,12,(uint32_t*)bad)==AIR_B3_ARGUMENT&&!memcmp(bad,tetra,sizeof bad));
    allocation_budget=0;reject(w,body,tetra,4,12,0,12,AIR_B3_ALLOCATION);validate_geometry(w,body,tetra,4,12,AIR_B3_ALLOCATION);allocation_budget=-1;
    /* Source geometry is copied. Mutating caller positions cannot change hull. */
    CHECK(!air_b3_body_destroy(body[0],body[1]));body_create(w,body);memcpy(bad,tetra,sizeof bad);CHECK(!create(w,body,bad,4,0,2,shape));
    memset(bad,0,sizeof bad);h=b3Shape_GetHull(shape_id(shape));CHECK(near(h->volume,4));transport(w,body);CHECK(!air_b3_body_destroy(body[0],body[1]));
    float repeated[3*256];for(int i=0;i<256;++i){const float* p=tetra+3*(i%4);for(int j=0;j<3;++j)repeated[3*i+j]=i%5==4?.1f:p[j];}
    body_create(w,body);CHECK(!create(w,body,repeated,256,0,2,shape));CHECK(b3Shape_GetHull(shape_id(shape))->vertexCount==4);CHECK(!air_b3_body_destroy(body[0],body[1]));
    /* A real 64-gon pointed pyramid exactly meets the full-edge ceiling. */
    float pyramid[3*66];for(int i=0;i<64;++i){float a=2*B3_PI*i/64;pyramid[3*i]=cosf(a);pyramid[3*i+1]=0;pyramid[3*i+2]=sinf(a);}pyramid[192]=0;pyramid[193]=2;pyramid[194]=0;
    body_create(w,body);CHECK(!create(w,body,pyramid,65,0,2,shape));h=b3Shape_GetHull(shape_id(shape));CHECK(h->vertexCount==65&&h->faceCount==65&&h->edgeCount==256);
    CHECK(!air_b3_world_debug_capture(w,1,1,&size)&&size==1+128*8);CHECK(!air_b3_world_debug_release(w));
    for(int i=0;i<65;++i){float a=2*B3_PI*i/65;pyramid[3*i]=cosf(a);pyramid[3*i+1]=0;pyramid[3*i+2]=sinf(a);}pyramid[195]=0;pyramid[196]=2;pyramid[197]=0;
    reject(w,body,pyramid,66,198,0,2,AIR_B3_UNSUPPORTED);validate_geometry(w,body,pyramid,66,198,AIR_B3_UNSUPPORTED);CHECK(!air_b3_body_destroy(body[0],body[1]));
    /* Capacity is derived from real sizeof/workspace and supplied address size,
       not 128 raw points. Test one exact byte below the necessary-space bound. */
    size_t points,offset,work,scratch;CHECK(!air_b3_hull_scratch_size(256,SIZE_MAX,&points,&offset,&work,&scratch));
    size_t exact=points+scratch+8,a=11,b=12,c=13,d=14;CHECK(!air_b3_hull_scratch_size(256,exact,&a,&b,&c,&d)&&a==points&&b==offset&&c==work&&d==scratch);
    a=11;b=12;c=13;d=14;CHECK(air_b3_hull_scratch_size(256,exact-1,&a,&b,&c,&d)==AIR_B3_CAPACITY&&a==11&&b==12&&c==13&&d==14);
    body_create(w,body);CHECK(!create(w,body,tetra,4,0,0,shape));CHECK(!air_b3_body_state(w,body[0],body[1],0,state)&&near(state[31],12));CHECK(!air_b3_body_destroy(body[0],body[1]));
    for(int i=0;i<128;++i){body_create(w,body);CHECK(!create(w,body,tetra,4,1,2,shape));CHECK(!air_b3_body_state(w,body[0],body[1],2,state)&&state[48]==1);
        CHECK(!air_b3_mass_shape_destroy(w,body[0],body[1],shape[0],shape[1],2));CHECK(air_b3_body_mass_ready(w,body[0],body[1],2)==AIR_B3_MASS_PENDING);CHECK(!air_b3_body_destroy(body[0],body[1]));}
    CHECK(!air_b3_world_destroy(w));air_b3_live_bytes(final);CHECK(!memcmp(baseline,final,sizeof baseline));
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"checks\":{\"pureGeometryValidation\":true,\"trueTetraMassInertia\":true,\"nonBoxRayAndDebug\":true,\"ordinaryFailureNoWrite\":true,\"finiteAndDegenerateInputs\":true,\"copiedInputLifetime\":true,\"commandMotionCompatibility\":true,\"raw256Points\":true,\"exact128EdgeBoundary\":true,\"derivedCapacityBoundary\":true,\"sensor128Lifetimes\":true,\"coreCleanup\":true},\"scope\":\"Native point-cloud bridge only; no Cocos or EX01 qualification\"}\n",sizeof(void*));return 0;
}
