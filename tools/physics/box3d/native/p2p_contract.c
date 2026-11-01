/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Pinned-core spherical/P2P qualification, compiled unchanged for host and WASM.
   Creation/configuration/state always use the bridge under test. Body-origin
   positions and quaternions supply an independent double-precision pivot oracle;
   the oracle never calls a joint separation or angular getter. No transform or
   velocity setter is used. Forces/impulses drive the physics. Private solver
   structs are read only for purity and native-default checks. Only the world
   lock is edited, solely for rejection qualification. Fixed thresholds are
   declared before execution; failures remain RED rather than being calibrated. */
#include "air_box3d.h"
#include "p2p_bridge.h"
#include "body.h"
#include "joint.h"
#include "physics_world.h"
#include <box3d/box3d.h>
#include <float.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { CANARY_WORDS = 40, TICKS = 600, SUBSTEPS = 4, SETTLE_TICKS = 120,
    ROTATION_TICKS = 120, PURE_READS = 4 };
static const float dt = 1.0f / 60.0f, position_limit = 0.02f;
static const float quaternion_limit = 0.005f, velocity_limit = 0.00001f;
static const float control_inertia = 1.0f / 24.0f;
static const uint32_t canary = UINT32_C(0x5a7e3c19);
static const char* current_case = "startup";
static int current_tick = -1, rejection_checks, geometry_checks, pure_reads;
static float diagnostic_position, diagnostic_rotation;
#define CHECK(x) do { if (!(x)) { \
    fprintf(stderr, "FAIL %s:%d %s (case=%s tick=%d)\n", __FILE__, __LINE__, #x, current_case, current_tick); \
    printf("{\"status\":\"RED\",\"case\":\"%s\",\"line\":%d,\"tick\":%d," \
        "\"anchorMeters\":%.9g,\"quaternionErrorRadians\":%.9g,\"diagnosticsFinite\":%s}\n", \
        current_case, __LINE__, current_tick, isfinite(diagnostic_position) ? diagnostic_position : 0.0f, \
        isfinite(diagnostic_rotation) ? diagnostic_rotation : 0.0f, \
        isfinite(diagnostic_position) && isfinite(diagnostic_rotation) ? "true" : "false"); \
    fflush(stdout); exit(1); \
} } while (0)

typedef struct DVec { double x, y, z; } DVec;
typedef struct Fixture { uint32_t world, other, a[2], b[2], foreign[2], joint[2]; } Fixture;
typedef struct PureGuard {
    unsigned char joint_sim[sizeof(b3JointSim)], body_meta[2][sizeof(b3Body)],
        body_sim[2][sizeof(b3BodySim)], body_state[2][sizeof(b3BodyState)];
    uint32_t state_present[2], counts[6], bridge[6], core[2];
    float bodies[2][AIR_B3_BODY_SNAPSHOT_FLOATS], inv_h;
} PureGuard;
typedef struct Guard {
    uint32_t counts[2][6], bridge[6], core[2], state[AIR_B3_P2P_STATE_WORDS];
    float bodies[3][AIR_B3_BODY_SNAPSHOT_FLOATS];
    int awake[3];
    unsigned char joint_sim[sizeof(b3JointSim)];
} Guard;
typedef struct Metrics { float initial, peak, settled, final; } Metrics;
static uint64_t id_value(const uint32_t id[2]) { return (uint64_t)id[0] | ((uint64_t)id[1] << 32); }
static b3BodyId body(const uint32_t id[2]) { return b3LoadBodyId(id_value(id)); }
static b3JointId joint(const uint32_t id[2]) { return b3LoadJointId(id_value(id)); }
static float wf(const uint32_t* p) { float x; memcpy(&x, p, sizeof(x)); return x; }
static float length(b3Vec3 v) { return sqrtf(b3Dot(v, v)); }
static DVec subtract(DVec a, DVec b) { return (DVec){a.x-b.x, a.y-b.y, a.z-b.z}; }
static double dlength(DVec v) { return hypot(hypot(v.x, v.y), v.z); }
/* Explicit quaternion-vector multiplication, independent of the core's
   transform helpers and all state payload values. */
static DVec rotate(b3Quat q, DVec v) {
    double x=q.v.x, y=q.v.y, z=q.v.z, s=q.s;
    DVec t={2*(y*v.z-z*v.y), 2*(z*v.x-x*v.z), 2*(x*v.y-y*v.x)};
    return (DVec){v.x+s*t.x+y*t.z-z*t.y, v.y+s*t.y+z*t.x-x*t.z, v.z+s*t.z+x*t.y-y*t.x};
}
static DVec pivot_world(const uint32_t id[2], b3Vec3 local) {
    b3WorldTransform t=b3Body_GetTransform(body(id));
    DVec r=rotate(t.q,(DVec){local.x,local.y,local.z});
    return (DVec){(double)t.p.x+r.x,(double)t.p.y+r.y,(double)t.p.z+r.z};
}
static float observe(const uint32_t a[2],const uint32_t b[2],b3Vec3 pa,b3Vec3 pb) {
    diagnostic_position=(float)dlength(subtract(pivot_world(a,pa),pivot_world(b,pb)));
    CHECK(isfinite(diagnostic_position)); return diagnostic_position;
}
static void frame_floats(float out[7],b3Transform t) {
    const float f[7]={t.p.x,t.p.y,t.p.z,t.q.v.x,t.q.v.y,t.q.v.z,t.q.s}; memcpy(out,f,sizeof(f));
}
static void fill_canary(uint32_t* out) { for(int i=0;i<CANARY_WORDS;++i) out[i]=canary; }
static void check_canary(const uint32_t* out) { for(int i=0;i<CANARY_WORDS;++i) CHECK(out[i]==canary); }
static void check_tail(const uint32_t* out,int written) {
    CHECK(out[0]==canary); for(int i=written+1;i<CANARY_WORDS;++i) CHECK(out[i]==canary);
}
static void read_state(uint32_t world,const uint32_t id[2],uint32_t s[AIR_B3_P2P_STATE_WORDS]) {
    CHECK(air_b3_p2p_state(world,id[0],id[1],s,AIR_B3_P2P_STATE_WORDS)==AIR_B3_OK);
    CHECK(s[0]==3 && s[5]<=1);
    for(int i=6;i<20;++i) CHECK(isfinite(wf(s+i)));
    for(int i=20;i<24;++i) CHECK(s[i]==0);
    CHECK(isfinite(wf(s+24)) && wf(s+24)>=0);
}
static void check_no_owned_bytes(void) {
    uint32_t core[2],bridge[6]; air_b3_live_bytes(core); CHECK(core[0]==0 && core[1]==0);
    CHECK(air_b3_bridge_memory(0,bridge)==AIR_B3_OK);
    for(int i=0;i<6;++i) CHECK(bridge[i]==0);
}
static void make_body(uint32_t world,int type,b3Vec3 p,b3Quat q,b3Vec3 v,b3Vec3 w,uint32_t out[2]) {
    const float input[AIR_B3_BODY_INPUT_FLOATS]={p.x,p.y,p.z,q.v.x,q.v.y,q.v.z,q.s,v.x,v.y,v.z,w.x,w.y,w.z,0,0,1};
    CHECK(air_b3_body_create(world,type,input,0,out)==AIR_B3_OK);
}
static void add_box(const uint32_t id[2],float extent,float density) {
    uint32_t shape[2]; CHECK(air_b3_shape_box(id[0],id[1],extent,extent,extent,density,shape)==AIR_B3_OK);
}
static void add_sphere(const uint32_t id[2],b3Vec3 offset,float radius,float density) {
    uint32_t shape[2]; CHECK(air_b3_shape_sphere_ex(id[0],id[1],offset.x,offset.y,offset.z,radius,density,0,shape)==AIR_B3_OK);
}
static void check_native(uint32_t world,const uint32_t id[2],int collide) {
    uint32_t s[AIR_B3_P2P_STATE_WORDS]; read_state(world,id,s); b3JointId j=joint(id);
    CHECK(b3Joint_GetType(j)==b3_sphericalJoint && s[5]==(uint32_t)collide);
    CHECK(b3Joint_GetCollideConnected(j)==(collide!=0));
    CHECK(!b3SphericalJoint_IsSpringEnabled(j) && !b3SphericalJoint_IsMotorEnabled(j));
    CHECK(!b3SphericalJoint_IsConeLimitEnabled(j) && !b3SphericalJoint_IsTwistLimitEnabled(j));
    const b3JointSim* sim=b3GetJointSimCheckType(j,b3_sphericalJoint);
    b3SphericalJointDef defaults=b3DefaultSphericalJointDef();
    CHECK(sim->constraintHertz==defaults.base.constraintHertz);
    CHECK(sim->constraintDampingRatio==defaults.base.constraintDampingRatio);
}
static void create_p2p(uint32_t world,const uint32_t a[2],const uint32_t b[2],const float g[6],
    int automatic,int collide,uint32_t id[2]) {
    float before[2][AIR_B3_BODY_SNAPSHOT_FLOATS],after[2][AIR_B3_BODY_SNAPSHOT_FLOATS],copy[6];
    uint32_t count_before[6],count_after[6],out[CANARY_WORDS],s[AIR_B3_P2P_STATE_WORDS];
    memcpy(copy,g,sizeof(copy));
    CHECK(air_b3_body_snapshot(a[0],a[1],before[0])==AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0],b[1],before[1])==AIR_B3_OK);
    CHECK(air_b3_world_counts(world,count_before)==AIR_B3_OK); fill_canary(out);
    CHECK(air_b3_p2p_create(world,a[0],a[1],b[0],b[1],g,6,automatic,collide,out+1)==AIR_B3_OK);
    check_tail(out,2); id[0]=out[1]; id[1]=out[2]; CHECK(memcmp(copy,g,sizeof(copy))==0);
    CHECK(b3Joint_IsValid(joint(id)) && b3Joint_GetType(joint(id))==b3_sphericalJoint);
    CHECK(b3StoreBodyId(b3Joint_GetBodyA(joint(id)))==id_value(a));
    CHECK(b3StoreBodyId(b3Joint_GetBodyB(joint(id)))==id_value(b));
    CHECK(air_b3_body_snapshot(a[0],a[1],after[0])==AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0],b[1],after[1])==AIR_B3_OK);
    CHECK(memcmp(before,after,sizeof(before))==0);
    CHECK(air_b3_world_counts(world,count_after)==AIR_B3_OK);
    for(int i=0;i<3;++i) CHECK(count_before[i]==count_after[i]);
    CHECK(count_after[3]==count_before[3]+1);
    read_state(world,id,s);
    CHECK(s[1]==a[0] && s[2]==a[1] && s[3]==b[0] && s[4]==b[1]);
    b3Transform fa=b3Joint_GetLocalFrameA(joint(id)),fb=b3Joint_GetLocalFrameB(joint(id));
    float native[14]; frame_floats(native,fa); frame_floats(native+7,fb);
    for(int i=0;i<14;++i) CHECK(wf(s+6+i)==native[i]);
    CHECK(fa.p.x==g[0] && fa.p.y==g[1] && fa.p.z==g[2]);
    CHECK(length(fa.q.v)==0 && fa.q.s==1 && length(fb.q.v)==0 && fb.q.s==1);
    if(!automatic) CHECK(fb.p.x==g[3] && fb.p.y==g[4] && fb.p.z==g[5]);
    else {
        b3WorldTransform tb=b3Body_GetTransform(body(b));
        DVec delta=subtract(pivot_world(a,(b3Vec3){g[0],g[1],g[2]}),(DVec){tb.p.x,tb.p.y,tb.p.z});
        b3Quat inverse={{-tb.q.v.x,-tb.q.v.y,-tb.q.v.z},tb.q.s};
        DVec expected=rotate(inverse,delta);
        CHECK(dlength(subtract(expected,(DVec){fb.p.x,fb.p.y,fb.p.z}))<=0.00001);
    }
    float distance=observe(a,b,fa.p,fb.p);
    CHECK(fabsf(wf(s+24)-distance)<=0.00001f);
    if(automatic) CHECK(distance<=0.00001f);
    check_native(world,id,collide); ++geometry_checks;
}
static void reconfigure(uint32_t world,const uint32_t a[2],const uint32_t b[2],const uint32_t id[2],int collide) {
    uint32_t before[AIR_B3_P2P_STATE_WORDS],after[AIR_B3_P2P_STATE_WORDS];
    float bodies_before[2][AIR_B3_BODY_SNAPSHOT_FLOATS],bodies_after[2][AIR_B3_BODY_SNAPSHOT_FLOATS];
    read_state(world,id,before);
    CHECK(air_b3_body_snapshot(a[0],a[1],bodies_before[0])==AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0],b[1],bodies_before[1])==AIR_B3_OK);
    CHECK(air_b3_p2p_configure(world,id[0],id[1],collide)==AIR_B3_OK); read_state(world,id,after);
    CHECK(memcmp(before,after,5*sizeof(uint32_t))==0);
    CHECK(memcmp(before+6,after+6,(AIR_B3_P2P_STATE_WORDS-6)*sizeof(uint32_t))==0);
    CHECK(air_b3_body_snapshot(a[0],a[1],bodies_after[0])==AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0],b[1],bodies_after[1])==AIR_B3_OK);
    CHECK(memcmp(bodies_before,bodies_after,sizeof(bodies_before))==0); check_native(world,id,collide);
}
static PureGuard capture_pure(uint32_t world,const uint32_t a[2],const uint32_t b[2],const uint32_t j[2]) {
    PureGuard g={0}; b3World* w=b3GetWorldFromId(b3LoadWorldId(world));
    memcpy(g.joint_sim,b3GetJointSimCheckType(joint(j),b3_sphericalJoint),sizeof(g.joint_sim)); g.inv_h=w->inv_h;
    const uint32_t* ids[2]={a,b};
    for(int i=0;i<2;++i) {
        b3Body* nb=b3GetBodyFullId(w,body(ids[i])); const b3BodySim* sim=b3GetBodySim(w,nb);
        const b3BodyState* state=b3GetBodyState(w,nb);
        memcpy(g.body_meta[i],nb,sizeof(*nb)); memcpy(g.body_sim[i],sim,sizeof(*sim));
        g.state_present[i]=state!=NULL; if(state) memcpy(g.body_state[i],state,sizeof(*state));
        CHECK(air_b3_body_snapshot(ids[i][0],ids[i][1],g.bodies[i])==AIR_B3_OK);
    }
    CHECK(air_b3_world_counts(world,g.counts)==AIR_B3_OK);
    CHECK(air_b3_bridge_memory(0,g.bridge)==AIR_B3_OK); air_b3_live_bytes(g.core); return g;
}
static void read_pure(uint32_t world,const uint32_t a[2],const uint32_t b[2],const uint32_t j[2],uint32_t s[AIR_B3_P2P_STATE_WORDS]) {
    PureGuard before=capture_pure(world,a,b,j); uint32_t first[AIR_B3_P2P_STATE_WORDS];
    for(int i=0;i<PURE_READS;++i) {
        read_state(world,j,s); PureGuard after=capture_pure(world,a,b,j);
        CHECK(memcmp(&before,&after,sizeof(before))==0);
        if(i==0) memcpy(first,s,sizeof(first)); else CHECK(memcmp(first,s,sizeof(first))==0);
        ++pure_reads;
    }
}
static Guard capture_guard(const Fixture* f) {
    Guard g={0}; CHECK(air_b3_world_counts(f->world,g.counts[0])==AIR_B3_OK);
    CHECK(air_b3_world_counts(f->other,g.counts[1])==AIR_B3_OK);
    CHECK(air_b3_bridge_memory(0,g.bridge)==AIR_B3_OK); air_b3_live_bytes(g.core);
    const uint32_t* ids[3]={f->a,f->b,f->foreign};
    for(int i=0;i<3;++i) { CHECK(air_b3_body_snapshot(ids[i][0],ids[i][1],g.bodies[i])==AIR_B3_OK); g.awake[i]=b3Body_IsAwake(body(ids[i])); }
    if(b3Joint_IsValid(joint(f->joint))) {
        read_state(f->world,f->joint,g.state);
        memcpy(g.joint_sim,b3GetJointSimCheckType(joint(f->joint),b3_sphericalJoint),sizeof(g.joint_sim));
    }
    return g;
}
#define REJECT(expected,call) do { Guard before=capture_guard(&f); fill_canary(out); \
    CHECK((call)==(expected)); check_canary(out); Guard after=capture_guard(&f); \
    CHECK(memcmp(&before,&after,sizeof(before))==0); ++rejection_checks; } while(0)
#define CREATE(gp,gn,ab,c,op) air_b3_p2p_create(f.world,f.a[0],f.a[1],f.b[0],f.b[1],gp,gn,ab,c,op)
static void validation_contract(void) {
    current_case="validation"; Fixture f={0}; uint32_t out[CANARY_WORDS];
    const float g[6]={.2f,-.1f,.3f,-.4f,.25f,.1f}; float bad_g[6];
    f.world=air_b3_world_create(0,0,0); f.other=air_b3_world_create(0,0,0); CHECK(f.world && f.other && f.world!=f.other);
    make_body(f.world,b3_staticBody,(b3Vec3){-1,2,.5f},b3MakeQuatFromAxisAngle((b3Vec3){0,0,1},.37f),b3Vec3_zero,b3Vec3_zero,f.a);
    make_body(f.world,b3_dynamicBody,(b3Vec3){1.5f,1,-.75f},b3MakeQuatFromAxisAngle((b3Vec3){0,1,0},-.61f),b3Vec3_zero,b3Vec3_zero,f.b);
    make_body(f.other,b3_dynamicBody,(b3Vec3){3,2,1},b3Quat_identity,b3Vec3_zero,b3Vec3_zero,f.foreign);
    add_box(f.b,.3f,2); add_box(f.foreign,.3f,2); create_p2p(f.world,f.a,f.b,g,1,0,f.joint);
    uint32_t stale[2],replacement[2];
    make_body(f.world,b3_dynamicBody,b3Vec3_zero,b3Quat_identity,b3Vec3_zero,b3Vec3_zero,stale);
    CHECK(air_b3_body_destroy(stale[0],stale[1])==AIR_B3_OK);
    make_body(f.world,b3_dynamicBody,b3Vec3_zero,b3Quat_identity,b3Vec3_zero,b3Vec3_zero,replacement);
    CHECK(stale[1]==replacement[1] && stale[0]!=replacement[0]);
    const uint32_t bad_worlds[]={0,f.world^1u,f.other};
    for(int i=0;i<3;++i) {
        REJECT(AIR_B3_INVALID,air_b3_p2p_create(bad_worlds[i],f.a[0],f.a[1],f.b[0],f.b[1],g,6,1,0,out+1));
        REJECT(AIR_B3_INVALID,air_b3_p2p_state(bad_worlds[i],f.joint[0],f.joint[1],out+1,25));
        REJECT(AIR_B3_INVALID,air_b3_p2p_configure(bad_worlds[i],f.joint[0],f.joint[1],1));
        REJECT(AIR_B3_INVALID,air_b3_joint_destroy(bad_worlds[i],f.joint[0],f.joint[1]));
    }
    REJECT(AIR_B3_INVALID,air_b3_p2p_create(f.world,f.a[0],f.a[1],f.foreign[0],f.foreign[1],g,6,1,0,out+1));
    const uint32_t bad_bodies[6][2]={{0,0},{f.b[0]^1u,f.b[1]},{f.b[0],UINT32_MAX},
        {f.b[0],UINT32_C(0x80000000)},{stale[0],stale[1]},{f.foreign[0],f.foreign[1]}};
    for(int i=0;i<6;++i) {
        REJECT(AIR_B3_INVALID,air_b3_p2p_create(f.world,bad_bodies[i][0],bad_bodies[i][1],f.b[0],f.b[1],g,6,1,0,out+1));
        REJECT(AIR_B3_INVALID,air_b3_p2p_create(f.world,f.a[0],f.a[1],bad_bodies[i][0],bad_bodies[i][1],g,6,1,0,out+1));
    }
    REJECT(AIR_B3_ARGUMENT,air_b3_p2p_create(f.world,f.a[0],f.a[1],f.a[0],f.a[1],g,6,1,0,out+1));
    REJECT(AIR_B3_ARGUMENT,CREATE(NULL,6,1,0,out+1));
    REJECT(AIR_B3_ARGUMENT,CREATE((const float*)((const unsigned char*)g+1),6,1,0,out+1));
    REJECT(AIR_B3_ARGUMENT,CREATE(g,6,1,0,NULL));
    REJECT(AIR_B3_ARGUMENT,CREATE(g,6,1,0,(uint32_t*)((unsigned char*)out+1)));
    const int bad_counts[]={-1,0,5,7};
    for(int i=0;i<4;++i) REJECT(AIR_B3_ARGUMENT,CREATE(g,bad_counts[i],1,0,out+1));
    const int bad_bools[]={-1,2};
    for(int i=0;i<2;++i) {
        REJECT(AIR_B3_ARGUMENT,CREATE(g,6,bad_bools[i],1,out+1));
        REJECT(AIR_B3_ARGUMENT,CREATE(g,6,1,bad_bools[i],out+1));
        REJECT(AIR_B3_ARGUMENT,air_b3_p2p_configure(f.world,f.joint[0],f.joint[1],bad_bools[i]));
    }
    const float nonfinite[]={NAN,INFINITY,-INFINITY};
    /* Even ignored explicit-B coordinates must be finite in automatic mode. */
    for(int automatic=0;automatic<=1;++automatic) for(int k=0;k<3;++k) for(int i=0;i<6;++i) {
        memcpy(bad_g,g,sizeof(g)); bad_g[i]=nonfinite[k];
        REJECT(AIR_B3_ARGUMENT,CREATE(bad_g,6,automatic,1,out+1));
    }
    fill_canary(out); CHECK(air_b3_p2p_state(f.world,f.joint[0],f.joint[1],out+1,CANARY_WORDS-2)==AIR_B3_OK); check_tail(out,25);
    uint32_t retained[25],reread[25]; memcpy(retained,out+1,sizeof(retained)); out[7]^=1u;
    read_state(f.world,f.joint,reread); CHECK(memcmp(retained,reread,sizeof(retained))==0);
    for(int cap=0;cap<25;++cap) REJECT(AIR_B3_CAPACITY,air_b3_p2p_state(f.world,f.joint[0],f.joint[1],out+1,cap));
    REJECT(AIR_B3_ARGUMENT,air_b3_p2p_state(f.world,f.joint[0],f.joint[1],out+1,-1));
    REJECT(AIR_B3_ARGUMENT,air_b3_p2p_state(f.world,f.joint[0],f.joint[1],NULL,25));
    REJECT(AIR_B3_ARGUMENT,air_b3_p2p_state(f.world,f.joint[0],f.joint[1],(uint32_t*)((unsigned char*)out+1),25));
    const uint32_t bad_ids[4][2]={{0,0},{f.joint[0]^1u,f.joint[1]},{f.joint[0],UINT32_MAX},{f.joint[0],UINT32_C(0x80000000)}};
    for(int i=0;i<4;++i) {
        REJECT(AIR_B3_INVALID,air_b3_p2p_state(f.world,bad_ids[i][0],bad_ids[i][1],out+1,25));
        REJECT(AIR_B3_INVALID,air_b3_p2p_configure(f.world,bad_ids[i][0],bad_ids[i][1],1));
        REJECT(AIR_B3_INVALID,air_b3_joint_destroy(f.world,bad_ids[i][0],bad_ids[i][1]));
    }
    Guard unlocked=capture_guard(&f); fill_canary(out); b3World* internal=b3GetWorldFromId(b3LoadWorldId(f.world)); internal->locked=true;
    CHECK(CREATE(g,6,1,1,out+1)==AIR_B3_LOCKED);
    CHECK(air_b3_p2p_configure(f.world,f.joint[0],f.joint[1],1)==AIR_B3_LOCKED);
    CHECK(air_b3_p2p_state(f.world,f.joint[0],f.joint[1],out+1,25)==AIR_B3_LOCKED);
    CHECK(air_b3_joint_destroy(f.world,f.joint[0],f.joint[1])==AIR_B3_LOCKED);
    internal->locked=false; check_canary(out); Guard relocked=capture_guard(&f); CHECK(memcmp(&unlocked,&relocked,sizeof(unlocked))==0); rejection_checks+=4;
    reconfigure(f.world,f.a,f.b,f.joint,1); reconfigure(f.world,f.a,f.b,f.joint,0);
    uint32_t old[2]={f.joint[0],f.joint[1]}; CHECK(air_b3_joint_destroy(f.world,old[0],old[1])==AIR_B3_OK);
    create_p2p(f.world,f.a,f.b,g,1,0,f.joint); CHECK(old[1]==f.joint[1] && old[0]!=f.joint[0]);
    REJECT(AIR_B3_INVALID,air_b3_p2p_state(f.world,old[0],old[1],out+1,25));
    REJECT(AIR_B3_INVALID,air_b3_p2p_configure(f.world,old[0],old[1],1));
    REJECT(AIR_B3_INVALID,air_b3_joint_destroy(f.world,old[0],old[1]));
    b3DistanceJointDef distance=b3DefaultDistanceJointDef(); distance.base.bodyIdA=body(f.a); distance.base.bodyIdB=body(replacement);
    b3JointId other_type=b3CreateDistanceJoint(b3LoadWorldId(f.world),&distance); CHECK(b3Joint_IsValid(other_type));
    uint64_t wrong=b3StoreJointId(other_type);
    REJECT(AIR_B3_UNSUPPORTED,air_b3_p2p_state(f.world,(uint32_t)wrong,(uint32_t)(wrong>>32),out+1,25));
    REJECT(AIR_B3_UNSUPPORTED,air_b3_p2p_configure(f.world,(uint32_t)wrong,(uint32_t)(wrong>>32),1));
    CHECK(air_b3_joint_destroy(f.world,(uint32_t)wrong,(uint32_t)(wrong>>32))==AIR_B3_OK);
    CHECK(air_b3_world_destroy(f.world)==AIR_B3_OK); CHECK(air_b3_world_destroy(f.other)==AIR_B3_OK); check_no_owned_bytes();
    fprintf(stderr,"{\"case\":\"validation\",\"status\":\"PASS\",\"rejections\":%d,\"badCallOutputBodiesSolverCountsMemoryUnchanged\":true}\n",rejection_checks);
}
static void geometry_contract(void) {
    current_case="geometry"; uint32_t world=air_b3_world_create(0,0,0),a[2],b[2],j[2]; CHECK(world);
    make_body(world,b3_staticBody,(b3Vec3){-1,.3f,2},b3MakeQuatFromAxisAngle((b3Vec3){0,1,0},.71f),b3Vec3_zero,b3Vec3_zero,a);
    make_body(world,b3_dynamicBody,(b3Vec3){2,1,-.5f},b3MakeQuatFromAxisAngle((b3Vec3){1,0,0},-.39f),b3Vec3_zero,b3Vec3_zero,b);
    add_sphere(b,(b3Vec3){.13f,-.08f,.06f},.4f,2);
    CHECK(length(b3Body_GetLocalCenter(body(b)))>.1f);
    const float g[6]={.2f,-.3f,.1f,-.4f,.5f,-.2f};
    for(int automatic=0;automatic<=1;++automatic) {
        create_p2p(world,a,b,g,automatic,0,j); uint32_t s[25]; read_pure(world,a,b,j,s);
        if(!automatic) CHECK(wf(s+24)>.5f); /* Explicit mismatched pivots are not silently snapped. */
        reconfigure(world,a,b,j,1); reconfigure(world,a,b,j,0);
        CHECK(air_b3_joint_destroy(world,j[0],j[1])==AIR_B3_OK);
    }
    CHECK(air_b3_world_destroy(world)==AIR_B3_OK); check_no_owned_bytes();
    fprintf(stderr,"{\"case\":\"geometry\",\"status\":\"PASS\",\"rotatedBodyOriginPivots\":true,\"nonzeroCOM\":true,\"explicitAndAutomaticPivotB\":true,\"noPoseOrVelocityMutation\":true}\n");
}
static Metrics dynamics_contract(int mode) {
    const char* names[]={"anchored_600","two_dynamic_600","initial_mismatch_600"}; current_case=names[mode];
    int anchored=mode!=1, mismatch=mode==2; Metrics m={0};
    uint32_t world=air_b3_world_create(0,mismatch?0:(anchored?-9.81f:-.4f),0),a[2],b[2],j[2],s[25],frames[14]; CHECK(world);
    b3Vec3 pa={-.8f,1.2f,.35f},pb={.7f,1.4f,-.2f};
    b3Quat qa=b3MakeQuatFromAxisAngle((b3Vec3){0,0,1},.37f);
    b3Quat qb=b3MulQuat(b3MakeQuatFromAxisAngle((b3Vec3){1,0,0},.63f),b3MakeQuatFromAxisAngle((b3Vec3){0,1,0},-.29f));
    make_body(world,anchored?b3_staticBody:b3_dynamicBody,pa,qa,b3Vec3_zero,b3Vec3_zero,a);
    make_body(world,b3_dynamicBody,pb,qb,b3Vec3_zero,b3Vec3_zero,b);
    if(!anchored) add_sphere(a,(b3Vec3){.13f,-.08f,.06f},.5f,3);
    add_sphere(b,(b3Vec3){-.12f,.07f,.1f},.4f,2);
    /* Explicit mismatch B pivot must actually exceed the frozen 0.1m COM-offset precondition. */
    const float g[6]={.35f,.2f,-.1f,-.35f,.2f,.04f};
    create_p2p(world,a,b,g,!mismatch,0,j); read_state(world,j,s); memcpy(frames,s+6,sizeof(frames));
    b3Vec3 pivot_a={g[0],g[1],g[2]},pivot_b=b3Joint_GetLocalFrameB(joint(j)).p;
    CHECK(length(b3Body_GetLocalCenter(body(b)))>.1f);
    CHECK(length(b3Sub(pivot_b,b3Body_GetLocalCenter(body(b))))>.1f);
    if(!anchored) { CHECK(length(b3Body_GetLocalCenter(body(a)))>.1f); CHECK(length(b3Sub(pivot_a,b3Body_GetLocalCenter(body(a))))>.1f); }
    m.initial=observe(a,b,pivot_a,pivot_b); if(mismatch) CHECK(m.initial>.2f);
    read_pure(world,a,b,j,s);
    for(int tick=0;tick<TICKS;++tick) {
        current_tick=tick;
        if(!mismatch) {
            float phase=.031f*(float)tick;
            b3Body_ApplyForceToCenter(body(b),(b3Vec3){.15f*sinf(phase),.08f*cosf(phase),-.05f},true);
            b3Body_ApplyTorque(body(b),(b3Vec3){.006f,.004f*sinf(phase),.003f},true);
        }
        CHECK(air_b3_world_step(world,dt,SUBSTEPS)==AIR_B3_OK); read_pure(world,a,b,j,s);
        CHECK(memcmp(frames,s+6,sizeof(frames))==0); float error=observe(a,b,pivot_a,pivot_b);
        CHECK(fabsf(wf(s+24)-error)<=0.00002f); m.peak=fmaxf(m.peak,error); m.final=error;
        if(!mismatch || tick>=SETTLE_TICKS) { m.settled=fmaxf(m.settled,error); CHECK(error<=position_limit); }
        if(mismatch) CHECK(error<=m.initial+.02f);
        for(int which=0;which<2;++which) {
            float snapshot[AIR_B3_BODY_SNAPSHOT_FLOATS]; const uint32_t* id=which?b:a;
            CHECK(air_b3_body_snapshot(id[0],id[1],snapshot)==AIR_B3_OK);
            for(int k=0;k<AIR_B3_BODY_SNAPSHOT_FLOATS;++k) CHECK(isfinite(snapshot[k]));
        }
        if(tick==199 || tick==399) reconfigure(world,a,b,j,0);
    }
    if(mismatch) CHECK(m.final<=m.initial*.05f);
    if(anchored) {
        b3WorldTransform t=b3Body_GetTransform(body(a));
        CHECK(t.p.x==pa.x && t.p.y==pa.y && t.p.z==pa.z && memcmp(&t.q,&qa,sizeof(qa))==0);
    } else CHECK(dlength(subtract(pivot_world(a,b3Vec3_zero),(DVec){pa.x,pa.y,pa.z}))>1);
    fprintf(stderr,"{\"case\":\"%s\",\"status\":\"PASS\",\"ticks\":%d,\"settleTicks\":%d,\"initialAnchorMeters\":%.9g,\"maxAnchorMeters\":%.9g,\"maxQualifiedAnchorMeters\":%.9g,\"finalAnchorMeters\":%.9g,\"nonzeroCOMAndOffcenterPivots\":true}\n",current_case,TICKS,mismatch?SETTLE_TICKS:0,m.initial,m.peak,m.settled,m.final);
    CHECK(air_b3_world_destroy(world)==AIR_B3_OK); check_no_owned_bytes(); current_tick=-1; return m;
}
/* Sign-invariant quaternion geodesic against a known unit-axis rotation. This
   uses no joint-frame angle getter and cannot mistake hinge twist for 3 DOFs. */
static float rotation_error(b3Quat q,b3Vec3 axis,double angle) {
    double e[4]={axis.x*sin(angle*.5),axis.y*sin(angle*.5),axis.z*sin(angle*.5),cos(angle*.5)};
    double x=q.v.x,y=q.v.y,z=q.v.z,s=q.s;
    double dx=e[3]*x-e[0]*s-e[1]*z+e[2]*y;
    double dy=e[3]*y+e[0]*z-e[1]*s-e[2]*x;
    double dz=e[3]*z-e[0]*y+e[1]*x-e[2]*s;
    double ds=e[3]*s+e[0]*x+e[1]*y+e[2]*z;
    diagnostic_rotation=(float)(2*atan2(hypot(hypot(dx,dy),dz),fabs(ds)));
    CHECK(isfinite(diagnostic_rotation)); return diagnostic_rotation;
}
static float rotation_contract(int dimension) {
    const char* names[]={"free_rotation_x","free_rotation_y","free_rotation_z"}; current_case=names[dimension];
    const b3Vec3 axes[]={{1,0,0},{0,1,0},{0,0,1}}; b3Vec3 axis=axes[dimension];
    uint32_t world=air_b3_world_create(0,0,0),a[2],b[2],j[2],s[25]; CHECK(world);
    make_body(world,b3_staticBody,b3Vec3_zero,b3Quat_identity,b3Vec3_zero,b3Vec3_zero,a);
    make_body(world,b3_dynamicBody,b3Vec3_zero,b3Quat_identity,b3Vec3_zero,b3Vec3_zero,b);
    add_box(b,.25f,8); b3MassData mass=b3Body_GetMassData(body(b));
    CHECK(fabsf(mass.mass-1)<=1e-6f && length(mass.center)<=1e-7f);
    CHECK(fabsf(mass.inertia.cx.x-control_inertia)<=1e-6f && fabsf(mass.inertia.cy.y-control_inertia)<=1e-6f && fabsf(mass.inertia.cz.z-control_inertia)<=1e-6f);
    CHECK(fabsf(mass.inertia.cx.y)+fabsf(mass.inertia.cx.z)+fabsf(mass.inertia.cy.x)+fabsf(mass.inertia.cy.z)+fabsf(mass.inertia.cz.x)+fabsf(mass.inertia.cz.y)<=1e-7f);
    CHECK(b3Body_GetLinearDamping(body(b))==0 && b3Body_GetAngularDamping(body(b))==0);
    const float geometry[6]={0,0,0,0,0,0}; create_p2p(world,a,b,geometry,0,0,j);
    b3Body_ApplyAngularImpulse(body(b),b3MulSV(control_inertia,axis),true);
    CHECK(length(b3Sub(b3Body_GetAngularVelocity(body(b)),axis))<=velocity_limit);
    float maximum=0;
    for(int tick=0;tick<ROTATION_TICKS;++tick) {
        current_tick=tick; CHECK(air_b3_world_step(world,dt,SUBSTEPS)==AIR_B3_OK); read_pure(world,a,b,j,s);
        CHECK(observe(a,b,b3Vec3_zero,b3Vec3_zero)<=1e-6f);
        CHECK(length(b3Body_GetLinearVelocity(body(b)))<=1e-6f);
        CHECK(length(b3Sub(b3Body_GetAngularVelocity(body(b)),axis))<=velocity_limit);
        b3ContactData contacts[1]; CHECK(b3Body_GetContactData(body(b),contacts,1)==0);
        float error=rotation_error(b3Body_GetRotation(body(b)),axis,(double)(tick+1)*dt);
        maximum=fmaxf(maximum,error); CHECK(error<=quaternion_limit);
    }
    b3Quat q=b3Body_GetRotation(body(b)); float turned=2*atan2f(length(q.v),fabsf(q.s)); CHECK(turned>1.5f);
    fprintf(stderr,"{\"case\":\"%s\",\"status\":\"PASS\",\"ticks\":%d,\"impulseKgM2PerSecond\":%.9g,\"expectedRadiansPerSecond\":1,\"turnedRadians\":%.9g,\"maxQuaternionErrorRadians\":%.9g,\"noGravityDampingContactOrLeverArm\":true}\n",current_case,ROTATION_TICKS,control_inertia,turned,maximum);
    CHECK(air_b3_world_destroy(world)==AIR_B3_OK); check_no_owned_bytes(); current_tick=-1; return maximum;
}
static int touching_points(const uint32_t id[2]) {
    b3ContactData contacts[4]; int n=b3Body_GetContactData(body(id),contacts,4),points=0; CHECK(n>=0 && n<=4);
    for(int i=0;i<n;++i) {
        CHECK(b3Contact_IsValid(contacts[i].contactId));
        for(int j=0;j<contacts[i].manifoldCount;++j) {
            const b3Manifold* m=contacts[i].manifolds+j;
            for(int k=0;k<m->pointCount;++k) if(m->points[k].separation<=0) ++points;
        }
    }
    return points;
}
static void collision_contract(void) {
    current_case="collision"; int true_points=0,false_points=0;
    for(int initial=0;initial<=1;++initial) {
        uint32_t world=air_b3_world_create(0,0,0),a[2],b[2],j[2]; CHECK(world);
        make_body(world,b3_staticBody,b3Vec3_zero,b3Quat_identity,b3Vec3_zero,b3Vec3_zero,a);
        make_body(world,b3_dynamicBody,(b3Vec3){.75f,0,0},b3Quat_identity,b3Vec3_zero,b3Vec3_zero,b);
        add_sphere(a,b3Vec3_zero,.5f,1); add_sphere(b,b3Vec3_zero,.5f,1);
        const float geometry[6]={.375f,0,0,-.375f,0,0}; create_p2p(world,a,b,geometry,0,initial,j);
        /* Native zero-dt steps only discover real contact manifolds at fixed
           overlapping poses. They do not use penetration response as an oracle. */
        for(int phase=0;phase<3;++phase) {
            int enabled=phase==0?initial:(phase==1?!initial:initial);
            if(phase) reconfigure(world,a,b,j,enabled);
            b3World_Step(b3LoadWorldId(world),0,SUBSTEPS);
            int points=touching_points(b); uint32_t counts[6]; CHECK(air_b3_world_counts(world,counts)==AIR_B3_OK);
            if(enabled) { CHECK(points>0 && counts[2]>0); true_points+=points; }
            else { CHECK(points==0 && counts[2]==0); false_points+=points; }
            uint32_t s[25]; read_pure(world,a,b,j,s); check_native(world,j,enabled);
        }
        CHECK(air_b3_world_destroy(world)==AIR_B3_OK); check_no_owned_bytes();
    }
    fprintf(stderr,"{\"case\":\"collision\",\"status\":\"PASS\",\"creationAndBothToggleDirections\":true,\"enabledTouchingManifoldPoints\":%d,\"disabledTouchingManifoldPoints\":%d}\n",true_points,false_points);
}
static void lifecycle_contract(void) {
    current_case="lifecycle";
    for(int mode=0;mode<3;++mode) {
        uint32_t world=air_b3_world_create(0,0,0),a[2],b[2],j[2],counts[6],out[CANARY_WORDS]; CHECK(world);
        make_body(world,b3_staticBody,b3Vec3_zero,b3Quat_identity,b3Vec3_zero,b3Vec3_zero,a);
        make_body(world,b3_dynamicBody,(b3Vec3){1,0,0},b3Quat_identity,b3Vec3_zero,b3Vec3_zero,b); add_box(b,.25f,8);
        const float g[6]={0,0,0,0,0,0}; create_p2p(world,a,b,g,1,0,j);
        CHECK(air_b3_world_step(world,dt,SUBSTEPS)==AIR_B3_OK);
        if(mode==0) {
            CHECK(air_b3_joint_destroy(world,j[0],j[1])==AIR_B3_OK);
            CHECK(b3Body_GetJointCount(body(a))==0 && b3Body_GetJointCount(body(b))==0);
            CHECK(air_b3_world_counts(world,counts)==AIR_B3_OK && counts[3]==0);
            CHECK(air_b3_body_destroy(a[0],a[1])==AIR_B3_OK); CHECK(air_b3_body_destroy(b[0],b[1])==AIR_B3_OK);
            CHECK(air_b3_world_counts(world,counts)==AIR_B3_OK && counts[0]==0 && counts[1]==0 && counts[2]==0);
        } else if(mode==1) {
            CHECK(air_b3_body_destroy(b[0],b[1])==AIR_B3_OK); CHECK(b3Body_GetJointCount(body(a))==0);
            CHECK(air_b3_world_counts(world,counts)==AIR_B3_OK && counts[0]==1 && counts[3]==0);
        }
        if(mode<2) {
            CHECK(!b3Joint_IsValid(joint(j))); fill_canary(out);
            CHECK(air_b3_p2p_state(world,j[0],j[1],out+1,25)==AIR_B3_INVALID);
            CHECK(air_b3_p2p_configure(world,j[0],j[1],1)==AIR_B3_INVALID);
            CHECK(air_b3_joint_destroy(world,j[0],j[1])==AIR_B3_INVALID); check_canary(out);
        }
        CHECK(air_b3_world_destroy(world)==AIR_B3_OK); CHECK(!b3Joint_IsValid(joint(j)));
        CHECK(!b3Body_IsValid(body(a)) && !b3Body_IsValid(body(b))); fill_canary(out);
        CHECK(air_b3_p2p_state(world,j[0],j[1],out+1,25)==AIR_B3_INVALID);
        CHECK(air_b3_p2p_configure(world,j[0],j[1],1)==AIR_B3_INVALID);
        CHECK(air_b3_joint_destroy(world,j[0],j[1])==AIR_B3_INVALID); check_canary(out); check_no_owned_bytes();
    }
    fprintf(stderr,"{\"case\":\"lifecycle\",\"status\":\"PASS\",\"jointBodyWorldDestroyPaths\":3,\"allOwnedBytesReleased\":true}\n");
}
/* Finite input can still overflow the native separation dot product. State
   must refuse the non-finite snapshot without publishing any output bytes. */
static void large_finite_readback_contract(void) {
    current_case="large-finite-readback";
    uint32_t world=air_b3_world_create(0,0,0),a[2],b[2],j[2],out[CANARY_WORDS],counts[6],after[6]; CHECK(world);
    make_body(world,b3_staticBody,b3Vec3_zero,b3Quat_identity,b3Vec3_zero,b3Vec3_zero,a);
    make_body(world,b3_dynamicBody,b3Vec3_zero,b3Quat_identity,b3Vec3_zero,b3Vec3_zero,b);add_box(b,.25f,8);
    const float g[6]={1e20f,0,0,0,0,0};
    CHECK(air_b3_p2p_create(world,a[0],a[1],b[0],b[1],g,6,0,0,j)==AIR_B3_OK);
    b3JointSim before=*b3GetJointSimCheckType(joint(j),b3_sphericalJoint);
    CHECK(air_b3_world_counts(world,counts)==AIR_B3_OK);fill_canary(out);
    CHECK(air_b3_p2p_state(world,j[0],j[1],out+1,25)==AIR_B3_UNSUPPORTED);check_canary(out);
    CHECK(air_b3_world_counts(world,after)==AIR_B3_OK && memcmp(counts,after,sizeof(counts))==0);
    CHECK(memcmp(&before,b3GetJointSimCheckType(joint(j),b3_sphericalJoint),sizeof(before))==0);
    ++rejection_checks;CHECK(air_b3_world_destroy(world)==AIR_B3_OK);check_no_owned_bytes();
}
int main(void) {
    CHECK(strcmp(air_b3_core_sha(),"efca0c184d40fd6a82016983f1601c4d23965867")==0); check_no_owned_bytes();
    fprintf(stderr,"{\"case\":\"thresholds\",\"ticks\":%d,\"substeps\":%d,\"positionLimitMeters\":%.9g,\"mismatchSettleTicks\":%d,\"quaternionErrorRadians\":%.9g,\"angularVelocityErrorRadiansPerSecond\":%.9g}\n",TICKS,SUBSTEPS,position_limit,SETTLE_TICKS,quaternion_limit,velocity_limit);
    validation_contract(); large_finite_readback_contract(); geometry_contract(); Metrics anchored=dynamics_contract(0),moving=dynamics_contract(1),mismatch=dynamics_contract(2);
    float max_rotation=0; for(int i=0;i<3;++i) max_rotation=fmaxf(max_rotation,rotation_contract(i));
    collision_contract(); lifecycle_contract(); check_no_owned_bytes();
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"coreSha\":\"%s\",\"nativeSpherical\":true,\"rejectionChecks\":%d,\"geometryChecks\":%d,\"fullGenerationWorldOwnership\":true,\"independentBodyOriginQuaternionAnchorOracle\":true,\"configurePreservesFramesAndPoses\":true,\"nativePositionalSoftnessUnchanged\":true,\"anchoredMaxAnchorMeters\":%.9g,\"twoDynamicMaxAnchorMeters\":%.9g,\"mismatchInitialMeters\":%.9g,\"mismatchFinalMeters\":%.9g,\"mismatchMaxSettledMeters\":%.9g,\"independentFreeRotationAxes\":3,\"maxQuaternionErrorRadians\":%.9g,\"actualCollisionManifolds\":true,\"pureStateReads\":%d,\"wholeSolverBodyStateUnchanged\":true,\"finalCoreBytes\":0,\"finalBridgeBytes\":0}\n",sizeof(void*),air_b3_core_sha(),rejection_checks,geometry_checks,anchored.settled,moving.settled,mismatch.initial,mismatch.final,mismatch.settled,max_rotation,pure_reads);
    return 0;
}
