/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Exact staged efca0c1 private layouts: no vendor edits, pointers or persistent allocations. */
#include "air_box3d.h"
#include "body_control.h"
#include "body.h"
#include "physics_world.h"
#include "shape.h"
#include <box3d/box3d.h>
#include <box3d/constants.h>
#include <math.h>
#include <string.h>
#include <stddef.h>

_Static_assert(sizeof(((b3Body*)0)->sleepTime)==4,"sleepTime layout reviewed");
_Static_assert(sizeof(((b3BodySim*)0)->force)==12,"force layout reviewed");
static b3BodyId bid(uint32_t lo,uint32_t hi){return b3LoadBodyId(((uint64_t)hi<<32)|lo);}
static int vec_ok(b3Vec3 v){return isfinite(v.x)&&isfinite(v.y)&&isfinite(v.z);}
static int matrix_ok(b3Matrix3 m){return vec_ok(m.cx)&&vec_ok(m.cy)&&vec_ok(m.cz);}
static void put(float* p,b3Vec3 v){p[0]=v.x;p[1]=v.y;p[2]=v.z;}
static b3Vec3 get(const float* p){return (b3Vec3){p[0],p[1],p[2]};}
int air_b3_world_unlocked(uint32_t world){
 if(!b3World_IsValid(b3LoadWorldId(world)))return AIR_B3_INVALID;
 return b3GetWorldFromId(b3LoadWorldId(world))->locked?AIR_B3_LOCKED:AIR_B3_OK;
}
static int context(uint32_t wid,b3BodyId id,b3World** w,b3Body** b){
 int s=air_b3_world_unlocked(wid);if(s)return s;
 if(!b3Body_IsValid(id)||b3StoreWorldId(b3Body_GetWorld(id))!=wid)return AIR_B3_INVALID;
 *w=b3GetWorldFromId(b3LoadWorldId(wid));*b=b3GetBodyFullId(*w,id);return 0;
}
static int supported(const b3Shape* s){return s->type==b3_sphereShape||s->type==b3_hullShape||s->type==b3_capsuleShape;}
/* Non-sensors win. Sensor-only bodies explicitly fall back to sensor geometry. */
static int mass_plan(b3World* w,b3Body* b,float target,int skip,const b3Shape* added,b3MassData* plan,int* fallback,int* pending){
 if(!isfinite(target)||target<=0||!isfinite(1.0f/target))return AIR_B3_ARGUMENT;
 int solids=0,sensors=0;
 for(int i=b->headShapeId;i!=B3_NULL_INDEX;){const b3Shape* s=b3Array_Get(w->shapes,i);i=s->nextShapeId;
  if(s->id==skip)continue;if(!supported(s))return AIR_B3_UNSUPPORTED;
  if(s->density>0){if(s->sensorIndex==B3_NULL_INDEX)++solids;else ++sensors;}}
 if(added&&added->density>0){if(added->sensorIndex==B3_NULL_INDEX)++solids;else ++sensors;}
 *fallback=solids==0&&sensors>0;*pending=solids+sensors==0;*plan=(b3MassData){0};
 if(*pending)return 0;
 double total=0,center[3]={0},inertia[9]={0};
 for(int pass=0;pass<2;++pass){
  for(int i=b->headShapeId,extra=0; i!=B3_NULL_INDEX||!extra;){
   const b3Shape* s;
   if(i!=B3_NULL_INDEX){s=b3Array_Get(w->shapes,i);i=s->nextShapeId;if(s->id==skip)continue;}
   else{extra=1;s=added;if(!s)continue;}
   if(s->density<=0||((s->sensorIndex!=B3_NULL_INDEX)!=(*fallback!=0)))continue;
   b3MassData m=b3ComputeShapeMass(s);
   if(!isfinite(m.mass)||m.mass<=0||!vec_ok(m.center)||!matrix_ok(m.inertia))return AIR_B3_ARGUMENT;
   float c[3];put(c,m.center);
   if(pass==0){total+=m.mass;for(int j=0;j<3;++j)center[j]+=(double)m.mass*c[j];}
   else{
    double d[3];for(int j=0;j<3;++j)d[j]=c[j]-center[j];double d2=d[0]*d[0]+d[1]*d[1]+d[2]*d[2];
    float a[9];put(a,m.inertia.cx);put(a+3,m.inertia.cy);put(a+6,m.inertia.cz);
    for(int col=0;col<3;++col)for(int row=0;row<3;++row)
     inertia[3*col+row]+=(double)a[3*col+row]+m.mass*((col==row?d2:0)-d[col]*d[row]);
   }
  }
  if(pass==0){if(!isfinite(total)||total<=0)return AIR_B3_ARGUMENT;for(int j=0;j<3;++j)center[j]/=total;}
 }
 float a[9];for(int j=0;j<9;++j)a[j]=(float)(inertia[j]*target/total);
 *plan=(b3MassData){target,{(float)center[0],(float)center[1],(float)center[2]},{get(a),get(a+3),get(a+6)}};
 float det=b3Det(plan->inertia);
 if(!vec_ok(plan->center)||!matrix_ok(plan->inertia)||!isfinite(det)||det<=0)return AIR_B3_ARGUMENT;
 b3Matrix3 inv=b3InvertT(plan->inertia);if(!matrix_ok(inv))return AIR_B3_ARGUMENT;
 b3BodySim* sim=b3GetBodySim(w,b);b3Matrix3 r=b3MakeMatrixFromQuat(sim->transform.q);
 if(!matrix_ok(b3MulMM(b3MulMM(r,inv),b3Transpose(r))))return AIR_B3_ARGUMENT;
 b3Pos centerWorld=b3TransformWorldPoint(sim->transform,plan->center);if(!vec_ok(centerWorld))return AIR_B3_ARGUMENT;
 b3BodyState* state=b3GetBodyState(w,b);
 if(state&&!vec_ok(b3Add(state->linearVelocity,b3Cross(state->angularVelocity,b3SubPos(centerWorld,sim->center)))))return AIR_B3_ARGUMENT;
 return 0;
}
/* Preserve origin, COM linear velocity and angular velocity, not momentum. Public SetMassData
   performs a COM velocity correction; restore the previously validated velocity explicitly. */
static void apply_mass(b3World* w,b3Body* b,b3BodyId id,b3MassData plan){
 if(b->type!=b3_dynamicBody)return;
 b3BodyState* state=b3GetBodyState(w,b);b3Vec3 v=state?state->linearVelocity:b3Vec3_zero,a=state?state->angularVelocity:b3Vec3_zero;
 b3Body_SetMassData(id,plan);state=b3GetBodyState(w,b);if(state){state->linearVelocity=v;state->angularVelocity=a;}
}
int air_b3_body_mass_set(uint32_t wid,uint32_t lo,uint32_t hi,float target){
 b3World* w;b3Body* b;b3BodyId id=bid(lo,hi);int s=context(wid,id,&w,&b);if(s)return s;
 b3MassData p;int f,n;s=mass_plan(w,b,target,B3_NULL_INDEX,NULL,&p,&f,&n);if(s)return s;
 apply_mass(w,b,id,p);return 0;
}
int air_b3_body_mass_ready(uint32_t wid,uint32_t lo,uint32_t hi,float target){
 b3World* w;b3Body* b;int s=context(wid,bid(lo,hi),&w,&b);if(s)return s;
 if(!isfinite(target)||target<0)return AIR_B3_ARGUMENT;if(target==0)return 0;
 b3MassData p;int f,n;s=mass_plan(w,b,target,B3_NULL_INDEX,NULL,&p,&f,&n);if(s)return s;
 return n&&b->type==b3_dynamicBody&&b->setIndex!=b3_disabledSet?AIR_B3_MASS_PENDING:0;
}
int air_b3_body_state(uint32_t wid,uint32_t lo,uint32_t hi,float target,float* out){
 if(!out)return AIR_B3_ARGUMENT;b3World* w;b3Body* b;b3BodyId id=bid(lo,hi);int s=context(wid,id,&w,&b);if(s)return s;
 if(!isfinite(target)||target<0)return AIR_B3_ARGUMENT;
 int fallback=0,pending=0;if(target>0){b3MassData p;s=mass_plan(w,b,target,B3_NULL_INDEX,NULL,&p,&fallback,&pending);if(s)return s;}
 float o[AIR_B3_BODY_STATE_FLOATS]={0};b3BodySim* sim=b3GetBodySim(w,b);
 o[0]=b->type;o[1]=b->setIndex!=b3_disabledSet;o[2]=b->setIndex==b3_awakeSet;o[3]=b->setIndex>=b3_firstSleepingSet;
 o[4]=o[1]&&o[2]&&b->type!=b3_staticBody&&w->enableSleep&&(b->flags&b3_enableSleep)&&b->sleepTime>0;
 o[5]=(b->flags&b3_enableSleep)!=0;o[6]=b3Body_IsBullet(id);o[7]=b->sleepTime;o[8]=b->sleepVelocity;o[9]=b->sleepThreshold;
 o[10]=sim->linearDamping;o[11]=sim->angularDamping;o[12]=sim->gravityScale;
 put(o+13,b3Body_GetLinearVelocity(id));put(o+16,b3Body_GetAngularVelocity(id));put(o+19,sim->force);put(o+22,sim->torque);
 b3MotionLocks locks=b3Body_GetMotionLocks(id);o[25]=!locks.linearX;o[26]=!locks.linearY;o[27]=!locks.linearZ;o[28]=!locks.angularX;o[29]=!locks.angularY;o[30]=!locks.angularZ;
 o[31]=b->mass;put(o+32,sim->localCenter);put(o+35,sim->inertia.cx);put(o+38,sim->inertia.cy);put(o+41,sim->inertia.cz);put(o+44,sim->center);
 o[47]=pending;o[48]=fallback;memcpy(out,o,sizeof(o));return 0;
}
int air_b3_body_control(uint32_t wid,uint32_t lo,uint32_t hi,int op,const float* p,float target){
 b3World* w;b3Body* b;b3BodyId id=bid(lo,hi);int s=context(wid,id,&w,&b);if(s)return s;
 int n=op==AIR_B3_CTL_FACTORS?6:op==AIR_B3_CTL_DAMPING?2:(op==10||op==11)?3:op>=12&&op<=14?0:1;
 if(op<1||op>14||(n&&!p)||!isfinite(target)||target<0)return AIR_B3_ARGUMENT;
 for(int i=0;i<n;++i)if(!isfinite(p[i]))return AIR_B3_ARGUMENT;
 if(op==1&&(p[0]<0||p[0]>2||p[0]!=(int)p[0]))return AIR_B3_ARGUMENT;
 if((op==2||op==5||op==7||op==8)&&(p[0]!=0&&p[0]!=1))return AIR_B3_ARGUMENT;
 if(op==3&&(p[0]<0||p[0]>1||p[1]<0||p[1]>1))return AIR_B3_ARGUMENT;
 if(op==6&&p[0]<0)return AIR_B3_ARGUMENT;
 if(op==9)for(int i=0;i<6;++i)if(p[i]!=0&&p[i]!=1)return AIR_B3_ARGUMENT;
 if((op==10||op==11)&&(b->type==b3_staticBody||b->setIndex==b3_disabledSet))return AIR_B3_UNSUPPORTED;
 if(op==1)for(int i=b->headShapeId;i!=B3_NULL_INDEX;){const b3Shape* sh=b3Array_Get(w->shapes,i);if(!supported(sh))return AIR_B3_UNSUPPORTED;i=sh->nextShapeId;}
 b3MassData plan;int f=0,pending=0;
 if(target>0&&(op==1||op==9)){s=mass_plan(w,b,target,B3_NULL_INDEX,NULL,&plan,&f,&pending);if(s)return s;}
 switch(op){
 case 1:b3Body_SetType(id,(b3BodyType)(int)p[0]);break;
 case 2:if(p[0])b3Body_Enable(id);else b3Body_Disable(id);break;
 case 3:b3Body_SetLinearDamping(id,p[0]);b3Body_SetAngularDamping(id,p[1]);break;
 case 4:b3Body_SetGravityScale(id,p[0]);break;
 case 5:b3Body_EnableSleep(id,p[0]!=0);break;
 case 6:b3Body_SetSleepThreshold(id,p[0]);break;
 case 7:b3Body_SetAwake(id,p[0]!=0);break;
 case 8:b3Body_SetBullet(id,p[0]!=0);break;
 case 9:{b3MotionLocks locks={!p[0],!p[1],!p[2],!p[3],!p[4],!p[5]};b3Body_SetMotionLocks(id,locks);break;}
 case 10:{b3MotionLocks locks=b3Body_GetMotionLocks(id);b3Vec3 v=get(p);if(locks.linearX)v.x=0;if(locks.linearY)v.y=0;if(locks.linearZ)v.z=0;b3Body_SetLinearVelocity(id,v);break;}
 case 11:b3Body_SetAngularVelocity(id,get(p));break;
 case 12:case 13:case 14:{b3BodySim* sim=b3GetBodySim(w,b);b3BodyState* state=b3GetBodyState(w,b);
  if(op!=13){sim->force=b3Vec3_zero;sim->torque=b3Vec3_zero;}
  if(op!=12&&state){state->linearVelocity=b3Vec3_zero;state->angularVelocity=b3Vec3_zero;}break;}
 }
 if(target>0&&(op==1||op==9))apply_mass(w,b,id,plan);
 return 0;
}
int air_b3_body_apply(uint32_t wid,uint32_t lo,uint32_t hi,int kind,int local,const float* p){
 b3World* w;b3Body* b;b3BodyId id=bid(lo,hi);int s=context(wid,id,&w,&b);if(s)return s;
 if(!p||kind<0||kind>3||(local!=0&&local!=1))return AIR_B3_ARGUMENT;
 for(int i=0;i<6;++i)if(!isfinite(p[i]))return AIR_B3_ARGUMENT;
 if(b->type!=b3_dynamicBody||b->setIndex==b3_disabledSet)return AIR_B3_UNSUPPORTED;
 b3BodySim* sim=b3GetBodySim(w,b);b3Vec3 v=get(p),offset=get(p+3);
 if(local){v=b3RotateVector(sim->transform.q,v);offset=b3RotateVector(sim->transform.q,offset);}
 b3Pos point=b3OffsetPos(sim->center,offset);b3Vec3 actualOffset=b3SubPos(point,sim->center);
 if(!vec_ok(v)||!vec_ok(point)||!vec_ok(actualOffset))return AIR_B3_ARGUMENT;
 b3Vec3 torque=kind<2?b3Cross(actualOffset,v):v;
 if(!vec_ok(torque))return AIR_B3_ARGUMENT;
 if(kind==0&&(!vec_ok(b3Add(sim->force,v))||!vec_ok(b3Add(sim->torque,torque))))return AIR_B3_ARGUMENT;
 if(kind==2&&!vec_ok(b3Add(sim->torque,torque)))return AIR_B3_ARGUMENT;
 if(kind==1||kind==3){b3Vec3 a=b3Add(b3Body_GetAngularVelocity(id),b3MulMV(sim->invInertiaWorld,torque));
  b3Vec3 velocity=kind==1?b3MulAdd(b3Body_GetLinearVelocity(id),sim->invMass,v):b3Body_GetLinearVelocity(id);
  if(!vec_ok(a)||!vec_ok(velocity)||!isfinite(b3LengthSquared(velocity)))return AIR_B3_ARGUMENT;}
 if(kind==0)b3Body_ApplyForce(id,v,point,true);
 else if(kind==1)b3Body_ApplyLinearImpulse(id,v,point,true);
 else if(kind==2)b3Body_ApplyTorque(id,v,true);
 else b3Body_ApplyAngularImpulse(id,v,true);
 /* Core only masks velocity in the next solve. AIR's binary world-axis factors
    are immediate velocity constraints, including offset/non-diagonal impulses. */
 if(kind==1||kind==3){b3BodyState* state=b3GetBodyState(w,b);if(state){
  if(b->flags&b3_lockLinearX)state->linearVelocity.x=0;
  if(b->flags&b3_lockLinearY)state->linearVelocity.y=0;
  if(b->flags&b3_lockLinearZ)state->linearVelocity.z=0;
  if(b->flags&b3_lockAngularX)state->angularVelocity.x=0;
  if(b->flags&b3_lockAngularY)state->angularVelocity.y=0;
  if(b->flags&b3_lockAngularZ)state->angularVelocity.z=0;
 }}
 return 0;
}
/* Capsule ABI: center.xyz, radius, halfSegment, exact axis 0/1/2, density.
   The pinned core collapses short capsules to spheres. Only an explicitly zero
   segment may take that path; test the actual float32 endpoints before creation. */
static int capsule_candidate(const float* p,b3Shape* candidate){
 if(p[3]<=0||p[4]<0||(p[5]!=0&&p[5]!=1&&p[5]!=2))return AIR_B3_ARGUMENT;
 if(p[4]==0){candidate->type=b3_sphereShape;candidate->sphere=(b3Sphere){get(p),p[3]};return 0;}
 float a[3]={p[0],p[1],p[2]},z[3]={p[0],p[1],p[2]};int axis=(int)p[5];a[axis]-=p[4];z[axis]+=p[4];
 b3Vec3 c1=get(a),c2=get(z);if(!vec_ok(c1)||!vec_ok(c2))return AIR_B3_ARGUMENT;
 float length2=b3DistanceSquared(c1,c2);if(!isfinite(length2))return AIR_B3_ARGUMENT;
 if(length2<=B3_LINEAR_SLOP*B3_LINEAR_SLOP)return AIR_B3_UNSUPPORTED;
 candidate->type=b3_capsuleShape;candidate->capsule=(b3Capsule){c1,c2,p[3]};return 0;
}
static int capsule_bounds_safe(b3World* w,b3Body* b,const b3Shape* candidate){
 b3BodySim* sim=b3GetBodySim(w,b);
 float extent=candidate->type==b3_capsuleShape?0.5f*b3Distance(candidate->capsule.center1,candidate->capsule.center2)+candidate->capsule.radius:candidate->sphere.radius;
 if(!isfinite(extent))return AIR_B3_ARGUMENT;
 float margin=b->type==b3_staticBody?B3_SPECULATIVE_DISTANCE:b3MinFloat(B3_MAX_AABB_MARGIN,B3_AABB_MARGIN_FRACTION*extent);
 b3AABB box=b3ComputeFatShapeAABB(candidate,sim->transform,B3_SPECULATIVE_DISTANCE);
 if(!b3IsValidAABB(box)||!b3IsValidAABB(b3AABB_Inflate(box,margin)))return AIR_B3_ARGUMENT;
 return 0;
}
static int capsule_extents_safe(b3World* w,b3Body* b,const b3Shape* added,b3Vec3 center){
 for(int i=b->headShapeId,extra=0;i!=B3_NULL_INDEX||!extra;){
  const b3Shape* s;if(!extra){extra=1;s=added;}else{s=b3Array_Get(w->shapes,i);i=s->nextShapeId;}
  b3ShapeExtent extent=b3ComputeShapeExtent(s,center);
  if(!isfinite(extent.minExtent)||!vec_ok(extent.maxExtent))return AIR_B3_ARGUMENT;
 }
 return 0;
}
/* target==0 preserves the existing density-based core semantics, including
   sensors. Reproduce the core's added-first float32 accumulation without writes,
   so finite individual capsules cannot overflow aggregate mass/COM/inertia. */
static int capsule_automatic_mass_safe(b3World* w,b3Body* b,const b3Shape* added){
 if(b->type!=b3_dynamicBody)return capsule_extents_safe(w,b,added,b3Vec3_zero);
 float mass=0;b3Vec3 center=b3Vec3_zero;b3Matrix3 inertia=b3Mat3_zero;
 for(int pass=0;pass<2;++pass){
  for(int i=b->headShapeId,extra=0;i!=B3_NULL_INDEX||!extra;){
   const b3Shape* s;if(!extra){extra=1;s=added;}else{s=b3Array_Get(w->shapes,i);i=s->nextShapeId;}
   if(!supported(s))return AIR_B3_UNSUPPORTED;if(s->density==0)continue;
   b3MassData m=b3ComputeShapeMass(s);
   if(!isfinite(m.mass)||m.mass<=0||!vec_ok(m.center)||!matrix_ok(m.inertia))return AIR_B3_ARGUMENT;
   if(pass==0){mass+=m.mass;center=b3MulAdd(center,m.mass,m.center);if(!isfinite(mass)||!vec_ok(center))return AIR_B3_ARGUMENT;}
   else{b3Vec3 d=b3Sub(center,m.center);b3Matrix3 term=b3AddMM(m.inertia,b3Steiner(m.mass,d));inertia=b3AddMM(inertia,term);
    if(!vec_ok(d)||!matrix_ok(term)||!matrix_ok(inertia))return AIR_B3_ARGUMENT;}
  }
  if(pass==0){float inverse=1.0f/mass;if(!isfinite(inverse))return AIR_B3_ARGUMENT;center=b3MulSV(inverse,center);if(!vec_ok(center))return AIR_B3_ARGUMENT;}
 }
 float det=b3Det(inertia);if(!isfinite(det)||det<=0)return AIR_B3_ARGUMENT;
 b3Matrix3 inverse=b3InvertT(inertia);if(!matrix_ok(inverse))return AIR_B3_ARGUMENT;
 b3BodySim* sim=b3GetBodySim(w,b);b3Matrix3 rotation=b3MakeMatrixFromQuat(sim->transform.q);
 if(!matrix_ok(b3MulMM(b3MulMM(rotation,inverse),b3Transpose(rotation))))return AIR_B3_ARGUMENT;
 b3Pos worldCenter=b3TransformWorldPoint(sim->transform,center);if(!vec_ok(worldCenter))return AIR_B3_ARGUMENT;
 b3BodyState* state=b3GetBodyState(w,b);
 if(state&&!vec_ok(b3Add(state->linearVelocity,b3Cross(state->angularVelocity,b3SubPos(worldCenter,sim->center)))))return AIR_B3_ARGUMENT;
 return capsule_extents_safe(w,b,added,center);
}
int air_b3_mass_shape_create(uint32_t wid,uint32_t lo,uint32_t hi,int kind,const float* p,int sensor,float target,uint32_t* out){
 b3World* w;b3Body* b;b3BodyId id=bid(lo,hi);int s=context(wid,id,&w,&b);if(s)return s;
 if(!p||!out||(kind!=0&&kind!=1&&kind!=2)||(sensor!=0&&sensor!=1)||!isfinite(target)||target<0)return AIR_B3_ARGUMENT;
 int count=kind==0?5:kind==1?11:AIR_B3_CAPSULE_INPUT_FLOATS;for(int i=0;i<count;++i)if(!isfinite(p[i]))return AIR_B3_ARGUMENT;
 float density=p[count-1];if(density<=0)return AIR_B3_ARGUMENT;
 b3Shape candidate={0};candidate.id=B3_NULL_INDEX;candidate.density=density;candidate.sensorIndex=sensor?0:B3_NULL_INDEX;b3BoxHull hull;
 if(kind==0){if(p[3]<=0)return AIR_B3_ARGUMENT;candidate.type=b3_sphereShape;candidate.sphere=(b3Sphere){get(p),p[3]};}
 else if(kind==2){s=capsule_candidate(p,&candidate);if(s)return s;}
 else {if(p[3]<0.2f*B3_LINEAR_SLOP||p[4]<0.2f*B3_LINEAR_SLOP||p[5]<0.2f*B3_LINEAR_SLOP)return AIR_B3_ARGUMENT;float q2=p[6]*p[6]+p[7]*p[7]+p[8]*p[8]+p[9]*p[9];if(!isfinite(q2)||fabsf(q2-1)>1e-4f)return AIR_B3_ARGUMENT;
  b3Transform xf={get(p),{{p[6],p[7],p[8]},p[9]}};hull=b3MakeTransformedBoxHull(p[3],p[4],p[5],xf);candidate.type=b3_hullShape;candidate.hull=&hull.base;}
 b3MassData single=b3ComputeShapeMass(&candidate);if(!isfinite(single.mass)||single.mass<=0||!vec_ok(single.center)||!matrix_ok(single.inertia))return AIR_B3_ARGUMENT;
 b3MassData plan;int f,n;if(target>0){s=mass_plan(w,b,target,B3_NULL_INDEX,&candidate,&plan,&f,&n);if(s)return s;}
 if(kind==2){s=capsule_bounds_safe(w,b,&candidate);if(s)return s;
  s=target>0?capsule_extents_safe(w,b,&candidate,b->type==b3_dynamicBody?plan.center:b3Vec3_zero):capsule_automatic_mass_safe(w,b,&candidate);if(s)return s;}
 b3ShapeDef def=b3DefaultShapeDef();def.filter=air_b3_default_filter();def.density=density;def.isSensor=sensor!=0;def.enableSensorEvents=sensor!=0;def.updateBodyMass=target==0;
 b3ShapeId shape=candidate.type==b3_sphereShape?b3CreateSphereShape(id,&def,&candidate.sphere):candidate.type==b3_capsuleShape?b3CreateCapsuleShape(id,&def,&candidate.capsule):b3CreateHullShape(id,&def,candidate.hull);
 if(!b3Shape_IsValid(shape))return AIR_B3_CREATION;
 if(target>0)apply_mass(w,b,id,plan);
 uint64_t value=b3StoreShapeId(shape);out[0]=(uint32_t)value;out[1]=(uint32_t)(value>>32);return 0;
}
int air_b3_mass_shape_destroy(uint32_t wid,uint32_t lo,uint32_t hi,uint32_t slo,uint32_t shi,float target){
 b3World* w;b3Body* b;b3BodyId id=bid(lo,hi);int s=context(wid,id,&w,&b);if(s)return s;
 b3ShapeId shape=b3LoadShapeId(((uint64_t)shi<<32)|slo);
 if(!b3Shape_IsValid(shape)||b3StoreBodyId(b3Shape_GetBody(shape))!=b3StoreBodyId(id))return AIR_B3_INVALID;
 b3MassData plan;int f,n;s=mass_plan(w,b,target,shape.index1-1,NULL,&plan,&f,&n);if(s)return s;
 b3DestroyShape(shape,false);apply_mass(w,b,id,plan);return 0;
}
