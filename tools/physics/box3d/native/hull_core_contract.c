/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Compile this TU against the candidate core includes/library. Including hull.c
   makes the exact production workspace/containment routines inspectable without
   exporting test APIs. Do not also compile a separate hull.c into this target.
   Execution evidence is in build receipts. */
#include "hull.c"
#include <stdio.h>
#define CHECK(x) do{if(!(x)){fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x);exit(1);}}while(0)
static b3HullData* checked(const b3Vec3* p,int n,int budget,b3HullCookInfo* info){
    size_t bytes;CHECK(b3GetHullWorkspaceSize(n,budget,&bytes));void* work=malloc(bytes);CHECK(work);
    b3HullData* h=b3CreateHullChecked(p,n,budget,work,bytes,info);free(work);return h;
}
static void equivalent(const b3Vec3* p,int n){
    b3HullData* legacy=b3CreateHull(p,n,B3_MAX_HULL_VERTICES);CHECK(legacy);
    b3HullCookInfo info;b3HullData* strict=checked(p,n,B3_MAX_HULL_VERTICES,&info);
    CHECK(strict&&info.status==b3_hullCookSuccess&&info.maximumSeparation<=info.minOutside);
    CHECK(legacy->byteCount==strict->byteCount&&!memcmp(legacy,strict,legacy->byteCount));
    b3DestroyHull(strict);b3DestroyHull(legacy);
}
int main(void){
    const b3Vec3 tetra[]={{0,0,0},{2,0,0},{0,3,0},{0,0,4}};equivalent(tetra,4);
    b3Vec3 repeated[256];for(int i=0;i<256;++i)repeated[i]=i%5==4?(b3Vec3){.1f,.1f,.1f}:tetra[i%4];equivalent(repeated,256);
    const b3Vec3 prism[]={{0,0,0},{2,0,0},{0,3,0},{0,0,1},{2,0,1},{0,3,1}};equivalent(prism,6);
    const b3Vec3 octa[]={{1,0,0},{-1,0,0},{0,1,0},{0,-1,0},{0,0,1},{0,0,-1}};
    b3HullData* reduced=b3CreateHull(octa,6,4);CHECK(reduced&&reduced->vertexCount==4);b3DestroyHull(reduced);
    b3HullCookInfo info;CHECK(!checked(octa,6,4,&info));CHECK(info.status==b3_hullCookIncomplete&&info.budgetExhausted&&info.firstOutsidePoint>=0&&info.maximumSeparation>info.minOutside);
    equivalent(octa,6);
    /* Exact scalar-boundary unit check, distinct from the genuine hull cases.
       It calls the production all-input checker and production tolerance code.
       Equality is legal; one nextafter float beyond minOutside must fail. */
    b3HullBuilder b={0};CHECK(b3HullBuilder_ComputeTolerance(&b,4,tetra));b3QHList_Init(&b.faceList.link);
    b3QHFace face={0};face.plane=(b3Plane){{1,0,0},0};b3QHList_PushBack(&b.faceList.link,&face.link);
    b3Vec3 point={nextafterf(b.minOutside,-INFINITY),0,0};CHECK(b3HullBuilder_CheckAllPoints(&b,&point,1,&info));
    point.x=b.minOutside;CHECK(b3HullBuilder_CheckAllPoints(&b,&point,1,&info)&&info.maximumSeparation==b.minOutside);
    point.x=nextafterf(b.minOutside,INFINITY);CHECK(!b3HullBuilder_CheckAllPoints(&b,&point,1,&info)&&info.status==b3_hullCookIncomplete);
    /* Exact workspace boundary, derived from this actual host/WASM layout.
       No allocation or invented point cap is needed to test the boundary. */
    int low=4,high=INT_MAX-4;size_t bytes=0,canary=123;
    while(low<high){int mid=low+(high-low)/2+1;size_t ignored;if(b3GetHullWorkspaceSize(mid,128,&ignored))low=mid;else high=mid-1;}
    CHECK(b3GetHullWorkspaceSize(low,128,&bytes)&&bytes<=INT_MAX);
    CHECK(!b3GetHullWorkspaceSize(low+1,128,&canary)&&canary==123);
    CHECK(!b3GetHullWorkspaceSize(INT_MAX,128,&canary)&&canary==123);
    size_t small;CHECK(b3GetHullWorkspaceSize(4,128,&small));void* work=malloc(small);CHECK(work);
    CHECK(!b3CreateHullChecked(tetra,4,128,work,small-1,&info)&&info.status==b3_hullCookCapacity);free(work);
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"layout\":{\"vertex\":%zu,\"halfEdge\":%zu,\"face\":%zu,\"frame\":%zu},\"maximumPointCount\":%d,\"workBytes\":%zu,\"checks\":{\"realHullEquivalence\":true,\"budgetSpikeRejected\":true,\"strictMinOutsideBoundary\":true,\"exactWorkspaceBoundary\":true}}\n",sizeof(void*),sizeof(b3QHVertex),sizeof(b3QHHalfEdge),sizeof(b3QHFace),sizeof(b3HorizonFrame),low,bytes);
    return 0;
}
