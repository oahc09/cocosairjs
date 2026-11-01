/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Actual fixed-core ray ABI contract. Host run is diagnostic, never WASM evidence. */
#include "air_box3d.h"
#include "physics_world.h"
#include <box3d/box3d.h>
#include <float.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x); exit(1); } } while (0)
static float getf(const uint32_t* p) { float value; memcpy(&value,p,4); return value; }
static const uint32_t* find(const uint32_t* out,uint32_t n,const uint32_t* id) {
    for(uint32_t i=0;i<n;++i) if(out[11*i]==id[0]&&out[11*i+1]==id[1]) return out+11*i;
    return NULL;
}
int main(void) {
    uint32_t baseline[2],after[2]; air_b3_live_bytes(baseline);
    uint32_t w=air_b3_world_create(0,0,0),bodyId[2],ids[8]; CHECK(w);
    float pose[16]={0,0,0,0,0,0,1}; CHECK(!air_b3_body_create(w,0,pose,1,bodyId));
    CHECK(!air_b3_shape_sphere_ex(bodyId[0],bodyId[1],0,0,0,.5f,1,1,ids));
    CHECK(!air_b3_shape_sphere_ex(bodyId[0],bodyId[1],2,0,0,.5f,1,1,ids+2));
    CHECK(!air_b3_shape_sphere_ex(bodyId[0],bodyId[1],4,0,0,.5f,1,0,ids+4));
    CHECK(!air_b3_shape_sphere_ex(bodyId[0],bodyId[1],6,0,0,.5f,1,0,ids+6));
    float ray[6]={0,0,0,10,0,0}; uint32_t out[44],n=99;
    CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,NULL,0,&n)); CHECK(n==2);
    CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,out,44,&n)); CHECK(n==2);
    CHECK(find(out,n,ids+4)&&find(out,n,ids+6));
    CHECK(fabsf(getf(find(out,n,ids+4)+8)-.35f)<1e-6f);
    CHECK(fabsf(getf(find(out,n,ids+6)+8)-.55f)<1e-6f);
    CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,1,out,44,&n)); CHECK(n==4);
    const uint32_t* inside=find(out,n,ids); CHECK(inside&&getf(inside+8)==0);
    for(int i=2;i<8;++i) CHECK(getf(inside+i)==0);
    uint32_t filters[2];
    CHECK(!air_b3_shape_filters_set(w,ids+4,1,UINT32_C(0x80000000),1,filters,2));
    CHECK(!air_b3_ray_query(w,ray,1,UINT32_C(0x80000000),0,out,44,&n)); CHECK(n==1&&find(out,n,ids+4));
    CHECK(!air_b3_ray_query(w,ray,UINT32_C(0x80000000),UINT32_MAX,0,out,44,&n)); CHECK(n==1&&find(out,n,ids+6));
    CHECK(!air_b3_shape_filters_set(w,ids+4,1,1,UINT32_MAX,filters,2));
    CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,out,44,&n)); CHECK(n==2);
    uint32_t canary[44]; for(int i=0;i<44;++i) canary[i]=out[i]=UINT32_C(0xdeadbeef); n=99;
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,out,43,&n)==AIR_B3_CAPACITY); CHECK(n==99&&!memcmp(out,canary,sizeof(out)));
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,2,out,44,&n)==AIR_B3_ARGUMENT);
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,out,-1,&n)==AIR_B3_ARGUMENT);
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,NULL,44,&n)==AIR_B3_ARGUMENT);
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,(uint32_t*)ray,6,&n)==AIR_B3_ARGUMENT);
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,out,44,out)==AIR_B3_ARGUMENT);
    CHECK(air_b3_ray_query(w,(float*)((char*)ray+1),1,UINT32_MAX,1,out,44,&n)==AIR_B3_ARGUMENT);
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,(uint32_t*)((char*)out+1),44,&n)==AIR_B3_ARGUMENT);
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,out,44,(uint32_t*)((char*)&n+1))==AIR_B3_ARGUMENT);
    float bad[6]={NAN,0,0,10,0,0};
    CHECK(air_b3_ray_query(w,bad,1,UINT32_MAX,1,out,44,&n)==AIR_B3_ARGUMENT);
    bad[0]=FLT_MAX;bad[3]=FLT_MAX;
    CHECK(air_b3_ray_query(w,bad,1,UINT32_MAX,1,out,44,&n)==AIR_B3_ARGUMENT);
    b3World* internal=b3GetWorldFromId(b3LoadWorldId(w));internal->locked=true;
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,out,44,&n)==AIR_B3_LOCKED);internal->locked=false;
    CHECK(n==99&&!memcmp(out,canary,sizeof(out)));
    float zero[6]={0}; CHECK(!air_b3_ray_query(w,zero,1,UINT32_MAX,1,out,44,&n));CHECK(n==0);
    CHECK(!air_b3_ray_query(w,ray,0,UINT32_MAX,1,out,44,&n));CHECK(n==0);
    CHECK(!air_b3_ray_query(w,ray,1,0,1,out,44,&n));CHECK(n==0);
    CHECK(!memcmp(out,canary,sizeof(out)));
    CHECK(!air_b3_world_destroy(w));n=99;
    CHECK(air_b3_ray_query(w,ray,1,UINT32_MAX,1,out,44,&n)==AIR_B3_INVALID);CHECK(n==99);
    w=air_b3_world_create(0,0,0);CHECK(w);CHECK(!air_b3_body_create(w,0,pose,1,bodyId));
    CHECK(!air_b3_shape_sphere_ex(bodyId[0],bodyId[1],2,0,0,.5f,1,0,ids));
    ray[3]=1.5f; CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,out,44,&n));CHECK(n==0);
    ray[3]=1.5f-1e-4f;CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,out,44,&n));CHECK(n==0);
    ray[3]=1.5f+1e-4f;CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,out,44,&n));CHECK(n==1);
    CHECK(!air_b3_shape_box(bodyId[0],bodyId[1],.5f,.5f,.5f,1,ids+2));ray[3]=10;
    CHECK(!air_b3_ray_query(w,ray,1,UINT32_MAX,0,out,44,&n));CHECK(n==2);
    inside=find(out,n,ids+2);CHECK(inside&&getf(inside+8)==0);for(int i=2;i<8;++i)CHECK(getf(inside+i)==0);
    CHECK(!air_b3_world_destroy(w));air_b3_live_bytes(after);CHECK(!memcmp(baseline,after,8));
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"genericAll\":true,\"triggerContinuation\":true,\"insideZero\":true,\"halfOpenEndpoint\":true,\"unsigned32Filters\":true,\"capacityAlignmentCanaries\":true,\"worldLockGeneration\":true,\"coreBytesRestored\":true}\n",sizeof(void*));
}
