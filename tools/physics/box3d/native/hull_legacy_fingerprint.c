/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Build/run this unchanged source against baseline and patched core separately,
   per host/WASM mode, then compare stdout byte-for-byte. No execution claimed. */
#include <box3d/collision.h>
#include <box3d/constants.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
static void emit(const char* name,const b3Vec3* p,int n){
    b3HullData* h=b3CreateHull(p,n,B3_MAX_HULL_VERTICES);if(!h)exit(1);
    printf("%s %d %d %d %d %" PRIu64 "\n",name,h->vertexCount,h->faceCount,h->edgeCount,h->byteCount,h->hash);b3DestroyHull(h);
}
int main(void){
    const b3Vec3 t[]={{0,0,0},{2,0,0},{0,3,0},{0,0,4}};emit("tetra",t,4);
    const b3Vec3 p[]={{0,0,0},{2,0,0},{0,3,0},{0,0,1},{2,0,1},{0,3,1}};emit("prism",p,6);
    b3Vec3 more[256];for(int i=0;i<256;++i)more[i]=i%5==4?(b3Vec3){.1f,.1f,.1f}:t[i%4];emit("duplicates256",more,256);return 0;
}
