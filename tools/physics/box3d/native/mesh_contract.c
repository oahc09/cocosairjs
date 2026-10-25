/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Real bridge resource qualification; this TU owns the exact world collector. */
#define AIR_B3_BRIDGE_QUALIFICATION
#include "world_bridge.c"
#include "mesh_bridge.h"
#include "body_control.h"
#include "physics_world.h"
#include <stdio.h>
#include <limits.h>
static int checks;
#define CHECK(x) do { ++checks; if (!(x)) { fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x); exit(1); } } while(0)
static uint64_t full(const uint32_t* id) { return ((uint64_t)id[1]<<32)|id[0]; }
static void body(uint32_t w,int type,uint32_t* out,float x) {
 float p[16]={x,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1}; CHECK(!air_b3_body_create(w,type,p,1,out));
}
static void geometry(float* p,int32_t* indices) {
 const int order[3]={2,0,1};
 for(int i=0;i<3;++i){float x=order[i]*3.0f;float v[12]={x-.5f,0,-.5f,x+.5f,0,-.5f,x+.5f,0,.5f,x-.5f,0,.5f};memcpy(p+12*i,v,sizeof v);
  int32_t t[6]={4*i,4*i+2,4*i+1,4*i,4*i+3,4*i+2};memcpy(indices+6*i,t,sizeof t);}
}
static void state(uint32_t w,const uint32_t* r,unsigned leases,unsigned borrows) {
 uint32_t out[6];CHECK(!air_b3_mesh_state(w,r[0],r[1],out));CHECK(out[0]==leases&&out[1]==borrows&&out[2]==12&&out[3]==6&&out[4]>0&&out[5]==w);
}
static int face_contains(const float* p,const int32_t* ids,int face,b3Pos hit) {
 b3Vec3 a={p[3*ids[3*face]],p[3*ids[3*face]+1],p[3*ids[3*face]+2]};
 b3Vec3 b={p[3*ids[3*face+1]],p[3*ids[3*face+1]+1],p[3*ids[3*face+1]+2]};
 b3Vec3 c={p[3*ids[3*face+2]],p[3*ids[3*face+2]+1],p[3*ids[3*face+2]+2]};
 double area=(b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z);
 double u=((hit.x-a.x)*(c.z-a.z)-(c.x-a.x)*(hit.z-a.z))/area;
 double v=((b.x-a.x)*(hit.z-a.z)-(hit.x-a.x)*(b.z-a.z))/area;
 return fabs(hit.y)<1e-6 && u>=-1e-6 && v>=-1e-6 && u+v<=1.000001;
}
static void rays(uint32_t w,const uint32_t* shape,const float* p,const int32_t* indices) {
 for(int panel=0;panel<3;++panel){b3RayResult h=b3World_CastRayClosest(b3LoadWorldId(w),(b3Pos){3.0f*panel+.2f,2,.1f},(b3Vec3){0,-4,0},b3DefaultQueryFilter());
  CHECK(h.hit&&b3StoreShapeId(h.shapeId)==full(shape));CHECK(fabsf(h.fraction-.5f)<1e-6f&&h.normal.y>.999f);
  int32_t source=-77;CHECK(!air_b3_mesh_face_read(w,shape[0],shape[1],h.triangleIndex,&source));CHECK(source>=0&&source<6&&face_contains(p,indices,source,h.point));}
 b3RayResult gap=b3World_CastRayClosest(b3LoadWorldId(w),(b3Pos){1.5f,2,0},(b3Vec3){0,-4,0},b3DefaultQueryFilter());CHECK(!gap.hit);
}
static void run(int order) {
 uint32_t baseline[2];air_b3_live_bytes(baseline);
 uint32_t w=air_b3_world_create(0,-10,0),other=air_b3_world_create(0,0,0);CHECK(w&&other&&w!=other);
 float p[36];int32_t ix[18];geometry(p,ix);uint32_t r[2]={0},b[3][2],sh[3][2];
 CHECK(!air_b3_mesh_cook(w,p,12,36,ix,6,18,r));CHECK(full(r)!=0);state(w,r,1,0);
 CHECK(air_b3_mesh_retain(other,r[0],r[1])==AIR_B3_INVALID);CHECK(!air_b3_mesh_retain(w,r[0],r[1]));state(w,r,2,0);CHECK(!air_b3_mesh_release(w,r[0],r[1]));
 for(int i=0;i<3;++i){body(w,0,b[i],i*20.0f);CHECK(!air_b3_mesh_shape_create(w,b[i][0],b[i][1],r[0],r[1],sh[i]));state(w,r,1,i+1);}
 rays(w,sh[0],p,ix);
 uint32_t debugSize[1];CHECK(!air_b3_world_debug_capture(w,1,1,debugSize));CHECK(debugSize[0]>0);CHECK(!air_b3_world_debug_release(w));
 /* A failed cook cannot change existing mesh rays or a single ownership count. */
 for(int budget=0;budget<2;++budget){uint32_t before[6],after[6],out[2]={123,456};CHECK(!air_b3_bridge_memory(w,before));allocation_budget=budget;
  CHECK(air_b3_mesh_cook(w,p,12,36,ix,6,18,out)==AIR_B3_ALLOCATION);allocation_budget=-1;
  CHECK(out[0]==123&&out[1]==456);CHECK(!air_b3_bridge_memory(w,after)&&!memcmp(before,after,sizeof before));state(w,r,1,3);rays(w,sh[0],p,ix);}
 uint32_t out[2]={123,456},memory[6],memory2[6];CHECK(!air_b3_bridge_memory(w,memory));allocation_budget=0;
 CHECK(air_b3_mesh_shape_create(w,b[0][0],b[0][1],r[0],r[1],out)==AIR_B3_ALLOCATION);allocation_budget=-1;
 CHECK(out[0]==123&&out[1]==456);CHECK(!air_b3_bridge_memory(w,memory2)&&!memcmp(memory,memory2,sizeof memory));
 int32_t bad[18];memcpy(bad,ix,sizeof bad);bad[17]=12;CHECK(air_b3_mesh_cook(w,p,12,36,bad,6,18,out)==AIR_B3_ARGUMENT);CHECK(out[0]==123&&out[1]==456);
 float saved=p[0];p[0]=NAN;CHECK(air_b3_mesh_cook(w,p,12,36,ix,6,18,out)==AIR_B3_ARGUMENT);p[0]=saved;
 memcpy(bad,ix,sizeof bad);memcpy(bad+3,bad,3*sizeof(int32_t));CHECK(air_b3_mesh_cook(w,p,12,36,bad,6,18,out)==AIR_B3_UNSUPPORTED);
 CHECK(air_b3_mesh_cook(w,p,12,35,ix,6,18,out)==AIR_B3_ARGUMENT);
 CHECK(air_b3_mesh_cook(w,p,12,36,ix,6,18,(uint32_t*)p)==AIR_B3_ARGUMENT);
 for(int type=1;type<=2;++type){uint32_t nb[2];body(w,type,nb,80);CHECK(air_b3_mesh_shape_create(w,nb[0],nb[1],r[0],r[1],out)==AIR_B3_UNSUPPORTED);CHECK(!air_b3_body_destroy(nb[0],nb[1]));
  float t[1]={(float)type};CHECK(air_b3_body_control(w,b[0][0],b[0][1],AIR_B3_CTL_TYPE,t,2)==AIR_B3_UNSUPPORTED);CHECK(!air_b3_world_step(w,1.0f/60,4));rays(w,sh[0],p,ix);}
 float bs[49];CHECK(!air_b3_body_state(w,b[0][0],b[0][1],2,bs));CHECK(bs[0]==0&&bs[31]==0&&bs[47]==0);
 float t[1]={0};CHECK(!air_b3_body_control(w,b[0][0],b[0][1],AIR_B3_CTL_TYPE,t,2));
 /* Native allocation owns a copy, not this original source array. */
 p[0]=999;float original[36];geometry(original,bad);rays(w,sh[0],original,ix);p[0]=saved;
 if(order==0){CHECK(!air_b3_mesh_release(w,r[0],r[1]));state(w,r,0,3);CHECK(air_b3_mesh_release(w,r[0],r[1])==AIR_B3_INVALID);
  CHECK(!air_b3_shape_destroy(sh[1][0],sh[1][1]));state(w,r,0,2);CHECK(!air_b3_body_destroy(b[2][0],b[2][1]));state(w,r,0,1);rays(w,sh[0],p,ix);
  CHECK(!air_b3_mass_shape_destroy(w,b[0][0],b[0][1],sh[0][0],sh[0][1],2));CHECK(air_b3_mesh_state(w,r[0],r[1],memory)==AIR_B3_INVALID);}
 else if(order==1){for(int i=2;i>=0;--i){CHECK(!air_b3_body_destroy(b[i][0],b[i][1]));state(w,r,1,i);}CHECK(!air_b3_mesh_release(w,r[0],r[1]));CHECK(air_b3_mesh_state(w,r[0],r[1],memory)==AIR_B3_INVALID);}
 else if(order==2){CHECK(!air_b3_shape_destroy(sh[0][0],sh[0][1]));state(w,r,1,2);CHECK(!air_b3_mesh_release(w,r[0],r[1]));state(w,r,0,2);}
 CHECK(!air_b3_world_destroy(w));CHECK(air_b3_mesh_release(w,r[0],r[1])==AIR_B3_INVALID);CHECK(!air_b3_world_destroy(other));
 uint32_t bytes[2],bridge[6];air_b3_live_bytes(bytes);CHECK(!memcmp(bytes,baseline,sizeof bytes));CHECK(!air_b3_bridge_memory(0,bridge));CHECK(bridge[0]==0&&bridge[1]==0&&bridge[2]==0);
 fprintf(stderr,"releaseOrder=%d PASS checks=%d\n",order,checks);
}
int main(void) { for(int i=0;i<4;++i)run(i);printf("{\"status\":\"PASS\",\"checks\":%d,\"pointerBytes\":%zu,\"releaseOrders\":4,\"scope\":\"mesh-bridge-resource-contract\"}\n",checks,sizeof(void*));return 0; }
