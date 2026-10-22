/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Real core qualification. Allocation/raw state controls exist only in this executable. */
#define AIR_B3_BRIDGE_QUALIFICATION
#include "world_bridge.c"
#include "command_bridge.h"
#include "body.h"
#include "physics_world.h"
#include <stdio.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/heap.h>
#endif
#define CHECK(x) do {if(!(x)){fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x);exit(1);}}while(0)
static void pf(uint32_t* p,float f){memcpy(p,&f,4);}
static float gf(const uint32_t* p){float f;memcpy(&f,p,4);return f;}
static b3BodyId id(const uint32_t* p){return b3LoadBodyId(((uint64_t)p[1]<<32)|p[0]);}
static void header(uint32_t* p,int b,int o){memset(p,0,(12+4*b+16*o)*4);uint32_t h[12]={AIR_B3_COMMAND_INPUT_MAGIC,1,12+4*b+16*o,b,o,4,16,12,12+4*b,0,4,0};memcpy(p,h,sizeof(h));pf(p+9,1.0f/60);}
static void body(uint32_t* p,int n,const uint32_t* b,float mass){p+=12+4*n;p[0]=b[0];p[1]=b[1];pf(p+2,mass);}
static uint32_t* op(uint32_t* p,int n,int b,int kind,int flags,uint64_t seq){p+=p[8]+16*n;p[0]=b;p[1]=kind;p[2]=flags;p[3]=(uint32_t)seq;p[4]=(uint32_t)(seq>>32);return p;}
static void vec(uint32_t* p,float x,float y,float z){pf(p,x);pf(p+1,y);pf(p+2,z);}
static void pose(uint32_t* p,float x,float y,float z,float qz,float qw){vec(p,x,y,z);vec(p+3,0,0,qz);pf(p+6,qw);}
static void capture(uint32_t w,const uint32_t* ids,float* out){for(int i=0;i<2;++i){CHECK(!air_b3_body_snapshot(ids[2*i],ids[2*i+1],out+78*i));CHECK(!air_b3_body_state(w,ids[2*i],ids[2*i+1],0,out+78*i+29));}}
static int negatives;
static void reject(uint32_t w,uint32_t* packet,int words,int capacity,int expected,const uint32_t* ids){
    float a[156],b[156];uint32_t before[6],after[6],out[1100],canary[1100];memset(out,0x5a,sizeof(out));memcpy(canary,out,sizeof(out));
    capture(w,ids,a);CHECK(!air_b3_bridge_memory(w,before));
    CHECK(air_b3_command_batch(w,packet,words,out,capacity,1)==expected);
    capture(w,ids,b);CHECK(!memcmp(a,b,sizeof(a)));CHECK(!memcmp(out,canary,sizeof(out)));
    CHECK(!air_b3_bridge_memory(w,after));CHECK(!memcmp(before,after,sizeof(before)));++negatives;
}
static void equal_plan(const uint32_t* out){
    for(uint32_t i=0;i<out[4];++i){const uint32_t* row=out+out[8]+80*i;
        /* Arithmetic order is part of the contract: bit equality, not a loose norm. */
        CHECK(!memcmp(row+30,row+48,12*4));
    }
    for(uint32_t i=0;i<out[3];++i){const uint32_t* row=out+12+160*i;
        CHECK(!memcmp(row+63,row+85,10*4));CHECK(!memcmp(row+73,row+108,12*4));
    }
}
int main(void){
    uint32_t baseline[2],final[2];air_b3_live_bytes(baseline);
    uint32_t w=air_b3_world_create(0,0,0),other=air_b3_world_create(0,0,0),ids[4],foreign[2],shape[2];CHECK(w&&other);
    float input[16]={0,0,0,0,0,0,1};CHECK(!air_b3_body_create(w,2,input,1,ids));
    float box[11]={.5f,.2f,0,1,.5f,.25f,0,sinf(.3f),0,cosf(.3f),1};
    CHECK(!air_b3_mass_shape_create(w,ids[0],ids[1],1,box,0,0,shape));
    CHECK(!air_b3_body_mass_set(w,ids[0],ids[1],2));CHECK(!air_b3_body_create(w,1,input,1,ids+2));CHECK(!air_b3_shape_box(ids[2],ids[3],1,.5f,.5f,1,shape));
    CHECK(!air_b3_body_create(other,2,input,1,foreign));
    uint32_t p[164],saved[164],out[1052];header(p,2,9);body(p,0,ids,2);body(p,1,ids+2,0);
    pose(op(p,0,0,8,4,1)+5,1,2,3,.3f,.7f);
    vec(op(p,1,0,1,1,2)+5,2,-3,4);vec(p+p[8]+16+8,.2f,.1f,-.3f);
    vec(op(p,2,0,2,1,3)+5,1,2,3);
    vec(op(p,3,0,3,1,4)+5,3,-2,1);vec(p+p[8]+48+8,.2f,.3f,-.1f);
    vec(op(p,4,0,4,1,5)+5,.3f,-.2f,.1f);
    pose(op(p,5,1,8,4,6)+5,5,6,7,0,1);
    pose(op(p,6,1,9,0,7)+5,5.01f,6,7,.01f,1);
    op(p,7,1,5,0,8);op(p,8,0,5,0,9);
    uint32_t count=p[2],outWords=12+320+9*80;float before[156],after[156];capture(w,ids,before);
    CHECK(!air_b3_command_batch(w,p,count,NULL,0,0));capture(w,ids,after);CHECK(!memcmp(before,after,sizeof(before)));
    memcpy(saved,p,sizeof(p));
    p[p[8]+8*16+1]=99;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    pf(p+p[8]+8*16+5,NAN);reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[16]=foreign[0];p[17]=foreign[1];reject(w,p,count,outWords,AIR_B3_INVALID,ids);memcpy(p,saved,sizeof(p));
    p[16]=ids[0];p[17]=ids[1];reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[p[8]+3]=0;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[p[8]+16+3]=1;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[p[8]+4]=0x200000;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[p[8]+16+15]=1;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[0]=0;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[2]--;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[3]=4097;reject(w,p,count,outWords,AIR_B3_CAPACITY,ids);memcpy(p,saved,sizeof(p));
    p[4]=16385;reject(w,p,count,outWords,AIR_B3_CAPACITY,ids);memcpy(p,saved,sizeof(p));
    p[5]=18;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[10]=3;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    pf(p+9,FLT_TRUE_MIN);reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    reject(w,p,count,outWords-1,AIR_B3_CAPACITY,ids);
    p[4]--;reject(w,p,count,outWords,AIR_B3_CAPACITY,ids);memcpy(p,saved,sizeof(p));
    p[p[8]+7*16+1]=6;reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    p[p[8]+6*16+1]=10;p[p[8]+6*16+2]=16;p[p[8]+6*16+3]=0;memset(p+p[8]+6*16+5,0,11*4);
    reject(w,p,count,outWords,AIR_B3_ARGUMENT,ids);memcpy(p,saved,sizeof(p));
    for(int budget=0;budget<3;++budget){allocation_budget=budget;reject(w,p,count,outWords,AIR_B3_ALLOCATION,ids);}allocation_budget=-1;
    b3World* internal=b3GetWorldFromId(b3LoadWorldId(w));capture(w,ids,before);internal->locked=true;CHECK(air_b3_command_batch(w,p,count,out,outWords,1)==AIR_B3_LOCKED);internal->locked=false;capture(w,ids,after);CHECK(!memcmp(before,after,sizeof(before)));++negatives;
    CHECK(air_b3_command_batch(w,p,count,p,outWords,1)==AIR_B3_ARGUMENT);
    CHECK(air_b3_command_batch(w,(const uint32_t*)((const char*)p+1),count,out,outWords,1)==AIR_B3_ARGUMENT);
    CHECK(air_b3_command_batch(w,p,count,out,0,0)==AIR_B3_ARGUMENT);
    CHECK(air_b3_command_batch(w,NULL,11,NULL,0,0)==AIR_B3_CAPACITY);
    CHECK(air_b3_command_batch(w,p,count,out,AIR_B3_COMMAND_MAX_OUTPUT_WORDS+1,1)==AIR_B3_CAPACITY);
    CHECK(air_b3_command_batch(w,p,-1,out,0,1)==AIR_B3_ARGUMENT);
#ifdef __EMSCRIPTEN__
    CHECK(air_b3_command_batch(w,(const uint32_t*)(emscripten_get_heap_size()-4),12,NULL,0,0)==AIR_B3_ARGUMENT);
    CHECK(air_b3_command_batch(w,p,count,(uint32_t*)(emscripten_get_heap_size()-4),outWords,1)==AIR_B3_ARGUMENT);
#endif
    uint32_t stale[2],replacement[2];CHECK(!air_b3_body_create(w,1,input,1,stale));CHECK(!air_b3_body_destroy(stale[0],stale[1]));
    CHECK(!air_b3_body_create(w,1,input,1,replacement));CHECK(stale[1]==replacement[1]&&stale[0]!=replacement[0]);
    p[16]=stale[0];p[17]=stale[1];reject(w,p,count,outWords,AIR_B3_INVALID,ids);memcpy(p,saved,sizeof(p));
    CHECK(!air_b3_body_destroy(replacement[0],replacement[1]));

    uint32_t empty[12];header(empty,0,0);CHECK(!air_b3_command_batch(w,empty,12,NULL,0,1));
    /* Last arithmetic overflow must reject the earlier admissible reset without writes. */
    uint32_t overflow[48];header(overflow,1,2);body(overflow,0,ids,2);
    vec(op(overflow,0,0,1,0,1)+5,FLT_MAX,0,0);vec(op(overflow,1,0,1,0,2)+5,FLT_MAX,0,0);
    reject(w,overflow,48,332,AIR_B3_ARGUMENT,ids);
    memset(out,0x5a,sizeof(out));CHECK(!air_b3_command_batch(w,p,count,out,outWords,1));equal_plan(out);
    /* Retain first mixed stream packet/output for offline inspection, before later tests. */
    uint32_t first[1052];memcpy(first,out,sizeof(first));
    b3BodyId dynamic=id(ids),kinematic=id(ids+2);
    b3Body_SetMassData(kinematic,(b3MassData){.mass=0,.center={.5f,.25f,0},.inertia={0}});
    uint32_t k[48];header(k,1,2);body(k,0,ids+2,0);pose(op(k,0,0,8,4,1)+5,1,2,3,0,1);pose(op(k,1,0,9,0,2)+5,1,2,3,.01f,1);
    CHECK(!air_b3_command_batch(w,k,48,out,332,1));equal_plan(out);
    /* Immediate impulse masks, including rotated non-diagonal local inertia. */
    b3Body_SetMotionLocks(dynamic,(b3MotionLocks){.linearX=true,.angularY=true});
    header(k,1,2);body(k,0,ids,2);vec(op(k,0,0,3,1,1)+5,10000,2,3);vec(k+16+8,.3f,.2f,.1f);vec(op(k,1,0,4,1,2)+5,1,2,3);
    CHECK(!air_b3_command_batch(w,k,48,out,332,1));equal_plan(out);CHECK(gf(out+12+108)==0&&gf(out+12+112)==0);
    /* Zero target/cleanup at a tiny real positive native cap, without forced wake. */
    float cap=internal->maxLinearSpeed;internal->maxLinearSpeed=FLT_MIN;
    header(k,1,1);body(k,0,ids+2,0);b3WorldTransform current=b3Body_GetTransform(kinematic);uint32_t* kp=op(k,0,0,9,0,1);
    vec(kp+5,current.p.x,current.p.y,current.p.z);vec(kp+8,current.q.v.x,current.q.v.y,current.q.v.z);pf(kp+11,current.q.s);
    CHECK(!air_b3_command_batch(w,k,32,out,252,1));equal_plan(out);CHECK(out[12+160+5]&8);internal->maxLinearSpeed=cap;
    header(k,1,2);body(k,0,ids+2,0);op(k,0,0,5,0,UINT64_C(9007199254740991));op(k,1,0,10,32,0);
    CHECK(!air_b3_command_batch(w,k,48,out,332,1));equal_plan(out);
    /* Full bounded transport is real execution, not a hand-written output packet. */
    uint32_t largeWorld=air_b3_world_create(0,0,0),bodyIds[8192];CHECK(largeWorld);
    uint32_t* big=malloc(AIR_B3_COMMAND_MAX_INPUT_WORDS*4u);uint32_t* large=malloc((AIR_B3_COMMAND_MAX_OUTPUT_WORDS+1u)*4u);CHECK(big&&large);
    header(big,4096,16384);for(int i=0;i<4096;++i){CHECK(!air_b3_body_create(largeWorld,0,input,1,bodyIds+2*i));body(big,i,bodyIds+2*i,0);}
    for(int i=0;i<16384;++i)op(big,i,i%4096,7,0,(uint64_t)i+1);
    large[AIR_B3_COMMAND_MAX_OUTPUT_WORDS]=0xaabbccdd;CHECK(!air_b3_command_batch(largeWorld,big,AIR_B3_COMMAND_MAX_INPUT_WORDS,large,AIR_B3_COMMAND_MAX_OUTPUT_WORDS,1));
    CHECK(large[AIR_B3_COMMAND_MAX_OUTPUT_WORDS]==0xaabbccdd);equal_plan(large);
    uint32_t memory[6];CHECK(!air_b3_bridge_memory(largeWorld,memory));CHECK(find_world(largeWorld)->temporary==NULL);
    free(big);free(large);CHECK(!air_b3_world_destroy(largeWorld));
    CHECK(!air_b3_world_destroy(other));CHECK(!air_b3_world_destroy(w));air_b3_live_bytes(final);CHECK(!memcmp(baseline,final,sizeof(final)));
    CHECK(negatives==25);
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"schemaSha256\":\"%s\",\"patchChainSha256\":\"%s\",\"negativeCases\":%d,\"checks\":{\"pureValidation\":true,\"lateRejectNoMutation\":true,\"allocationFailures\":true,\"exactFloatReplay\":true,\"rotatedOffsetAndLocks\":true,\"kinematicOffsetCOM\":true,\"tinyCapStationary\":true,\"protectedSequenceZero\":true,\"maxTransport\":true,\"temporaryCleanup\":true,\"coreCleanup\":true},\"limits\":{\"bodies\":4096,\"operations\":16384,\"inputWords\":278540,\"outputWords\":1966092},\"mixedInputWords\":[",sizeof(void*),air_b3_schema_sha(),air_b3_patch_chain_sha(),negatives);
    for(uint32_t i=0;i<count;++i)printf("%s%u",i?",":"",saved[i]);printf("],\"mixedOutputWords\":[");
    for(uint32_t i=0;i<outWords;++i)printf("%s%u",i?",":"",first[i]);printf("]}\n");return 0;
}
