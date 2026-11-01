/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Independent real ABI fixture. Test-only fault/ownership injections are explicitly
 * labeled; they are not production observations or C20 application acceptance. */
#include "world_bridge.c"
#include "physics_world.h"
#include "body.h"
#include "solver_set.h"
#include <stdio.h>
#include <string.h>
#define T(x) do { ++checks; if (!(x)) { fprintf(stderr,"world storage contract line %d: %s\n",__LINE__,#x); return 1; } } while(0)
static uint64_t value64(const uint32_t* p) { return (uint64_t)p[0] | ((uint64_t)p[1] << 32); }
int main(void) {
    int checks=0;
    int64_t globalBaseline=b3GetByteCount();
    uint32_t w=air_b3_world_create(0,0,0), other=air_b3_world_create(0,0,0);
    T(w && other && w!=other);
    b3World* core=b3GetWorldFromId(b3LoadWorldId(w));
    uint32_t initial[6], before[6], after[6], otherInitial[6], bridge[6];
    T(air_b3_world_counts(w,initial)==AIR_B3_OK && air_b3_world_counts(other,otherInitial)==AIR_B3_OK);
    uint32_t diagnostic[AIR_B3_MEMORY_WORDS];
    T(air_b3_world_memory_diagnostics_v2(w,diagnostic,AIR_B3_MEMORY_WORDS)==AIR_B3_OK);
    T(diagnostic[0]==2 && diagnostic[2]==89 && value64(diagnostic+6)==value64(initial+4));
    T(value64(diagnostic+44+87*8+6)==sizeof(core->identity) && sizeof(core->identity)==36);
    T(value64(diagnostic+44+88*8+6)==sizeof(core->creationCapacity) && sizeof(core->creationCapacity)==20);
    T(air_b3_world_trim_empty(0,1)==AIR_B3_INVALID && air_b3_world_trim_empty(w,2)==AIR_B3_ARGUMENT);
    uint64_t step=core->stepIndex;
    core->locked=true; /* Controlled refusal only. Restored before any physics. */
    int result=air_b3_world_trim_empty(w,1); core->locked=false;
    T(result==AIR_B3_LOCKED && core->stepIndex==step);
    void* temporary=air_b3_bridge_temp_alloc(w,16);
    T(temporary!=NULL);
    T(air_b3_world_trim_empty(w,1)==AIR_B3_TRIM_UNSAFE);
    air_b3_bridge_temp_free(w,temporary,16);
    T(air_b3_world_counts(w,after)==AIR_B3_OK && !memcmp(initial,after,sizeof(initial)));
    float input[AIR_B3_BODY_INPUT_FLOATS]={0}; input[6]=1; input[15]=1;
    uint32_t ids[4][2], shapes[4][2];
    for(int i=0;i<4;++i) {
        input[0]=0.3f*i;
        T(air_b3_body_create(w,2,input,0,ids[i])==AIR_B3_OK);
        T(air_b3_shape_sphere(ids[i][0],ids[i][1],0.5f,1,shapes[i])==AIR_B3_OK);
    }
    T(air_b3_world_counts(w,before)==AIR_B3_OK && before[0]==4 && before[1]==4);
    T(air_b3_world_trim_empty(w,1)==AIR_B3_WORLD_NONEMPTY);
    T(air_b3_world_counts(w,after)==AIR_B3_OK && !memcmp(before,after,sizeof(before)) && core->stepIndex==step);
    T(air_b3_world_step(w,1.0f/60.0f,1)==AIR_B3_OK);
    T(core->stepIndex==step+1 && core->broadPhase.trees[b3_dynamicBody].rebuildCapacity>0);
    for(int i=0;i<4;++i) T(air_b3_body_destroy(ids[i][0],ids[i][1])==AIR_B3_OK);
    T(air_b3_world_counts(w,before)==AIR_B3_OK && before[0]==0 && before[1]==0 && before[2]==0 && before[3]==0);
    step=core->stepIndex;
    int endRole=core->endEventArrayIndex;
    uint32_t highs[b3_identityKindCount]; memcpy(highs,core->identity.high,sizeof(highs));
    T(air_b3_world_trim_empty(w,1)==AIR_B3_OK);
    T(b3GetWorldFromId(b3LoadWorldId(w))==core && core->stepIndex==step && core->endEventArrayIndex==endRole);
    T(air_b3_world_counts(w,after)==AIR_B3_OK && !memcmp(initial,after,sizeof(initial)));
    T(!memcmp(highs,core->identity.high,sizeof(highs)) && !memcmp(highs,core->identity.floor,sizeof(highs)));
    T(air_b3_world_memory_diagnostics_v2(w,diagnostic,AIR_B3_MEMORY_WORDS)==AIR_B3_OK && value64(diagnostic+6)==value64(initial+4));
    T(air_b3_world_counts(other,after)==AIR_B3_OK && !memcmp(otherInitial,after,sizeof(after)));
    T(air_b3_bridge_memory(w,bridge)==AIR_B3_OK && value64(bridge)==sizeof(BridgeWorld) && bridge[2]==1);
    for(int i=0;i<4;++i) T(!air_b3_body_valid(ids[i][0],ids[i][1]) && !air_b3_shape_valid(shapes[i][0],shapes[i][1]));
    uint32_t next[2], nextShape[2];
    T(air_b3_body_create(w,2,input,0,next)==AIR_B3_OK);
    T(air_b3_shape_sphere(next[0],next[1],0.5f,1,nextShape)==AIR_B3_OK);
    T(!air_b3_body_valid(ids[0][0],ids[0][1]) && !air_b3_shape_valid(shapes[0][0],shapes[0][1]));
    T(air_b3_world_step(w,1.0f/60.0f,1)==AIR_B3_OK);
    T(air_b3_body_destroy(next[0],next[1])==AIR_B3_OK && air_b3_world_trim_empty(w,1)==AIR_B3_OK);
    T(air_b3_world_counts(w,after)==AIR_B3_OK && !memcmp(initial,after,sizeof(initial)) && core->stepIndex==step+1);
    /* Explicit controlled already-faulted native state: bridge must never report a
     * successful Step/trim; production has no state injection export. */
    core->identity.contactExhausted=1;
    step=core->stepIndex;
    T(air_b3_world_step(w,1.0f/60.0f,1)==AIR_B3_IDENTITY_EXHAUSTED && core->stepIndex==step);
    T(air_b3_world_trim_empty(w,1)==AIR_B3_IDENTITY_EXHAUSTED);
    T(air_b3_world_destroy(w)==AIR_B3_OK && air_b3_world_destroy(other)==AIR_B3_OK);
    T(b3GetByteCount()==globalBaseline);
    T(air_b3_bridge_memory(0,bridge)==AIR_B3_OK && value64(bridge)==0 && bridge[2]==0);
    /* The original 51 assertions above remain an ordered prefix. */
    w=air_b3_world_create(0,0,0); core=b3GetWorldFromId(b3LoadWorldId(w));
    T(w && air_b3_world_counts(w,initial)==AIR_B3_OK);
    /* Production regression: sleep -> disable must retire only an empty source
     * solver set. No wake workaround, clock step or relaxed trim precondition. */
    for (int type=1;type<=2;++type) for (int cycle=0;cycle<3;++cycle) {
        b3BodyDef def=b3DefaultBodyDef(); def.type=(b3BodyType)type;
        b3BodyId body=b3CreateBody(b3LoadWorldId(w),&def);
        b3ShapeDef shapeDef=b3DefaultShapeDef(); b3Sphere sphere={.center={0,0,0},.radius=0.5f};
        b3ShapeId shape=b3CreateSphereShape(body,&shapeDef,&sphere);
        T(b3Body_IsValid(body) && b3Shape_IsValid(shape));
        uint64_t fixedStep=core->stepIndex;
        b3Body_SetAwake(body,false);
        int source=b3GetBodyFullId(core,body)->setIndex;
        T(source>=b3_firstSleepingSet);
        b3Body_Disable(body);
        T(core->solverSets.data[source].setIndex==B3_NULL_INDEX);
        T(b3GetIdCount(&core->solverSetIdPool)==b3_firstSleepingSet);
        for(int base=0;base<b3_firstSleepingSet;++base) T(core->solverSets.data[base].setIndex==base);
        b3Body_Enable(body); T(b3Body_IsEnabled(body));
        b3Body_SetAwake(body,false); b3Body_Disable(body); b3DestroyBody(body);
        T(air_b3_world_trim_empty(w,1)==AIR_B3_OK && core->stepIndex==fixedStep);
        T(b3GetWorldFromId(b3LoadWorldId(w))==core && !b3Body_IsValid(body) && !b3Shape_IsValid(shape));
        T(air_b3_world_counts(w,after)==AIR_B3_OK && !memcmp(initial,after,sizeof(initial)));
    }
    /* Fixed, Hinge and PointToPoint: preserve the other sleeping body and the
     * live joint when disabling one endpoint, then retire on last removal. */
    for(int kind=0;kind<3;++kind) {
        b3BodyDef def=b3DefaultBodyDef(); def.type=b3_dynamicBody;
        b3BodyId a=b3CreateBody(b3LoadWorldId(w),&def); def.position.x=2;
        b3BodyId b=b3CreateBody(b3LoadWorldId(w),&def);
        b3ShapeDef sd=b3DefaultShapeDef(); b3Sphere sp={.center={0,0,0},.radius=0.25f};
        b3CreateSphereShape(a,&sd,&sp); b3CreateSphereShape(b,&sd,&sp);
        b3JointId joint;
        if(kind==0) { b3WeldJointDef d=b3DefaultWeldJointDef(); d.base.bodyIdA=a; d.base.bodyIdB=b; joint=b3CreateWeldJoint(b3LoadWorldId(w),&d); }
        else if(kind==1) { b3RevoluteJointDef d=b3DefaultRevoluteJointDef(); d.base.bodyIdA=a; d.base.bodyIdB=b; joint=b3CreateRevoluteJoint(b3LoadWorldId(w),&d); }
        else { b3SphericalJointDef d=b3DefaultSphericalJointDef(); d.base.bodyIdA=a; d.base.bodyIdB=b; joint=b3CreateSphericalJoint(b3LoadWorldId(w),&d); }
        T(b3Joint_IsValid(joint));
        T(air_b3_world_step(w,1.0f/60.0f,1)==AIR_B3_OK);
        b3Body_SetAwake(a,false);
        int shared=b3GetBodyFullId(core,a)->setIndex;
        T(shared>=b3_firstSleepingSet && b3GetBodyFullId(core,b)->setIndex==shared);
        uint64_t fixedStep=core->stepIndex;
        b3Body_Disable(a);
        T(core->solverSets.data[shared].setIndex==shared && core->solverSets.data[shared].bodySims.count==1);
        T(b3Joint_IsValid(joint) && b3Body_IsValid(b));
        T(air_b3_world_trim_empty(w,1)==AIR_B3_WORLD_NONEMPTY);
        b3Body_Enable(a); T(b3Joint_IsValid(joint));
        b3Body_SetAwake(a,false); b3Body_Disable(a); b3Body_Disable(b);
        T(b3GetIdCount(&core->solverSetIdPool)==b3_firstSleepingSet);
        T(b3Joint_IsValid(joint)); b3DestroyJoint(joint,true); b3DestroyBody(a); b3DestroyBody(b);
        T(air_b3_world_trim_empty(w,1)==AIR_B3_OK && core->stepIndex==fixedStep);
        T(air_b3_world_counts(w,after)==AIR_B3_OK && !memcmp(initial,after,sizeof(initial)));
    }
    T(air_b3_world_destroy(w)==AIR_B3_OK && b3GetByteCount()==globalBaseline);
    T(air_b3_bridge_memory(0,bridge)==AIR_B3_OK && value64(bridge)==0 && bridge[2]==0);
    printf("{\"schema\":\"air-box3d-storage-native-contract-v1\",\"status\":\"PASS\",\"pointerBytes\":%zu,"
        "\"coreSha\":\"%s\",\"schemaSha256\":\"%s\",\"patchChainSha256\":\"%s\",\"checks\":%d,"
        "\"initialLedgerBytes\":%llu,\"identityMetadataBytes\":36,\"creationCapacityBytes\":20,"
        "\"metadataRows\":true,\"nonemptyNoMutation\":true,\"ownershipRefusal\":true,\"sameWorldStepPreserved\":true,"
        "\"realStepReleaseBaseline\":true,\"secondCycleBaseline\":true,\"staleIdsRejected\":true,\"twoWorldIsolation\":true,"
        "\"controlledFaultClose\":true,\"controlledFixture\":true,\"injectionsAreProductionObservations\":false,"
        "\"sleepDisableCycles\":true,\"sharedSleepingConstraintSets\":true,\"reEnablePreservesJoints\":true,\"baseSetsPreserved\":true,\"finalCoreDelta\":0,\"finalBridgeBytes\":0}\n",sizeof(void*),air_b3_core_sha(),air_b3_schema_sha(),air_b3_patch_chain_sha(),checks,(unsigned long long)value64(initial+4));
    return 0;
}
