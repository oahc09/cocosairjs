/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Independent executable only: compile the exact collector with allocation fault control.
   Product world_bridge.c has no fault-control symbol or conditional enabled. */
#define AIR_B3_BRIDGE_QUALIFICATION 1
#include "world_bridge.c"
#include <stdio.h>
#define CHECK(x) do { if(!(x)){fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x);exit(1);} }while(0)
static void body(uint32_t w,int type,uint32_t* out) {
    float p[16]={0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1};CHECK(air_b3_body_create(w,type,p,1,out)==0);
}
int main(void) {
    uint32_t mem[6],a[2],b[2],shape[2],foreign[2],size=0,canary[16];
    CHECK(air_b3_bridge_memory(0,mem)==0 && mem[0]==0 && mem[2]==0);
    allocation_budget=0;CHECK(air_b3_world_create(0,0,0)==0);allocation_budget=-1;
    CHECK(air_b3_bridge_memory(0,mem)==0 && mem[0]==0);
    uint32_t w=air_b3_world_create(0,0,0),w2=air_b3_world_create(0,0,0);CHECK(w&&w2);
    body(w,2,a);body(w2,2,b);CHECK(air_b3_shape_sphere(a[0],a[1],1,1,shape)==0);CHECK(air_b3_shape_sphere(b[0],b[1],1,1,foreign)==0);
    float out[3]={17,18,19};CHECK(air_b3_world_gravity_set(w,1,-2,3)==0);CHECK(air_b3_world_gravity_get(w,out)==0&&out[0]==1&&out[1]==-2&&out[2]==3);
    CHECK(air_b3_world_gravity_set(w,NAN,0,0)==AIR_B3_ARGUMENT);CHECK(air_b3_world_gravity_get(w,out)==0&&out[0]==1);
    CHECK(air_b3_world_sleep_set(w,2)==AIR_B3_ARGUMENT);CHECK(air_b3_world_sleep_set(w,0)==0);CHECK(air_b3_world_sleep_get(w,&size)==0&&size==0);
    CHECK(air_b3_shape_material_set(w,shape[0],shape[1],0.7f,0.4f)==0);
    CHECK(air_b3_shape_material_set(w,shape[0],shape[1],0.5f,INFINITY)==AIR_B3_ARGUMENT);
    CHECK(air_b3_shape_material_get(w,shape[0],shape[1],out)==0&&out[0]==0.7f&&out[1]==0.4f);
    out[0]=17;CHECK(air_b3_shape_material_get(w,foreign[0],foreign[1],out)==AIR_B3_INVALID&&out[0]==17);
    CHECK(air_b3_world_debug_capture(w,2,1,&size)==AIR_B3_UNSUPPORTED);
    allocation_budget=0;size=17;CHECK(air_b3_world_debug_capture(w,1,1,&size)==AIR_B3_ALLOCATION&&size==17);allocation_budget=-1;
    CHECK(air_b3_bridge_memory(w,mem)==0&&mem[3]==0&&mem[4]==0);
    CHECK(air_b3_world_debug_capture(w,1,1,&size)==0&&size==1+72*8);
    CHECK(air_b3_bridge_memory(w,mem)==0&&mem[3]==1&&mem[4]==128&&mem[5]==72);
    for(int i=0;i<16;++i)canary[i]=0x5a5a5a5a;
    CHECK(air_b3_world_debug_copy(w,canary,16)==AIR_B3_CAPACITY);
    for(int i=0;i<16;++i)CHECK(canary[i]==0x5a5a5a5a);
    CHECK(air_b3_world_debug_release(w)==0);CHECK(air_b3_bridge_memory(w,mem)==0&&mem[3]==1&&mem[4]==0);
    allocation_budget=1;CHECK(air_b3_world_debug_capture(w,1,1,&size)==AIR_B3_ALLOCATION);allocation_budget=-1;
    CHECK(air_b3_bridge_memory(w,mem)==0&&mem[3]==1&&mem[4]==0&&mem[2]==2);
    CHECK(air_b3_world_debug_capture(w,5,2,&size)==0&&size==1+73*8);CHECK(air_b3_world_debug_release(w)==0);
    CHECK(air_b3_shape_destroy(shape[0],shape[1])==0);CHECK(air_b3_bridge_memory(w,mem)==0&&mem[3]==0&&mem[2]==1);
    CHECK(air_b3_shape_sphere(a[0],a[1],1,1,shape)==0);CHECK(air_b3_world_debug_capture(w,1,1,&size)==0);
    CHECK(air_b3_body_destroy(a[0],a[1])==0);CHECK(air_b3_bridge_memory(w,mem)==0&&mem[3]==0);
    CHECK(air_b3_world_debug_release(w)==0);CHECK(air_b3_world_destroy(w)==0);
    CHECK(air_b3_world_debug_capture(w2,1,1,&size)==0);CHECK(air_b3_world_destroy(w2)==0);
    CHECK(air_b3_bridge_memory(0,mem)==0&&mem[0]==0&&mem[2]==0);
    /* Real callback overflow, not a hand-authored primitive stream. */
    w=air_b3_world_create(0,0,0);body(w,0,a);
    for(int i=0;i<912;++i)CHECK(air_b3_shape_sphere_ex(a[0],a[1],(float)i*3,0,0,1,1,0,shape)==0);
    CHECK(air_b3_world_debug_capture(w,1,1,&size)==AIR_B3_CAPACITY);
    CHECK(air_b3_bridge_memory(w,mem)==0&&mem[4]==0&&mem[5]==0);
    CHECK(air_b3_world_destroy(w)==0);CHECK(air_b3_bridge_memory(0,mem)==0&&mem[0]==0&&mem[2]==0);
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"creationAllocationFailure\":true,\"shapeAndGrowthAllocationFailure\":true,\"realCallbackOverflow\":true,\"capacityNoPartialWrite\":true,\"shapeBodyWorldCleanup\":true,\"worldIsolationAndMaterialNoWrite\":true,\"finalBridgeBytes\":0,\"qualificationAllocatorOnly\":true}\n",sizeof(void*));
    return 0;
}
