/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Qualification only: internal access is used solely to assert actual layout/initialization,
   locked rejection, and inject the otherwise unreachable uint64 exhaustion boundary. */
#include "air_box3d.h"
#include <box3d/box3d.h>
#include "contact.h"
#include "physics_world.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x); exit(1); } } while(0)
#define NEAR(a,b,t) CHECK(fabs((double)(a)-(double)(b)) <= (t))
static b3BodyId make_body(uint32_t w, int type, float x, float y, float z)
{
    float input[16]={x,y,z,0,0,0,1,0,0,0,0,0,0,0,0,1}; uint32_t words[2];
    CHECK(air_b3_body_create(w,type,input,1,words)==0); return b3LoadBodyId(((uint64_t)words[1]<<32)|words[0]);
}
static b3ShapeId sphere(b3BodyId b)
{
    uint64_t id=b3StoreBodyId(b);uint32_t out[2];CHECK(air_b3_shape_sphere((uint32_t)id,(uint32_t)(id>>32),0.5f,1,out)==0);
    b3ShapeId s=b3LoadShapeId(((uint64_t)out[1]<<32)|out[0]); b3SurfaceMaterial material=b3Shape_GetSurfaceMaterial(s);material.friction=0;b3Shape_SetSurfaceMaterial(s,material);return s;
}
static b3ShapeId box(b3BodyId b,float x,float y,float z)
{
    uint64_t id=b3StoreBodyId(b);uint32_t out[2];CHECK(air_b3_shape_box((uint32_t)id,(uint32_t)(id>>32),x,y,z,1,out)==0);
    b3ShapeId s=b3LoadShapeId(((uint64_t)out[1]<<32)|out[0]); b3SurfaceMaterial material=b3Shape_GetSurfaceMaterial(s);material.friction=0;b3Shape_SetSurfaceMaterial(s,material);return s;
}
static b3ContactData one_contact(b3BodyId body)
{
    b3ContactData data[8];int n=b3Body_GetContactData(body,data,8);CHECK(n==1);return data[0];
}
static b3ContactGeometryBasis basis(b3ContactId c)
{
    b3ContactGeometryBasis b;CHECK(b3Contact_GetGeometryBasis(c,&b));return b;
}
static b3Vec3 world_point(b3ContactData c,b3ContactGeometryBasis b)
{ return b3Add(b.generationCOMA,c.manifolds[0].points[0].anchorA); }
int main(void)
{
    printf("{\"pointerBytes\":%zu,\"contactBytes\":%zu,\"basisBytes\":%zu,\"manifoldPointBytes\":%zu,",sizeof(void*),sizeof(b3Contact),sizeof(b3ContactGeometryBasis),sizeof(b3ManifoldPoint));fflush(stdout);
    uint32_t w=air_b3_world_create(0,-10,0);b3WorldId wid=b3LoadWorldId(w);b3World* internal=b3GetWorldFromId(wid);
    b3BodyId floor=make_body(w,0,0,-0.5f,0);box(floor,10,0.5f,10);
    b3BodyId ball=make_body(w,2,0,0.49f,0);sphere(ball);
    b3World_SetContactRecycleDistance(wid,0);
    b3World_Step(wid,0,4);b3ContactData c=one_contact(ball);b3ContactGeometryBasis b=basis(c.contactId);
    CHECK(b.geometryRevision==1 && b.generatedAfterStep==0 && internal->stepIndex==0);
    NEAR(world_point(c,b).y,-0.005,2e-6);
    b3World_Step(wid,0,4);b3ContactGeometryBasis b2=basis(c.contactId);CHECK(b2.geometryRevision==2 && b2.generatedAfterStep==0);
    b3ContactGeometryBasis canary;memset(&canary,0x5a,sizeof(canary));b3ContactGeometryBasis saved=canary;
    CHECK(!b3Contact_GetGeometryBasis((b3ContactId){0},&canary));CHECK(memcmp(&canary,&saved,sizeof(canary))==0);
    CHECK(!b3Contact_GetGeometryBasis(c.contactId,NULL));internal->locked=true;
    CHECK(!b3Contact_GetGeometryBasis(c.contactId,&canary));CHECK(memcmp(&canary,&saved,sizeof(canary))==0);internal->locked=false;
    b3MassData mass=b3Body_GetMassData(ball);mass.center.x+=0.1f;b3Body_SetMassData(ball,mass);
    CHECK(!b3Contact_GetGeometryBasis(c.contactId,&canary));CHECK(memcmp(&canary,&saved,sizeof(canary))==0);
    b3World_Step(wid,0,4);b3ContactGeometryBasis b3=basis(c.contactId);CHECK(b3.geometryRevision==3);NEAR(b3.generationCOMB.x,0.1,1e-6);
    printf("\"zeroDtDistinctRevision\":true,\"invalidLockedCOMNoWrite\":true,");fflush(stdout);
    b3ContactId old=c.contactId;b3DestroyBody(ball);
    CHECK(!b3Contact_GetGeometryBasis(old,&canary));
    ball=make_body(w,2,0,0.49f,0);sphere(ball);b3World_Step(wid,0,4);c=one_contact(ball);b=basis(c.contactId);
    CHECK(c.contactId.index1==old.index1 && c.contactId.generation!=old.generation);CHECK(b.geometryRevision==1 && b.generatedAfterStep==0);
    printf("\"actualContactSlotReuseInitialized\":true,\"oldContactGeneration\":%u,\"newContactGeneration\":%u,",old.generation,c.contactId.generation);fflush(stdout);
    b3Contact* contact=internal->contacts.data+(c.contactId.index1-1);
    /* Qualification-only boundary injection, never available through product ABI. */
    contact->geometryBasis.geometryRevision=UINT64_MAX-1;b3World_Step(wid,0,4);CHECK(basis(c.contactId).geometryRevision==UINT64_MAX);
    b3World_Step(wid,0,4);CHECK(!b3Contact_GetGeometryBasis(c.contactId,&canary));CHECK(!contact->geometryValid && contact->geometryBasis.geometryRevision==UINT64_MAX);
    b3World_Step(wid,0,4);CHECK(!b3Contact_GetGeometryBasis(c.contactId,&canary));CHECK(contact->geometryBasis.geometryRevision==UINT64_MAX);
    CHECK(memcmp(&canary,&saved,sizeof(canary))==0);printf("\"uint64ExhaustionFailsClosed\":true,");fflush(stdout);CHECK(air_b3_world_destroy(w)==0);

    /* Existing floor manifold while a tangential sweep hits a separate wall. */
    w=air_b3_world_create(0,0,0);wid=b3LoadWorldId(w);floor=make_body(w,0,0,-0.5f,0);box(floor,10,0.5f,10);
    b3BodyId wall=make_body(w,0,1.5f,1,0);b3ShapeId wallShape=box(wall,0.1f,2,2);
    ball=make_body(w,2,0,0.49f,0);sphere(ball);b3World_Step(wid,0,4);c=one_contact(ball);b=basis(c.contactId);
    b3Vec3 generated=world_point(c,b);b3Body_SetLinearVelocity(ball,(b3Vec3){120,0,0});b3World_Step(wid,1.0f/60,4);
    b3Counters counts=b3World_GetCounters(wid);b3WorldTransform after=b3Body_GetTransform(ball);
    CHECK(counts.distanceIterations>0);CHECK(after.p.x>0.5f && after.p.x<1.0f);
    b3ContactData contacts[8];int n=b3Body_GetContactData(ball,contacts,8);CHECK(n>=1);
    int floorSeen=0,wallSeen=0;
    for(int i=0;i<n;i++) {
        b3ContactData d=contacts[i];b3ContactGeometryBasis g=basis(d.contactId);
        if(d.contactId.index1==c.contactId.index1 && d.contactId.generation==c.contactId.generation) {
            floorSeen++;CHECK(g.geometryRevision==b.geometryRevision);CHECK(memcmp(&g,&b,sizeof(g))==0);
            b3Vec3 p=world_point(d,g);NEAR(p.x,generated.x,1e-6);NEAR(p.y,generated.y,1e-6);CHECK(fabsf(after.p.x-p.x)>0.5f);
        }
        if(b3StoreShapeId(d.shapeIdA)==b3StoreShapeId(wallShape)||b3StoreShapeId(d.shapeIdB)==b3StoreShapeId(wallShape))wallSeen++;
    }
    CHECK(floorSeen==1 && wallSeen==0);
    printf("\"ccdRetainsFloorGeneration\":true,\"ccdFinalX\":%.9g,\"ccdGeneratedPointX\":%.9g,\"toiDistanceIterations\":%d,",after.p.x,generated.x,counts.distanceIterations);fflush(stdout);CHECK(air_b3_world_destroy(w)==0);
    /* First TOI without a persistent manifold must not fabricate one. */
    w=air_b3_world_create(0,0,0);wid=b3LoadWorldId(w);wall=make_body(w,0,1.5f,2,0);box(wall,0.1f,2,2);ball=make_body(w,2,0,2,0);sphere(ball);
    b3Body_SetLinearVelocity(ball,(b3Vec3){120,0,0});b3World_Step(wid,1.0f/60,4);counts=b3World_GetCounters(wid);after=b3Body_GetTransform(ball);
    CHECK(counts.distanceIterations>0 && after.p.x<1.0f);CHECK(b3Body_GetContactData(ball,contacts,8)==0);
    b3World_Step(wid,1.0f/60,4);c=one_contact(ball);b=basis(c.contactId);CHECK(b.geometryRevision==1 && b.generatedAfterStep==1);
    printf("\"firstTOINoFabricatedManifold\":true,\"laterManifoldGenerationAfterStep\":%llu,\"status\":\"PASS\"}\n",(unsigned long long)b.generatedAfterStep);CHECK(air_b3_world_destroy(w)==0);return 0;
}
