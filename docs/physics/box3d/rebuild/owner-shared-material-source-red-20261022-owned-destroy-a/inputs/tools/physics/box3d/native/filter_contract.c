/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Actual fixed-core filter qualification; raw private access only for isolated negative setup. */
#include "air_box3d.h"
#include "physics_world.h"
#include <box3d/box3d.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x); exit(1); } } while (0)
static b3ShapeId sid(const uint32_t* id) { return b3LoadShapeId(((uint64_t)id[1]<<32)|id[0]); }
static void unchanged(uint32_t w,const uint32_t* ids,int n,const uint32_t* expected) {
    for(int i=0;i<n;++i) {uint32_t p[2];CHECK(!air_b3_shape_filter_get(w,ids[2*i],ids[2*i+1],p));CHECK(!memcmp(p,expected+2*i,8));}
}
int main(void) {
    uint32_t baseline[2],after[2];air_b3_live_bytes(baseline);
    uint32_t w=air_b3_world_create(0,0,0),other=air_b3_world_create(0,0,0),body[2],ids[10];CHECK(w&&other);
    float pose[16]={0,0,0,0,0,0,1};CHECK(!air_b3_body_create(w,2,pose,1,body));
    CHECK(!air_b3_shape_sphere(body[0],body[1],.5f,1,ids));
    CHECK(!air_b3_shape_sphere_ex(body[0],body[1],2,0,0,.5f,1,1,ids+2));
    CHECK(!air_b3_shape_box(body[0],body[1],1,1,1,1,ids+4));
    float sphere[5]={4,0,0,.5f,1};CHECK(!air_b3_mass_shape_create(w,body[0],body[1],0,sphere,0,0,ids+6));
    float box[11]={6,0,0,1,1,1,0,0,0,1,1};CHECK(!air_b3_mass_shape_create(w,body[0],body[1],1,box,1,0,ids+8));
    uint32_t expected[10],out[10];
    for(int i=0;i<5;++i){expected[2*i]=1;expected[2*i+1]=UINT32_MAX;}
    unchanged(w,ids,5,expected);
    uint32_t bitsets[3]={0,UINT32_C(0x80000000),UINT32_MAX};
    for(int i=0;i<3;++i){CHECK(!air_b3_shape_filters_set(w,ids,5,bitsets[i],bitsets[2-i],out,10));
        for(int k=0;k<5;++k){expected[2*k]=bitsets[i];expected[2*k+1]=bitsets[2-i];b3Filter f=b3Shape_GetFilter(sid(ids+2*k));CHECK(f.categoryBits==(uint64_t)bitsets[i]&&f.maskBits==(uint64_t)bitsets[2-i]&&f.groupIndex==0);}
        CHECK(!memcmp(expected,out,sizeof(out)));}
    uint32_t canary[10];for(int i=0;i<10;++i)canary[i]=out[i]=UINT32_C(0xdeadbeef);
    CHECK(air_b3_shape_filters_set(w,ids,5,1,1,out,9)==AIR_B3_CAPACITY);
    CHECK(air_b3_shape_filters_set(w,ids,4097,1,1,out,8194)==AIR_B3_CAPACITY);
    CHECK(air_b3_shape_filters_set(w,ids,5,1,1,ids,10)==AIR_B3_ARGUMENT);
    CHECK(air_b3_shape_filters_set(other,ids,5,1,1,out,10)==AIR_B3_INVALID);
    uint32_t batch[10];memcpy(batch,ids,sizeof(batch));batch[8]=ids[0];batch[9]=ids[1];
    CHECK(air_b3_shape_filters_set(w,batch,5,1,1,out,10)==AIR_B3_ARGUMENT);
    memcpy(batch,ids,sizeof(batch));batch[9]=UINT32_MAX;
    CHECK(air_b3_shape_filters_set(w,batch,5,1,1,out,10)==AIR_B3_INVALID);
    CHECK(!memcmp(canary,out,sizeof(out)));unchanged(w,ids,5,expected);
    b3World* internal=b3GetWorldFromId(b3LoadWorldId(w));internal->locked=true;
    CHECK(air_b3_shape_filters_set(w,ids,5,1,1,out,10)==AIR_B3_LOCKED);
    CHECK(air_b3_shape_filter_get(w,ids[0],ids[1],out)==AIR_B3_LOCKED);internal->locked=false;
    CHECK(!memcmp(canary,out,sizeof(out)));unchanged(w,ids,5,expected);
    b3Filter saved=b3Shape_GetFilter(sid(ids+8)),bad=saved;
    for(int kind=0;kind<3;++kind){bad=saved;if(kind==0)bad.categoryBits|=UINT64_C(1)<<40;if(kind==1)bad.maskBits|=UINT64_C(1)<<40;if(kind==2)bad.groupIndex=-1;
        b3Shape_SetFilter(sid(ids+8),bad,false);
        CHECK(air_b3_shape_filter_get(w,ids[8],ids[9],out)==AIR_B3_UNSUPPORTED);
        CHECK(air_b3_shape_filters_set(w,ids,5,1,1,out,10)==AIR_B3_UNSUPPORTED);
        CHECK(!memcmp(canary,out,sizeof(out)));unchanged(w,ids,4,expected);
        CHECK(b3Shape_GetFilter(sid(ids+8)).categoryBits==bad.categoryBits);
    }
    b3Shape_SetFilter(sid(ids+8),saved,false);unchanged(w,ids,5,expected);
    CHECK(!air_b3_shape_filters_set(w,NULL,0,1,1,NULL,0));
    uint32_t old[2]={ids[8],ids[9]};CHECK(!air_b3_shape_destroy(old[0],old[1]));
    CHECK(!air_b3_shape_sphere(body[0],body[1],.5f,1,ids+8));CHECK(ids[9]==old[1]&&ids[8]!=old[0]);
    CHECK(air_b3_shape_filter_get(w,old[0],old[1],out)==AIR_B3_INVALID);
    memcpy(batch,ids,sizeof(batch));batch[8]=old[0];batch[9]=old[1];
    CHECK(air_b3_shape_filters_set(w,batch,5,1,1,out,10)==AIR_B3_INVALID);CHECK(!memcmp(canary,out,sizeof(out)));
    CHECK(!air_b3_world_destroy(w));CHECK(!air_b3_world_destroy(other));air_b3_live_bytes(after);CHECK(!memcmp(baseline,after,8));
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"acceptedBitsets\":[0,2147483648,4294967295],\"nativeUpperBitsAndGroupReject\":true,\"batchNoPartialMutation\":true,\"lockedCapacityOverlapCanaries\":true,\"fullGenerationWorld\":true,\"defaultAllCreationPaths\":true,\"coreBytesRestored\":true}\n",sizeof(void*));
}
