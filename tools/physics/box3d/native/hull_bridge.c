/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Full native point-cloud cooking candidate. No world changes before accepted
   topology, all-input containment and the cooked-hull mass/bounds preflight. */
#include "air_box3d.h"
#include "hull_bridge.h"
#include "world_bridge.h"
#include "math_internal.h"
#include <box3d/box3d.h>
#include <box3d/collision.h>
#include <box3d/constants.h>
#include <limits.h>
#include <math.h>
#include <string.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/heap.h>
#endif
_Static_assert(sizeof(float)==4&&sizeof(b3Vec3)==12,"XYZ float32 wire");
static int region(const void* p,size_t bytes){
    uintptr_t at=(uintptr_t)p;if(!p||at%4||at>UINTPTR_MAX-bytes)return 0;
#ifdef __EMSCRIPTEN__
    if(at+bytes>emscripten_get_heap_size())return 0;
#endif
    return 1;
}
static int overlaps(const void* a,size_t na,const void* b,size_t nb){
    return (uintptr_t)a<(uintptr_t)b+nb&&(uintptr_t)b<(uintptr_t)a+na;
}
int air_b3_hull_scratch_size(int count,size_t limit,size_t* inputBytes,size_t* workOffset,size_t* workBytes,size_t* scratchBytes){
    if(!inputBytes||!workOffset||!workBytes||!scratchBytes||count<4)return AIR_B3_ARGUMENT;
    if(count>INT_MAX/3||(size_t)count>SIZE_MAX/sizeof(b3Vec3))return AIR_B3_CAPACITY;
    size_t points=(size_t)count*sizeof(b3Vec3),work;
    if(points>SIZE_MAX-7||!b3GetHullWorkspaceSize(count,B3_MAX_HULL_VERTICES,&work))return AIR_B3_CAPACITY;
    size_t offset=(points+7)&~(size_t)7;
    if(work>SIZE_MAX-offset)return AIR_B3_CAPACITY;
    size_t scratch=offset+work;
    /* The wire input and future scratch must coexist, along with 8 output bytes.
       This is a necessary address-space bound, not a promise of free memory.
       Existing live allocations, malloc metadata and the final core hull/clone
       can still exhaust memory; no claim of recoverable core OOM is made. */
    if(points>limit||scratch>limit-points||limit-points-scratch<2*sizeof(uint32_t))return AIR_B3_CAPACITY;
    *inputBytes=points;*workOffset=offset;*workBytes=work;*scratchBytes=scratch;return AIR_B3_OK;
}
static int topology_and_containment(const b3HullData* h,const b3Vec3* original,int count,float minOutside){
    if(!h||h->version!=B3_HULL_VERSION||h->hash==0||!isfinite(minOutside)||minOutside<0)return AIR_B3_ARGUMENT;
    int v=h->vertexCount,e=h->edgeCount,f=h->faceCount;
    if(v<4||v>B3_MAX_HULL_VERTICES||f<4||f>B3_MAX_HULL_FACES||e<12||e>2*B3_MAX_HULL_EDGES||e%2||v-e/2+f!=2)return AIR_B3_UNSUPPORTED;
    /* Only a freshly emitted core object reaches this function, not an external
       serialized object. Its array allocation/offsets belong to the core. */
    const b3HullHalfEdge* edges=b3GetHullEdges(h);const b3HullFace* faces=b3GetHullFaces(h);
    const b3HullVertex* vertices=b3GetHullVertices(h);const b3Plane* planes=b3GetHullPlanes(h);
    const b3Vec3* points=b3GetHullPoints(h);
    if(!edges||!faces||!vertices||!planes||!points)return AIR_B3_UNSUPPORTED;
    for(int i=0;i<v;++i)if(vertices[i].edge>=e||edges[vertices[i].edge].origin!=i||!b3IsValidVec3(points[i]))return AIR_B3_UNSUPPORTED;
    for(int i=0;i<e;++i){const b3HullHalfEdge* edge=edges+i;
        if(edge->origin>=v||edge->face>=f||edge->next>=e||edge->twin>=e||edge->twin==i)return AIR_B3_UNSUPPORTED;
        if(edges[edge->twin].twin!=i||edges[edge->next].origin!=edges[edge->twin].origin)return AIR_B3_UNSUPPORTED;
    }
    uint8_t visited[2*B3_MAX_HULL_EDGES]={0};
    for(int i=0;i<f;++i){
        if(faces[i].edge>=e||!b3IsValidVec3(planes[i].normal)||!isfinite(planes[i].offset))return AIR_B3_UNSUPPORTED;
        int first=faces[i].edge,at=first,length=0;
        do{if(at>=e||edges[at].face!=i||visited[at]||++length>e)return AIR_B3_UNSUPPORTED;
            visited[at]=1;at=edges[at].next;}while(at!=first);
        if(length<3)return AIR_B3_UNSUPPORTED;
        /* Also validate the final, restored-origin planes used by physics.
           Same minOutside and strict comparison; no hand-chosen epsilon.
           Large-translation cancellation is a refusal, not a geometry repair. */
        for(int j=0;j<count;++j){float separation=b3PlaneSeparation(planes[i],original[j]);
            if(!isfinite(separation))return AIR_B3_ARGUMENT;
            if(separation>minOutside)return AIR_B3_UNSUPPORTED;
        }
    }
    for(int i=0;i<e;++i)if(!visited[i])return AIR_B3_UNSUPPORTED;
    return AIR_B3_OK;
}
/* Shared owned result. Neither path duplicates construction or containment. */
typedef struct cooked_hull { b3HullData* hull; unsigned char* scratch; size_t scratchBytes; } cooked_hull;
static void cooked_release(uint32_t world,cooked_hull* cooked){
    if(cooked->hull)b3DestroyHull(cooked->hull);
    if(cooked->scratch)air_b3_bridge_temp_free(world,cooked->scratch,cooked->scratchBytes);
}
static int cook(uint32_t world,const float* positions,int count,int floatCount,
    uint32_t* out,size_t outBytes,cooked_hull* cooked){
    int status=air_b3_world_unlocked(world);if(status)return status;
    if(count<4||floatCount<0)return AIR_B3_ARGUMENT;
    if(count>INT_MAX/3)return AIR_B3_CAPACITY;
    if(floatCount!=3*count)return AIR_B3_ARGUMENT;
    size_t addressLimit=SIZE_MAX;
#ifdef __EMSCRIPTEN__
    addressLimit=emscripten_get_heap_max();
#endif
    size_t inputBytes,offset,workBytes,scratchBytes;
    status=air_b3_hull_scratch_size(count,addressLimit,&inputBytes,&offset,&workBytes,&scratchBytes);if(status)return status;
    if(!region(positions,inputBytes)||(outBytes&&(!region(out,outBytes)||overlaps(positions,inputBytes,out,outBytes))))return AIR_B3_ARGUMENT;
    for(int i=0;i<floatCount;++i)if(!isfinite(positions[i]))return AIR_B3_ARGUMENT;
    cooked->scratch=air_b3_bridge_temp_alloc(world,scratchBytes);if(!cooked->scratch)return AIR_B3_ALLOCATION;
    cooked->scratchBytes=scratchBytes;
    b3Vec3* copied=(b3Vec3*)cooked->scratch;
    for(int i=0;i<count;++i)copied[i]=(b3Vec3){positions[3*i],positions[3*i+1],positions[3*i+2]};
    b3HullCookInfo info;
    cooked->hull=b3CreateHullChecked(copied,count,B3_MAX_HULL_VERTICES,cooked->scratch+offset,workBytes,&info);
    if(!cooked->hull){
        switch(info.status){
        case b3_hullCookCapacity:status=AIR_B3_CAPACITY;break;
        case b3_hullCookArgument:case b3_hullCookNumeric:status=AIR_B3_ARGUMENT;break;
        case b3_hullCookDegenerate:case b3_hullCookTopology:case b3_hullCookIncomplete:status=AIR_B3_UNSUPPORTED;break;
        default:status=AIR_B3_CREATION;break;
        }
    }else status=topology_and_containment(cooked->hull,copied,count,info.minOutside);
    return status;
}
int air_b3_hull_validate(uint32_t world,const float* positions,int count,int floatCount){
    cooked_hull cooked={0};int status=cook(world,positions,count,floatCount,NULL,0,&cooked);
    /* No shape/body is created even on success. Core allocation/assertion traps
       do not reach this normal-return cleanup and remain UNKNOWN, not rollback. */
    cooked_release(world,&cooked);return status;
}
int air_b3_mass_hull_create(uint32_t world,uint32_t lo,uint32_t hi,const float* positions,int count,int floatCount,
    float density,int sensor,float target,uint32_t* out){
    int status=air_b3_world_unlocked(world);if(status)return status;
    b3BodyId body=b3LoadBodyId(((uint64_t)hi<<32)|lo);
    if(!b3Body_IsValid(body)||b3StoreWorldId(b3Body_GetWorld(body))!=world)return AIR_B3_INVALID;
    if(!isfinite(density)||density<=0||(sensor!=0&&sensor!=1)||!isfinite(target)||target<0)return AIR_B3_ARGUMENT;
    cooked_hull cooked={0};status=cook(world,positions,count,floatCount,out,2*sizeof(uint32_t),&cooked);
    if(!status)status=air_b3_mass_cooked_hull_create(world,lo,hi,cooked.hull,density,sensor,target,out);
    /* The world owns its clone/reference after success. The temporary remains
       ours on every ordinary return. A trap cannot execute this cleanup. */
    cooked_release(world,&cooked);return status;
}
