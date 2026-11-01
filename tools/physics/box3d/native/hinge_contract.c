/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Raw pinned-core revolute qualification, not a public-sign-convention test.
   No transform or angular velocity is assigned after body creation. All hinge
   creation/configuration/state calls go through the bridge under test. Native
   body/frame observations, forces and torques provide independent physics oracles.
   Private solver structs are observed only for state-read purity, never edited
   to drive physics. The world lock is edited only for rejection qualification.
   Thresholds below are fixed before execution; failures stay RED. */
#include "air_box3d.h"
#include "hinge_bridge.h"
#include "body.h"
#include "joint.h"
#include "physics_world.h"
#include <box3d/box3d.h>
#include <float.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { CANARY_WORDS = 40, TICKS = 600, SUBSTEPS = 4, SPEED_WARMUP = 60, SPEED_SAMPLES = 120 };
enum { TORQUE_TICKS = 60, TORQUE_SUBSTEPS = 1, PURE_READS_PER_TICK = 8 };
static const float dt = 1.0f / 60.0f;
static const float position_limit = 0.02f, axis_limit = 0.02f;
static const float limit_overshoot = 0.05f, speed_error_limit = 0.05f;
/* Separate, predeclared tolerances for the new dimensional torque controls. */
static const float torque_oracle_limit = 0.00025f, momentum_oracle_limit = 0.00001f;
static const float control_inertia = 1.0f / 24.0f, control_motor_cap = 0.125f;
static const uint32_t canary = UINT32_C(0x5a7e3c19);
static const char* current_case = "startup";
static int current_tick = -1, rejection_checks, geometry_checks;
static float diagnostic_position, diagnostic_axis, diagnostic_angle, diagnostic_speed;

/* Preserve the original failing expression on stderr and a machine-readable RED
   record on stdout, including the most recent independent physical observations. */
#define CHECK(x) do { if (!(x)) { \
    fprintf(stderr, "FAIL %s:%d %s (case=%s tick=%d)\n", __FILE__, __LINE__, #x, current_case, current_tick); \
    printf("{\"status\":\"RED\",\"case\":\"%s\",\"line\":%d,\"tick\":%d," \
        "\"anchorMeters\":%.9g,\"axisRadians\":%.9g,\"angleRadians\":%.9g,\"speedRadiansPerSecond\":%.9g,\"diagnosticsFinite\":%s}\n", \
        current_case, __LINE__, current_tick, \
        isfinite(diagnostic_position) ? diagnostic_position : 0.0f, \
        isfinite(diagnostic_axis) ? diagnostic_axis : 0.0f, \
        isfinite(diagnostic_angle) ? diagnostic_angle : 0.0f, \
        isfinite(diagnostic_speed) ? diagnostic_speed : 0.0f, \
        isfinite(diagnostic_position) && isfinite(diagnostic_axis) && isfinite(diagnostic_angle) && isfinite(diagnostic_speed) ? "true" : "false"); \
    fflush(stdout); exit(1); \
} } while (0)

typedef struct Fixture {
    uint32_t world, other, a[2], b[2], foreign[2], joint[2];
} Fixture;
typedef struct Guard {
    uint32_t counts[2][6], bridge[6], core[2], state[AIR_B3_HINGE_STATE_WORDS];
    float bodies[3][AIR_B3_BODY_SNAPSHOT_FLOATS], native[23];
    int awake[3];
} Guard;
typedef struct Metrics {
    float position, axis, angle_error, total_twist, force, torque;
} Metrics;
typedef struct Observation {
    float position, axis, angle;
    b3Vec3 world_axis;
} Observation;

static uint64_t id_value(const uint32_t id[2]) { return (uint64_t)id[0] | ((uint64_t)id[1] << 32); }
static b3BodyId body(const uint32_t id[2]) { return b3LoadBodyId(id_value(id)); }
static b3JointId joint(const uint32_t id[2]) { return b3LoadJointId(id_value(id)); }
static float wf(const uint32_t* word) { float x; memcpy(&x, word, sizeof(x)); return x; }
static void pf(uint32_t* word, float x) { memcpy(word, &x, sizeof(x)); }
static float length(b3Vec3 v) { return sqrtf(b3Dot(v, v)); }
static float wrap(float a) {
    while (a > B3_PI) a -= 2.0f * B3_PI;
    while (a < -B3_PI) a += 2.0f * B3_PI;
    return a;
}
static b3Vec3 normalized(b3Vec3 v) {
    double n = hypot(hypot((double)v.x, (double)v.y), (double)v.z);
    CHECK(isfinite(n) && n > 0);
    return (b3Vec3){(float)(v.x / n), (float)(v.y / n), (float)(v.z / n)};
}
static void frame_floats(float* out, b3Transform t) {
    const float values[7] = {t.p.x, t.p.y, t.p.z, t.q.v.x, t.q.v.y, t.q.v.z, t.q.s};
    memcpy(out, values, sizeof(values));
}
static void config(uint32_t c[AIR_B3_HINGE_CONFIG_WORDS], int collide, int limit,
    float lower, float upper, int motor, float speed, float torque) {
    c[0] = (uint32_t)collide; c[1] = (uint32_t)limit; pf(c + 2, lower); pf(c + 3, upper);
    c[4] = (uint32_t)motor; pf(c + 5, speed); pf(c + 6, torque);
}
static void fill_canary(uint32_t* out) { for (int i = 0; i < CANARY_WORDS; ++i) out[i] = canary; }
static void check_canary(const uint32_t* out) { for (int i = 0; i < CANARY_WORDS; ++i) CHECK(out[i] == canary); }
static void check_tail(const uint32_t* out, int written) {
    CHECK(out[0] == canary);
    for (int i = written + 1; i < CANARY_WORDS; ++i) CHECK(out[i] == canary);
}
static void read_state(uint32_t world, const uint32_t id[2], uint32_t out[AIR_B3_HINGE_STATE_WORDS]) {
    CHECK(air_b3_hinge_state(world, id[0], id[1], out, AIR_B3_HINGE_STATE_WORDS) == AIR_B3_OK);
    for (int i = 6; i < AIR_B3_HINGE_STATE_WORDS; ++i)
        if (i != 20 && i != 23) CHECK(isfinite(wf(out + i)));
}
static void check_no_owned_bytes(void) {
    uint32_t core[2], bridge[6];
    air_b3_live_bytes(core);
    CHECK(core[0] == 0 && core[1] == 0);
    CHECK(air_b3_bridge_memory(0, bridge) == AIR_B3_OK);
    for (int i = 0; i < 6; ++i) CHECK(bridge[i] == 0);
}
static void make_body(uint32_t world, int type, b3Vec3 p, b3Quat q,
    b3Vec3 v, b3Vec3 w, uint32_t out[2]) {
    const float input[AIR_B3_BODY_INPUT_FLOATS] = {
        p.x, p.y, p.z, q.v.x, q.v.y, q.v.z, q.s, v.x, v.y, v.z, w.x, w.y, w.z, 0, 0, 1
    };
    CHECK(air_b3_body_create(world, type, input, 0, out) == AIR_B3_OK);
}
static void add_box(const uint32_t id[2], float x, float y, float z, float density) {
    uint32_t shape[2];
    CHECK(air_b3_shape_box(id[0], id[1], x, y, z, density, shape) == AIR_B3_OK);
}

/* Angle is derived from independent body quaternions and captured joint-frame
   basis vectors, not b3RevoluteJoint_GetAngle or bridge state. Projection works
   at small constraint drift; atan2 and per-tick unwrapping retain motor direction. */
static Observation observe(const uint32_t a[2], const uint32_t b[2], b3Transform fa, b3Transform fb) {
    b3WorldTransform wa = b3MulWorldTransforms(b3Body_GetTransform(body(a)), fa);
    b3WorldTransform wb = b3MulWorldTransforms(b3Body_GetTransform(body(b)), fb);
    b3Vec3 za = b3RotateVector(wa.q, (b3Vec3){0, 0, 1});
    b3Vec3 zb = b3RotateVector(wb.q, (b3Vec3){0, 0, 1});
    b3Vec3 xa = b3RotateVector(wa.q, (b3Vec3){1, 0, 0});
    b3Vec3 xb = b3RotateVector(wb.q, (b3Vec3){1, 0, 0});
    Observation o = {length(b3SubPos(wb.p, wa.p)),
        atan2f(length(b3Cross(za, zb)), b3Dot(za, zb)),
        atan2f(b3Dot(za, b3Cross(xa, xb)), b3Dot(xa, xb)), za};
    diagnostic_position = o.position; diagnostic_axis = o.axis; diagnostic_angle = o.angle;
    CHECK(isfinite(o.position) && isfinite(o.axis) && isfinite(o.angle));
    return o;
}
static void check_config(uint32_t world, const uint32_t id[2], const uint32_t* c) {
    uint32_t s[AIR_B3_HINGE_STATE_WORDS];
    read_state(world, id, s);
    CHECK(s[5] == c[0] && s[20] == c[1] && s[23] == c[4]);
    CHECK(s[21] == c[2] && s[22] == c[3] && s[24] == c[5] && s[25] == c[6]);
    b3JointId j = joint(id);
    CHECK(b3Joint_GetCollideConnected(j) == (c[0] != 0));
    CHECK(b3RevoluteJoint_IsLimitEnabled(j) == (c[1] != 0));
    CHECK(b3RevoluteJoint_GetLowerLimit(j) == wf(c + 2));
    CHECK(b3RevoluteJoint_GetUpperLimit(j) == wf(c + 3));
    CHECK(b3RevoluteJoint_IsMotorEnabled(j) == (c[4] != 0));
    CHECK(b3RevoluteJoint_GetMotorSpeed(j) == wf(c + 5));
    CHECK(b3RevoluteJoint_GetMaxMotorTorque(j) == wf(c + 6));
    CHECK(!b3RevoluteJoint_IsSpringEnabled(j));
}
static void create_hinge(uint32_t world, const uint32_t a[2], const uint32_t b[2],
    const float g[9], int auto_b, const uint32_t c[7], uint32_t id[2]) {
    float before[2][AIR_B3_BODY_SNAPSHOT_FLOATS], after[2][AIR_B3_BODY_SNAPSHOT_FLOATS];
    uint32_t counts_before[6], counts_after[6], out[CANARY_WORDS], s[AIR_B3_HINGE_STATE_WORDS];
    float geometry_copy[9]; uint32_t config_copy[7];
    memcpy(geometry_copy, g, sizeof(geometry_copy)); memcpy(config_copy, c, sizeof(config_copy));
    CHECK(air_b3_body_snapshot(a[0], a[1], before[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], before[1]) == AIR_B3_OK);
    CHECK(air_b3_world_counts(world, counts_before) == AIR_B3_OK);
    fill_canary(out);
    CHECK(air_b3_hinge_create(world, a[0], a[1], b[0], b[1], g, 9, auto_b, c, 7, out + 1) == AIR_B3_OK);
    check_tail(out, 2); id[0] = out[1]; id[1] = out[2];
    CHECK(memcmp(g, geometry_copy, sizeof(geometry_copy)) == 0);
    CHECK(memcmp(c, config_copy, sizeof(config_copy)) == 0);
    CHECK(b3Joint_IsValid(joint(id)) && b3Joint_GetType(joint(id)) == b3_revoluteJoint);
    CHECK(b3StoreBodyId(b3Joint_GetBodyA(joint(id))) == id_value(a));
    CHECK(b3StoreBodyId(b3Joint_GetBodyB(joint(id))) == id_value(b));
    CHECK(air_b3_body_snapshot(a[0], a[1], after[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], after[1]) == AIR_B3_OK);
    CHECK(memcmp(before, after, sizeof(before)) == 0);
    CHECK(air_b3_world_counts(world, counts_after) == AIR_B3_OK);
    for (int i = 0; i < 3; ++i) CHECK(counts_before[i] == counts_after[i]);
    CHECK(counts_after[3] == counts_before[3] + 1);
    read_state(world, id, s);
    CHECK(s[0] == 2 && s[1] == a[0] && s[2] == a[1] && s[3] == b[0] && s[4] == b[1]);
    b3Transform fa = b3Joint_GetLocalFrameA(joint(id)), fb = b3Joint_GetLocalFrameB(joint(id));
    CHECK(fabsf(b3Dot(fa.q.v, fa.q.v) + fa.q.s * fa.q.s - 1.0f) <= 1e-5f);
    CHECK(fabsf(b3Dot(fb.q.v, fb.q.v) + fb.q.s * fb.q.s - 1.0f) <= 1e-5f);
    float native_frames[14]; frame_floats(native_frames, fa); frame_floats(native_frames + 7, fb);
    for (int i = 0; i < 14; ++i) CHECK(wf(s + 6 + i) == native_frames[i]);
    CHECK(fa.p.x == g[0] && fa.p.y == g[1] && fa.p.z == g[2]);
    if (!auto_b) CHECK(fb.p.x == g[3] && fb.p.y == g[4] && fb.p.z == g[5]);
    b3Vec3 expected = normalized((b3Vec3){g[6], g[7], g[8]});
    CHECK(length(b3Sub(b3RotateVector(fa.q, (b3Vec3){0, 0, 1}), expected)) <= 1e-5f);
    Observation o = observe(a, b, fa, fb);
    CHECK(o.axis <= 1e-5f && fabsf(o.angle) <= 1e-5f);
    if (auto_b) CHECK(o.position <= 1e-5f);
    CHECK(fabsf(wf(s + 26)) <= 1e-5f);
    check_config(world, id, c);
    ++geometry_checks;
}
static void reconfigure(uint32_t world, const uint32_t a[2], const uint32_t b[2],
    const uint32_t id[2], const uint32_t c[7]) {
    uint32_t before[AIR_B3_HINGE_STATE_WORDS], after[AIR_B3_HINGE_STATE_WORDS], copy[7];
    float bodies_before[2][AIR_B3_BODY_SNAPSHOT_FLOATS], bodies_after[2][AIR_B3_BODY_SNAPSHOT_FLOATS];
    float frames_before[14], frames_after[14];
    read_state(world, id, before); memcpy(copy, c, sizeof(copy));
    frame_floats(frames_before, b3Joint_GetLocalFrameA(joint(id)));
    frame_floats(frames_before + 7, b3Joint_GetLocalFrameB(joint(id)));
    CHECK(air_b3_body_snapshot(a[0], a[1], bodies_before[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], bodies_before[1]) == AIR_B3_OK);
    CHECK(air_b3_hinge_configure(world, id[0], id[1], c, 7) == AIR_B3_OK);
    CHECK(memcmp(copy, c, sizeof(copy)) == 0);
    read_state(world, id, after);
    CHECK(memcmp(before, after, 5 * sizeof(uint32_t)) == 0);
    CHECK(memcmp(before + 6, after + 6, 14 * sizeof(uint32_t)) == 0);
    CHECK(before[26] == after[26]); /* Reconfiguration cannot redefine zero. */
    frame_floats(frames_after, b3Joint_GetLocalFrameA(joint(id)));
    frame_floats(frames_after + 7, b3Joint_GetLocalFrameB(joint(id)));
    CHECK(memcmp(frames_before, frames_after, sizeof(frames_before)) == 0);
    CHECK(air_b3_body_snapshot(a[0], a[1], bodies_after[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], bodies_after[1]) == AIR_B3_OK);
    CHECK(memcmp(bodies_before, bodies_after, sizeof(bodies_before)) == 0);
    check_config(world, id, c);
}
static Guard capture_guard(const Fixture* f) {
    Guard g = {0};
    CHECK(air_b3_world_counts(f->world, g.counts[0]) == AIR_B3_OK);
    CHECK(air_b3_world_counts(f->other, g.counts[1]) == AIR_B3_OK);
    CHECK(air_b3_bridge_memory(0, g.bridge) == AIR_B3_OK); air_b3_live_bytes(g.core);
    const uint32_t* ids[3] = {f->a, f->b, f->foreign};
    for (int i = 0; i < 3; ++i) {
        CHECK(air_b3_body_snapshot(ids[i][0], ids[i][1], g.bodies[i]) == AIR_B3_OK);
        g.awake[i] = b3Body_IsAwake(body(ids[i]));
    }
    if (b3Joint_IsValid(joint(f->joint))) {
        b3JointId j = joint(f->joint);
        read_state(f->world, f->joint, g.state);
        frame_floats(g.native, b3Joint_GetLocalFrameA(j)); frame_floats(g.native + 7, b3Joint_GetLocalFrameB(j));
        g.native[14] = (float)b3Joint_GetCollideConnected(j);
        g.native[15] = (float)b3RevoluteJoint_IsLimitEnabled(j);
        g.native[16] = b3RevoluteJoint_GetLowerLimit(j); g.native[17] = b3RevoluteJoint_GetUpperLimit(j);
        g.native[18] = (float)b3RevoluteJoint_IsMotorEnabled(j); g.native[19] = b3RevoluteJoint_GetMotorSpeed(j);
        g.native[20] = b3RevoluteJoint_GetMaxMotorTorque(j); g.native[21] = b3RevoluteJoint_GetAngle(j);
        g.native[22] = b3RevoluteJoint_GetMotorTorque(j);
    }
    return g;
}
#define REJECT(expected, call) do { \
    Guard before = capture_guard(&f); fill_canary(out); \
    CHECK((call) == (expected)); check_canary(out); \
    Guard after = capture_guard(&f); CHECK(memcmp(&before, &after, sizeof(before)) == 0); \
    ++rejection_checks; \
} while (0)
#define CREATE(gp, gn, ab, cp, cn, op) \
    air_b3_hinge_create(f.world, f.a[0], f.a[1], f.b[0], f.b[1], gp, gn, ab, cp, cn, op)

static void validation_contract(void) {
    current_case = "validation";
    Fixture f = {0}; uint32_t out[CANARY_WORDS], c[7], bad[7];
    float g[9] = {.2f, -.1f, .3f, -.4f, .25f, .1f, 1, 2, 3}, bad_g[9];
    config(c, 0, 0, -.5f, .5f, 0, 0, 3);
    f.world = air_b3_world_create(0, 0, 0); f.other = air_b3_world_create(0, 0, 0);
    CHECK(f.world && f.other && f.world != f.other);
    make_body(f.world, b3_staticBody, (b3Vec3){-1, 2, .5f},
        b3MakeQuatFromAxisAngle((b3Vec3){0, 0, 1}, .37f), b3Vec3_zero, b3Vec3_zero, f.a);
    make_body(f.world, b3_dynamicBody, (b3Vec3){1.5f, 1, -.75f},
        b3MakeQuatFromAxisAngle((b3Vec3){0, 1, 0}, -.61f), b3Vec3_zero, b3Vec3_zero, f.b);
    make_body(f.other, b3_dynamicBody, (b3Vec3){3, 2, 1}, b3Quat_identity, b3Vec3_zero, b3Vec3_zero, f.foreign);
    add_box(f.b, .4f, .3f, .2f, 2); add_box(f.foreign, .4f, .3f, .2f, 2);
    create_hinge(f.world, f.a, f.b, g, 1, c, f.joint);
    uint32_t stale[2], replacement[2];
    make_body(f.world, b3_dynamicBody, b3Vec3_zero, b3Quat_identity, b3Vec3_zero, b3Vec3_zero, stale);
    CHECK(air_b3_body_destroy(stale[0], stale[1]) == AIR_B3_OK);
    make_body(f.world, b3_dynamicBody, b3Vec3_zero, b3Quat_identity, b3Vec3_zero, b3Vec3_zero, replacement);
    CHECK(stale[1] == replacement[1] && stale[0] != replacement[0]);
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(0, f.a[0], f.a[1], f.b[0], f.b[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.world ^ 1u, f.a[0], f.a[1], f.b[0], f.b[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.other, f.a[0], f.a[1], f.b[0], f.b[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.world, f.a[0], f.a[1], f.foreign[0], f.foreign[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.world, f.a[0] ^ 1u, f.a[1], f.b[0], f.b[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.world, f.a[0], f.a[1], f.b[0], UINT32_MAX, g, 9, 1, c, 7, out + 1));
    /* Verified pinned b3LoadBodyId/b3LoadJointId: index1 is the high word.
       Reject INT32_MIN before the core validity path can subtract one. */
    const uint32_t malformed_high = UINT32_C(0x80000000);
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.world, f.a[0], malformed_high, f.b[0], f.b[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.world, f.a[0], f.a[1], f.b[0], malformed_high, g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.world, stale[0], stale[1], f.b[0], f.b[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_hinge_create(f.world, 0, 0, f.b[0], f.b[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, air_b3_hinge_create(f.world, f.a[0], f.a[1], f.a[0], f.a[1], g, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE(NULL, 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE((const float*)((const unsigned char*)g + 1), 9, 1, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE(g, 8, 1, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE(g, 10, 1, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE(g, -1, 1, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, -1, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 2, c, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 1, c, 7, NULL));
    REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 1, c, 7, (uint32_t*)((unsigned char*)out + 1)));
    const float nonfinite[] = {NAN, INFINITY, -INFINITY};
    for (int k = 0; k < 3; ++k) for (int i = 0; i < 9; ++i) {
        memcpy(bad_g, g, sizeof(g)); bad_g[i] = nonfinite[k];
        REJECT(AIR_B3_ARGUMENT, CREATE(bad_g, 9, 1, c, 7, out + 1));
    }
    memcpy(bad_g, g, sizeof(g)); bad_g[6] = bad_g[7] = bad_g[8] = 0;
    REJECT(AIR_B3_ARGUMENT, CREATE(bad_g, 9, 1, c, 7, out + 1));
    const int bad_counts[] = {-1, 0, 6, 8};
    for (int i = 0; i < 4; ++i) {
        REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 1, c, bad_counts[i], out + 1));
        REJECT(AIR_B3_ARGUMENT, air_b3_hinge_configure(f.world, f.joint[0], f.joint[1], c, bad_counts[i]));
    }
    REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 1, NULL, 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 1, (const uint32_t*)((const unsigned char*)c + 1), 7, out + 1));
    REJECT(AIR_B3_ARGUMENT, air_b3_hinge_configure(f.world, f.joint[0], f.joint[1], NULL, 7));
    REJECT(AIR_B3_ARGUMENT, air_b3_hinge_configure(f.world, f.joint[0], f.joint[1], (const uint32_t*)((const unsigned char*)c + 1), 7));
    /* All bad fields are exercised against both create and an existing native
       hinge. Changes to earlier valid fields expose partial-mutation ordering. */
    const int bool_fields[] = {0, 1, 4}, float_fields[] = {2, 3, 5, 6};
    for (int i = 0; i < 3; ++i) for (int k = 0; k < 2; ++k) {
        config(bad, 1, 1, -.2f, .3f, 1, -1, 2); bad[bool_fields[i]] = k ? UINT32_MAX : 2;
        REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 1, bad, 7, out + 1));
        REJECT(AIR_B3_ARGUMENT, air_b3_hinge_configure(f.world, f.joint[0], f.joint[1], bad, 7));
    }
    for (int i = 0; i < 4; ++i) for (int k = 0; k < 3; ++k) {
        config(bad, 1, 1, -.2f, .3f, 1, -1, 2); pf(bad + float_fields[i], nonfinite[k]);
        REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 1, bad, 7, out + 1));
        REJECT(AIR_B3_ARGUMENT, air_b3_hinge_configure(f.world, f.joint[0], f.joint[1], bad, 7));
    }
    for (int enabled = 0; enabled <= 1; ++enabled) for (int k = 0; k < 4; ++k) {
        config(bad, 1, enabled, -.2f, .3f, 1, -1, 2);
        if (k == 0) pf(bad + 2, .4f); /* Ordered, not silently sorted. */
        if (k == 1) pf(bad + 2, nextafterf(-.99f * B3_PI, -INFINITY));
        if (k == 2) pf(bad + 3, nextafterf(.99f * B3_PI, INFINITY));
        if (k == 3) pf(bad + 6, -.001f);
        REJECT(AIR_B3_ARGUMENT, CREATE(g, 9, 1, bad, 7, out + 1));
        REJECT(AIR_B3_ARGUMENT, air_b3_hinge_configure(f.world, f.joint[0], f.joint[1], bad, 7));
    }
    fill_canary(out);
    CHECK(air_b3_hinge_state(f.world, f.joint[0], f.joint[1], out + 1, 36) == AIR_B3_OK);
    check_tail(out, 36);
    uint32_t retained[36]; memcpy(retained, out + 1, sizeof(retained));
    out[7] ^= 1u; /* Mutating a copied output must not mutate the native frame. */
    uint32_t reread[36]; read_state(f.world, f.joint, reread); CHECK(memcmp(retained, reread, sizeof(retained)) == 0);
    for (int capacity = 0; capacity < AIR_B3_HINGE_STATE_WORDS; ++capacity)
        REJECT(AIR_B3_CAPACITY, air_b3_hinge_state(f.world, f.joint[0], f.joint[1], out + 1, capacity));
    REJECT(AIR_B3_ARGUMENT, air_b3_hinge_state(f.world, f.joint[0], f.joint[1], out + 1, -1));
    REJECT(AIR_B3_ARGUMENT, air_b3_hinge_state(f.world, f.joint[0], f.joint[1], NULL, 36));
    REJECT(AIR_B3_ARGUMENT, air_b3_hinge_state(f.world, f.joint[0], f.joint[1], (uint32_t*)((unsigned char*)out + 1), 36));
    const uint32_t bad_worlds[] = {0, f.world ^ 1u, f.other};
    for (int i = 0; i < 3; ++i) {
        REJECT(AIR_B3_INVALID, air_b3_hinge_state(bad_worlds[i], f.joint[0], f.joint[1], out + 1, 36));
        REJECT(AIR_B3_INVALID, air_b3_hinge_configure(bad_worlds[i], f.joint[0], f.joint[1], c, 7));
        REJECT(AIR_B3_INVALID, air_b3_joint_destroy(bad_worlds[i], f.joint[0], f.joint[1]));
    }
    const uint32_t bad_ids[4][2] = {{0, 0}, {f.joint[0] ^ 1u, f.joint[1]},
        {f.joint[0], UINT32_MAX}, {f.joint[0], malformed_high}};
    for (int i = 0; i < 4; ++i) {
        REJECT(AIR_B3_INVALID, air_b3_hinge_state(f.world, bad_ids[i][0], bad_ids[i][1], out + 1, 36));
        REJECT(AIR_B3_INVALID, air_b3_hinge_configure(f.world, bad_ids[i][0], bad_ids[i][1], c, 7));
        REJECT(AIR_B3_INVALID, air_b3_joint_destroy(f.world, bad_ids[i][0], bad_ids[i][1]));
    }
    Guard unlocked = capture_guard(&f); fill_canary(out);
    b3World* internal = b3GetWorldFromId(b3LoadWorldId(f.world)); internal->locked = true;
    CHECK(CREATE(g, 9, 1, c, 7, out + 1) == AIR_B3_LOCKED);
    CHECK(air_b3_hinge_configure(f.world, f.joint[0], f.joint[1], c, 7) == AIR_B3_LOCKED);
    CHECK(air_b3_hinge_state(f.world, f.joint[0], f.joint[1], out + 1, 36) == AIR_B3_LOCKED);
    CHECK(air_b3_joint_destroy(f.world, f.joint[0], f.joint[1]) == AIR_B3_LOCKED);
    internal->locked = false; check_canary(out);
    Guard relocked = capture_guard(&f); CHECK(memcmp(&unlocked, &relocked, sizeof(unlocked)) == 0); rejection_checks += 4;
    config(c, 1, 1, -.99f * B3_PI, .99f * B3_PI, 1, -B3_PI / 2, 0);
    reconfigure(f.world, f.a, f.b, f.joint, c);
    config(c, 0, 1, .25f, .25f, 0, B3_PI / 2, 3); reconfigure(f.world, f.a, f.b, f.joint, c);
    uint32_t old[2] = {f.joint[0], f.joint[1]};
    CHECK(air_b3_joint_destroy(f.world, old[0], old[1]) == AIR_B3_OK);
    config(c, 0, 0, -.5f, .5f, 0, 0, 3); create_hinge(f.world, f.a, f.b, g, 1, c, f.joint);
    CHECK(old[1] == f.joint[1] && old[0] != f.joint[0]);
    REJECT(AIR_B3_INVALID, air_b3_hinge_state(f.world, old[0], old[1], out + 1, 36));
    REJECT(AIR_B3_INVALID, air_b3_hinge_configure(f.world, old[0], old[1], c, 7));
    REJECT(AIR_B3_INVALID, air_b3_joint_destroy(f.world, old[0], old[1]));
    b3DistanceJointDef distance = b3DefaultDistanceJointDef();
    distance.base.bodyIdA = body(f.a); distance.base.bodyIdB = body(replacement);
    b3JointId other_type = b3CreateDistanceJoint(b3LoadWorldId(f.world), &distance); CHECK(b3Joint_IsValid(other_type));
    uint64_t other_id = b3StoreJointId(other_type);
    REJECT(AIR_B3_UNSUPPORTED, air_b3_hinge_state(f.world, (uint32_t)other_id, (uint32_t)(other_id >> 32), out + 1, 36));
    REJECT(AIR_B3_UNSUPPORTED, air_b3_hinge_configure(f.world, (uint32_t)other_id, (uint32_t)(other_id >> 32), c, 7));
    CHECK(air_b3_joint_destroy(f.world, (uint32_t)other_id, (uint32_t)(other_id >> 32)) == AIR_B3_OK);
    CHECK(air_b3_world_destroy(f.world) == AIR_B3_OK); CHECK(air_b3_world_destroy(f.other) == AIR_B3_OK);
    CHECK(!b3Joint_IsValid(joint(f.joint))); check_no_owned_bytes();
    fprintf(stderr, "{\"case\":\"validation\",\"status\":\"PASS\",\"rejections\":%d,\"badCallOutputBodyStateCountsMemoryUnchanged\":true}\n", rejection_checks);
}

static void geometry_contract(void) {
    current_case = "geometry";
    uint32_t world = air_b3_world_create(0, 0, 0), a[2], b[2], j[2], c[7]; CHECK(world);
    make_body(world, b3_staticBody, (b3Vec3){-1, .3f, 2},
        b3MakeQuatFromAxisAngle((b3Vec3){0, 1, 0}, .71f), b3Vec3_zero, b3Vec3_zero, a);
    make_body(world, b3_dynamicBody, (b3Vec3){2, 1, -.5f},
        b3MakeQuatFromAxisAngle((b3Vec3){1, 0, 0}, -.39f), b3Vec3_zero, b3Vec3_zero, b);
    add_box(b, .4f, .3f, .2f, 2); config(c, 0, 0, -.5f, .5f, 0, 0, 3);
    const b3Vec3 axes[] = {{0, 0, 7}, {0, 0, -9}, {9, -12, 0}, {FLT_MAX, FLT_MAX, -FLT_MAX}, {FLT_MIN, 0, 0}};
    for (int i = 0; i < 5; ++i) for (int auto_b = 0; auto_b <= 1; ++auto_b) {
        float g[9] = {.2f, -.3f, .1f, -.4f, .5f, -.2f, axes[i].x, axes[i].y, axes[i].z};
        create_hinge(world, a, b, g, auto_b, c, j);
        CHECK(air_b3_joint_destroy(world, j[0], j[1]) == AIR_B3_OK); CHECK(!b3Joint_IsValid(joint(j)));
    }
    CHECK(air_b3_world_destroy(world) == AIR_B3_OK); check_no_owned_bytes();
    fprintf(stderr, "{\"case\":\"geometry\",\"status\":\"PASS\",\"scaledAntiparallelAndExtremeNonzeroAxes\":true,\"explicitAndAutomaticPivotB\":true,\"noPoseMutation\":true}\n");
}

static void sample_constraints(uint32_t world, const uint32_t a[2], const uint32_t b[2], const uint32_t j[2],
    b3Transform fa, b3Transform fb, const uint32_t frames[14], Metrics* m, Observation* result) {
    uint32_t s[AIR_B3_HINGE_STATE_WORDS]; read_state(world, j, s);
    float bodies[2][AIR_B3_BODY_SNAPSHOT_FLOATS];
    CHECK(air_b3_body_snapshot(a[0], a[1], bodies[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], bodies[1]) == AIR_B3_OK);
    for (int i = 0; i < 2; ++i) for (int k = 0; k < AIR_B3_BODY_SNAPSHOT_FLOATS; ++k) CHECK(isfinite(bodies[i][k]));
    CHECK(memcmp(frames, s + 6, 14 * sizeof(uint32_t)) == 0);
    Observation o = observe(a, b, fa, fb);
    m->position = fmaxf(m->position, o.position); m->axis = fmaxf(m->axis, o.axis);
    m->angle_error = fmaxf(m->angle_error, fabsf(wrap(wf(s + 26) - o.angle)));
    CHECK(o.position <= position_limit && o.axis <= axis_limit);
    CHECK(fabsf(wrap(wf(s + 26) - o.angle)) <= .002f);
    CHECK(fabsf(wf(s + 34) - o.position) <= 1e-5f && fabsf(wf(s + 35) - o.axis) <= 1e-5f);
    b3Vec3 native_force = b3Joint_GetConstraintForce(joint(j));
    CHECK(wf(s + 27) == b3RevoluteJoint_GetMotorTorque(joint(j)));
    CHECK(wf(s + 28) == native_force.x && wf(s + 29) == native_force.y && wf(s + 30) == native_force.z);
    /* Do not call the pinned core's torque getter: it double-counts the axial
       impulse and overwrites solver axes. Dimensional controls below qualify
       bridge total couple against independently measured angular momentum. */
    float force = length(native_force), torque = length((b3Vec3){wf(s + 31), wf(s + 32), wf(s + 33)});
    CHECK(isfinite(force) && isfinite(torque));
    m->force = fmaxf(m->force, force); m->torque = fmaxf(m->torque, torque);
    *result = o;
}
static Metrics dynamics_contract(int anchored) {
    current_case = anchored ? "anchored_600" : "two_dynamic_600";
    uint32_t world = air_b3_world_create(0, anchored ? -9.81f : -.4f, 0), a[2], b[2], j[2], c[7], s[36], frames[14]; CHECK(world);
    b3Vec3 pa = {-.8f, 1.2f, .35f}, pb = {.7f, 1.4f, -.2f};
    b3Quat qa = b3MakeQuatFromAxisAngle((b3Vec3){0, 0, 1}, .37f);
    b3Quat qb = b3MulQuat(b3MakeQuatFromAxisAngle((b3Vec3){1, 0, 0}, .63f), b3MakeQuatFromAxisAngle((b3Vec3){0, 1, 0}, -.29f));
    b3Vec3 w = anchored ? b3Vec3_zero : (b3Vec3){.1f, .2f, .15f};
    b3Vec3 va = anchored ? b3Vec3_zero : (b3Vec3){.35f, .1f, -.2f};
    b3Vec3 vb = b3Add(va, b3Cross(w, b3Sub(pb, pa)));
    make_body(world, anchored ? b3_staticBody : b3_dynamicBody, pa, qa, va, w, a);
    make_body(world, b3_dynamicBody, pb, qb, vb, w, b);
    if (!anchored) add_box(a, .6f, .5f, .4f, 3);
    add_box(b, .4f, .3f, .2f, 2);
    float g[9] = {.35f, .2f, -.1f, 0, 0, 0, .3f, .6f, 1.5f};
    config(c, 0, 0, -.5f, .5f, 0, 0, 3); create_hinge(world, a, b, g, 1, c, j);
    read_state(world, j, s); memcpy(frames, s + 6, sizeof(frames));
    b3Transform fa = b3Joint_GetLocalFrameA(joint(j)), fb = b3Joint_GetLocalFrameB(joint(j));
    Observation previous = observe(a, b, fa, fb); Metrics m = {0};
    for (int tick = 0; tick < TICKS; ++tick) {
        current_tick = tick; float phase = .031f * (float)tick;
        b3Body_ApplyForceToCenter(body(b), (b3Vec3){.3f * sinf(phase), .15f * cosf(phase), -.1f}, true);
        b3Body_ApplyTorque(body(b), b3Add(b3MulSV(.08f, previous.world_axis), (b3Vec3){.01f, .008f * sinf(phase), .005f}), true);
        CHECK(air_b3_world_step(world, dt, SUBSTEPS) == AIR_B3_OK);
        Observation o; sample_constraints(world, a, b, j, fa, fb, frames, &m, &o);
        m.total_twist += fabsf(wrap(o.angle - previous.angle)); previous = o;
        if (tick == 199 || tick == 399) {
            /* Real nonzero configuration changes, still with motor and limit off. */
            config(c, 0, 0, tick == 199 ? -.7f : -.5f, tick == 199 ? .8f : .5f, 0, tick == 199 ? -1 : 1, 2);
            reconfigure(world, a, b, j, c);
        }
    }
    CHECK(m.total_twist > .25f && m.force > .01f && m.torque > .001f);
    if (anchored) {
        CHECK(length(b3SubPos(b3Body_GetPosition(body(a)), (b3Pos){pa.x, pa.y, pa.z})) == 0);
        b3Quat actual = b3Body_GetRotation(body(a)); CHECK(memcmp(&actual, &qa, sizeof(qa)) == 0);
    } else CHECK(length(b3SubPos(b3Body_GetPosition(body(a)), (b3Pos){pa.x, pa.y, pa.z})) > 1);
    fprintf(stderr, "{\"case\":\"%s\",\"status\":\"PASS\",\"ticks\":%d,\"maxAnchorMeters\":%.9g,\"maxAxisRadians\":%.9g,\"maxAngleOracleError\":%.9g,\"absoluteFreeTwistRadians\":%.9g,\"maxForce\":%.9g,\"maxTorque\":%.9g}\n",
        current_case, TICKS, m.position, m.axis, m.angle_error, m.total_twist, m.force, m.torque);
    CHECK(air_b3_world_destroy(world) == AIR_B3_OK); CHECK(!b3Joint_IsValid(joint(j))); check_no_owned_bytes(); current_tick = -1;
    return m;
}

static void make_motor_fixture(uint32_t* world, uint32_t a[2], uint32_t b[2], uint32_t j[2], const uint32_t c[7]) {
    *world = air_b3_world_create(0, 0, 0); CHECK(*world);
    make_body(*world, b3_staticBody, (b3Vec3){.2f, -.3f, .4f}, b3Quat_identity, b3Vec3_zero, b3Vec3_zero, a);
    make_body(*world, b3_dynamicBody, (b3Vec3){.2f, -.3f, .4f},
        b3MakeQuatFromAxisAngle((b3Vec3){1, 0, 0}, .47f), b3Vec3_zero, b3Vec3_zero, b);
    add_box(b, .4f, .4f, .4f, 1);
    const float g[9] = {0, 0, 0, 0, 0, 0, 0, 0, -7};
    create_hinge(*world, a, b, g, 1, c, j);
}
static float measure_speed(uint32_t world, const uint32_t a[2], const uint32_t b[2], const uint32_t j[2],
    float target, int warmup, int samples, int expect_no_drive, Metrics* m) {
    uint32_t s[36], frames[14]; read_state(world, j, s); memcpy(frames, s + 6, sizeof(frames));
    b3Transform fa = b3Joint_GetLocalFrameA(joint(j)), fb = b3Joint_GetLocalFrameB(joint(j));
    Observation previous = observe(a, b, fa, fb); float sum = 0, max_error = 0;
    for (int tick = 0; tick < warmup + samples; ++tick) {
        current_tick = tick; CHECK(air_b3_world_step(world, dt, SUBSTEPS) == AIR_B3_OK);
        Observation o; sample_constraints(world, a, b, j, fa, fb, frames, m, &o);
        float speed = wrap(o.angle - previous.angle) / dt; diagnostic_speed = speed; CHECK(isfinite(speed));
        if (tick >= warmup) {
            sum += speed; max_error = fmaxf(max_error, fabsf(speed - target));
            CHECK(fabsf(speed - target) <= speed_error_limit);
            if (expect_no_drive) CHECK(fabsf(b3RevoluteJoint_GetMotorTorque(joint(j))) <= 1e-6f);
        }
        previous = o;
    }
    float observed = sum / (float)samples;
    CHECK(fabsf(observed - target) <= speed_error_limit);
    fprintf(stderr, "{\"case\":\"%s\",\"status\":\"PASS\",\"warmupTicks\":%d,\"sampleTicks\":%d,\"targetRadiansPerSecond\":%.9g,\"measuredRadiansPerSecond\":%.9g,\"maxSampleError\":%.9g,\"maxAnchorMeters\":%.9g,\"maxAxisRadians\":%.9g,\"zeroDriveTorque\":%s}\n",
        current_case, warmup, samples, target, observed, max_error, m->position, m->axis, expect_no_drive ? "true" : "false");
    current_tick = -1; return observed;
}
static void motor_contract(void) {
    uint32_t world, a[2], b[2], j[2], c[7]; Metrics m = {0}; float speed = B3_PI / 2.0f;
    current_case = "motor_forward"; config(c, 0, 0, -.5f, .5f, 1, speed, 3);
    make_motor_fixture(&world, a, b, j, c);
    measure_speed(world, a, b, j, speed, SPEED_WARMUP, SPEED_SAMPLES, 0, &m);
    current_case = "motor_reverse"; config(c, 0, 0, -.5f, .5f, 1, -speed, 3); reconfigure(world, a, b, j, c);
    measure_speed(world, a, b, j, -speed, SPEED_WARMUP, SPEED_SAMPLES, 0, &m);
    current_case = "zero_torque_coast";
    /* Request the opposite direction but provide zero torque. Existing negative
       angular velocity must survive configure and continue, not be reset to zero. */
    config(c, 0, 0, -.5f, .5f, 1, speed, 0); reconfigure(world, a, b, j, c);
    CHECK(length(b3Body_GetAngularVelocity(body(b))) > 1);
    measure_speed(world, a, b, j, -speed, 0, SPEED_SAMPLES, 1, &m);
    current_case = "motor_off_coast";
    config(c, 0, 0, -.5f, .5f, 0, speed, 3); reconfigure(world, a, b, j, c);
    CHECK(length(b3Body_GetAngularVelocity(body(b))) > 1);
    measure_speed(world, a, b, j, -speed, 0, SPEED_SAMPLES, 1, &m);
    CHECK(air_b3_world_destroy(world) == AIR_B3_OK); check_no_owned_bytes();
}
static void limits_contract(void) {
    current_case = "native_limits";
    uint32_t world, a[2], b[2], j[2], c[7], s[36], frames[14]; Metrics m = {0};
    config(c, 0, 1, -.5f, .5f, 1, B3_PI / 2, 3); make_motor_fixture(&world, a, b, j, c);
    read_state(world, j, s); memcpy(frames, s + 6, sizeof(frames));
    b3Transform fa = b3Joint_GetLocalFrameA(joint(j)), fb = b3Joint_GetLocalFrameB(joint(j));
    float minimum = 0, maximum = 0, upper_last = 0, lower_last = 0;
    for (int tick = 0; tick < TICKS; ++tick) {
        current_tick = tick;
        if (tick == TICKS / 2) {
            config(c, 0, 1, -.5f, .5f, 1, -B3_PI / 2, 3); reconfigure(world, a, b, j, c);
        }
        CHECK(air_b3_world_step(world, dt, SUBSTEPS) == AIR_B3_OK);
        Observation o; sample_constraints(world, a, b, j, fa, fb, frames, &m, &o);
        minimum = fminf(minimum, o.angle); maximum = fmaxf(maximum, o.angle);
        CHECK(o.angle >= -.5f - limit_overshoot && o.angle <= .5f + limit_overshoot);
        if (tick == TICKS / 2 - 1) upper_last = o.angle;
        if (tick == TICKS - 1) lower_last = o.angle;
    }
    CHECK(upper_last >= .45f && lower_last <= -.45f);
    fprintf(stderr, "{\"case\":\"native_limits\",\"status\":\"PASS\",\"ticks\":%d,\"minimumRadians\":%.9g,\"maximumRadians\":%.9g,\"upperSettledRadians\":%.9g,\"lowerSettledRadians\":%.9g,\"maxOvershootRadians\":%.9g,\"maxAnchorMeters\":%.9g,\"maxAxisRadians\":%.9g}\n",
        TICKS, minimum, maximum, upper_last, lower_last, fmaxf(0, fmaxf(maximum - .5f, -.5f - minimum)), m.position, m.axis);
    CHECK(air_b3_world_destroy(world) == AIR_B3_OK); check_no_owned_bytes(); current_tick = -1;
}

/* These are byte snapshots, not a second implementation of the torque getter.
   In particular, no expected torque is computed from perpImpulse, motorImpulse
   or a cached solver axis. Copy the complete structs so a read cannot silently
   change a different warm-start or body-solver field. */
typedef struct PureReadGuard {
    unsigned char joint_sim[sizeof(b3JointSim)];
    unsigned char body_meta[2][sizeof(b3Body)];
    unsigned char body_sim[2][sizeof(b3BodySim)];
    unsigned char body_state[2][sizeof(b3BodyState)];
    uint32_t state_present[2], counts[6], bridge[6], core[2];
    float bodies[2][AIR_B3_BODY_SNAPSHOT_FLOATS], inv_h;
} PureReadGuard;
typedef struct TorqueMetrics {
    float max_oracle_error, max_known_error, max_momentum_error;
    int pure_reads;
} TorqueMetrics;

static PureReadGuard capture_pure_read(uint32_t world, const uint32_t a[2], const uint32_t b[2], const uint32_t j[2]) {
    PureReadGuard g = {0};
    b3World* w = b3GetWorldFromId(b3LoadWorldId(world));
    const b3JointSim* sim = b3GetJointSimCheckType(joint(j), b3_revoluteJoint);
    memcpy(g.joint_sim, sim, sizeof(*sim)); g.inv_h = w->inv_h;
    const uint32_t* ids[2] = {a, b};
    for (int i = 0; i < 2; ++i) {
        b3Body* native_body = b3GetBodyFullId(w, body(ids[i]));
        const b3BodySim* body_sim = b3GetBodySim(w, native_body);
        const b3BodyState* state = b3GetBodyState(w, native_body);
        memcpy(g.body_meta[i], native_body, sizeof(*native_body));
        memcpy(g.body_sim[i], body_sim, sizeof(*body_sim));
        g.state_present[i] = state != NULL;
        if (state) memcpy(g.body_state[i], state, sizeof(*state));
        CHECK(air_b3_body_snapshot(ids[i][0], ids[i][1], g.bodies[i]) == AIR_B3_OK);
    }
    CHECK(air_b3_world_counts(world, g.counts) == AIR_B3_OK);
    CHECK(air_b3_bridge_memory(0, g.bridge) == AIR_B3_OK); air_b3_live_bytes(g.core);
    return g;
}
static void read_state_pure(uint32_t world, const uint32_t a[2], const uint32_t b[2], const uint32_t j[2],
    uint32_t s[AIR_B3_HINGE_STATE_WORDS], TorqueMetrics* metrics) {
    PureReadGuard before = capture_pure_read(world, a, b, j);
    uint32_t first[AIR_B3_HINGE_STATE_WORDS];
    for (int i = 0; i < PURE_READS_PER_TICK; ++i) {
        read_state(world, j, s);
        PureReadGuard after = capture_pure_read(world, a, b, j);
        CHECK(memcmp(&before, &after, sizeof(before)) == 0);
        if (i == 0) memcpy(first, s, sizeof(first));
        else CHECK(memcmp(first, s, sizeof(first)) == 0);
        ++metrics->pure_reads;
    }
}
static void check_control_mass(const uint32_t id[2]) {
    b3MassData mass = b3Body_GetMassData(body(id));
    CHECK(fabsf(mass.mass - 1.0f) <= 1e-6f && length(mass.center) <= 1e-7f);
    CHECK(fabsf(mass.inertia.cx.x - control_inertia) <= 1e-6f);
    CHECK(fabsf(mass.inertia.cy.y - control_inertia) <= 1e-6f);
    CHECK(fabsf(mass.inertia.cz.z - control_inertia) <= 1e-6f);
    CHECK(fabsf(mass.inertia.cx.y) + fabsf(mass.inertia.cx.z) + fabsf(mass.inertia.cy.x)
        + fabsf(mass.inertia.cy.z) + fabsf(mass.inertia.cz.x) + fabsf(mass.inertia.cz.y) <= 1e-7f);
}
static void make_torque_fixture(uint32_t* world, uint32_t a[2], uint32_t b[2], uint32_t j[2],
    int two_dynamic, const uint32_t c[7]) {
    *world = air_b3_world_create(0, 0, 0); CHECK(*world);
    make_body(*world, b3_dynamicBody, b3Vec3_zero, b3Quat_identity, b3Vec3_zero, b3Vec3_zero, a);
    make_body(*world, two_dynamic ? b3_dynamicBody : b3_staticBody,
        b3Vec3_zero, b3Quat_identity, b3Vec3_zero, b3Vec3_zero, b);
    /* Half extents .25 m, density 8 kg/m^3: mass 1 kg and isotropic I=1/24 kg m^2. */
    add_box(a, .25f, .25f, .25f, 8); check_control_mass(a);
    if (two_dynamic) { add_box(b, .25f, .25f, .25f, 8); check_control_mass(b); }
    const float geometry[9] = {0, 0, 0, 0, 0, 0, 0, 0, 3};
    create_hinge(*world, a, b, geometry, 0, c, j);
    b3Transform fa = b3Joint_GetLocalFrameA(joint(j)), fb = b3Joint_GetLocalFrameB(joint(j));
    CHECK(length(fa.p) == 0 && length(fb.p) == 0);
    CHECK(length(b3Body_GetLocalCenter(body(a))) == 0);
    if (two_dynamic) CHECK(length(b3Body_GetLocalCenter(body(b))) == 0);
}
static b3Vec3 reported_torque(const uint32_t s[AIR_B3_HINGE_STATE_WORDS]) {
    return (b3Vec3){wf(s + 31), wf(s + 32), wf(s + 33)};
}
static void torque_oracle(b3Vec3 reported, b3Vec3 independent, TorqueMetrics* metrics) {
    float error = length(b3Sub(reported, independent));
    CHECK(isfinite(error)); metrics->max_oracle_error = fmaxf(metrics->max_oracle_error, error);
    if (error > torque_oracle_limit) {
        fprintf(stderr, "{\"case\":\"%s\",\"tick\":%d,\"reportedOnBTorque\":[%.9g,%.9g,%.9g],\"angularMomentumOracleOnBTorque\":[%.9g,%.9g,%.9g],\"torqueErrorNewtonMeters\":%.9g,\"torqueErrorLimit\":%.9g}\n",
            current_case, current_tick, reported.x, reported.y, reported.z,
            independent.x, independent.y, independent.z, error, torque_oracle_limit);
    }
    CHECK(error <= torque_oracle_limit);
}
static void torque_known_value(b3Vec3 reported, b3Vec3 known, TorqueMetrics* metrics) {
    float error = length(b3Sub(reported, known));
    CHECK(isfinite(error)); metrics->max_known_error = fmaxf(metrics->max_known_error, error);
    CHECK(error <= torque_oracle_limit);
}
static TorqueMetrics torque_control(int mode) {
    const char* names[] = {"torque_static_b_motor", "torque_perpendicular_external", "torque_limit_motor_cancel", "torque_two_dynamic_impulse"};
    current_case = names[mode];
    uint32_t world, a[2], b[2], j[2], c[7], s[AIR_B3_HINGE_STATE_WORDS]; TorqueMetrics m = {0};
    /* Static B / dynamic A: negative native speed produces positive dL_A,
       hence the equal-and-opposite reported on-B torque is -0.125 * axisZ. */
    config(c, 0, mode == 2, mode == 2 ? 0 : -.5f, mode == 2 ? 0 : .5f,
        mode != 1, mode == 0 ? -10.0f : 10.0f, control_motor_cap);
    make_torque_fixture(&world, a, b, j, mode == 3, c);
    read_state_pure(world, a, b, j, s, &m);
    CHECK(length(reported_torque(s)) == 0 && wf(s + 27) == 0);
    /* Pre-step zeros mean an empty impulse cache, not a measured current load.
       All dimensional comparisons below are immediately after an active step,
       with no intervening configure, sleep transition or other world's step. */
    const b3Vec3 external_a = mode == 1 ? (b3Vec3){.06f, -.08f, 0} : b3Vec3_zero;
    const b3Vec3 known_impulse = {0, 0, .02f};
    if (mode == 3) {
        b3Vec3 before_a = b3Body_GetAngularVelocity(body(a)), before_b = b3Body_GetAngularVelocity(body(b));
        b3Body_ApplyAngularImpulse(body(a), known_impulse, true);
        b3Vec3 actual_impulse = b3MulSV(control_inertia, b3Sub(b3Body_GetAngularVelocity(body(a)), before_a));
        CHECK(length(b3Sub(actual_impulse, known_impulse)) <= momentum_oracle_limit);
        CHECK(length(b3Sub(b3Body_GetAngularVelocity(body(b)), before_b)) == 0);
    }
    b3Vec3 last_reported = b3Vec3_zero, last_oracle = b3Vec3_zero;
    float last_motor = 0, minimum_motor_magnitude = FLT_MAX, max_settled_total = 0;
    for (int tick = 0; tick < TORQUE_TICKS; ++tick) {
        current_tick = tick;
        b3Vec3 before_a = b3Body_GetAngularVelocity(body(a)), before_b = b3Body_GetAngularVelocity(body(b));
        if (mode == 1) b3Body_ApplyTorque(body(a), external_a, true);
        CHECK(air_b3_world_step(world, dt, TORQUE_SUBSTEPS) == AIR_B3_OK);
        /* At this fresh active-step boundary, the current impulse cache is the
           final substep's accumulated impulse, scaled by the world's inv_h.
           Exactly one substep makes h=dt, so the momentum delta has the same
           interval. This is not a claim about stale/sleeping/reconfigured data. */
        CHECK(fabsf(b3GetWorldFromId(b3LoadWorldId(world))->inv_h * dt - 1.0f) <= 1e-6f);
        b3Vec3 after_a = b3Body_GetAngularVelocity(body(a)), after_b = b3Body_GetAngularVelocity(body(b));
        read_state_pure(world, a, b, j, s, &m);
        last_reported = reported_torque(s); last_motor = wf(s + 27);
        /* L=I*omega is exact for the checked isotropic cube. Both pivots are
           COMs, so no r cross F contaminates this pure angular-couple oracle.
           dL_A/dt = external_A - tau_on_B. No production cache formula is used. */
        last_oracle = b3Sub(external_a, b3MulSV(control_inertia / dt, b3Sub(after_a, before_a)));
        torque_oracle(last_reported, last_oracle, &m);
        CHECK(length(b3Body_GetLinearVelocity(body(a))) <= 1e-6f);
        CHECK(length(b3Body_GetLinearVelocity(body(b))) <= 1e-6f);
        CHECK(length(b3SubPos(b3Body_GetPosition(body(a)), (b3Pos){0, 0, 0})) <= 1e-6f);
        CHECK(length(b3SubPos(b3Body_GetPosition(body(b)), (b3Pos){0, 0, 0})) <= 1e-6f);
        if (mode == 0) {
            torque_known_value(last_reported, (b3Vec3){0, 0, -control_motor_cap}, &m);
            CHECK(fabsf(last_motor + control_motor_cap) <= torque_oracle_limit);
            CHECK(after_a.z > before_a.z && length(after_b) == 0);
        } else if (mode == 1) {
            CHECK(fabsf(last_motor) <= 1e-7f);
            /* Initial soft-constraint correction is not falsely equated with
               the external torque; the independent momentum oracle runs on
               every tick and the known steady value only after 30 ticks. */
            if (tick >= 30) torque_known_value(last_reported, external_a, &m);
        } else if (mode == 2) {
            minimum_motor_magnitude = fminf(minimum_motor_magnitude, fabsf(last_motor));
            CHECK(fabsf(last_motor - control_motor_cap) <= torque_oracle_limit);
            if (tick >= 30) {
                torque_known_value(last_reported, b3Vec3_zero, &m);
                max_settled_total = fmaxf(max_settled_total, length(last_reported));
            }
        } else {
            b3Vec3 oracle_b = b3MulSV(control_inertia / dt, b3Sub(after_b, before_b));
            torque_oracle(last_reported, oracle_b, &m);
            torque_known_value(last_reported, (b3Vec3){0, 0, control_motor_cap}, &m);
            CHECK(fabsf(last_motor - control_motor_cap) <= torque_oracle_limit);
            CHECK(after_a.z < before_a.z && after_b.z > before_b.z);
            b3Vec3 total_momentum = b3MulSV(control_inertia, b3Add(after_a, after_b));
            float momentum_error = length(b3Sub(total_momentum, known_impulse));
            CHECK(isfinite(momentum_error)); m.max_momentum_error = fmaxf(m.max_momentum_error, momentum_error);
            CHECK(momentum_error <= momentum_oracle_limit);
        }
    }
    if (mode == 2) CHECK(minimum_motor_magnitude >= control_motor_cap - torque_oracle_limit);
    fprintf(stderr, "{\"case\":\"%s\",\"status\":\"PASS\",\"ticks\":%d,\"substeps\":%d,\"massKg\":1,\"inertiaKgM2\":%.9g,\"motorCapNewtonMeters\":%.9g,\"lastReportedOnBTorque\":[%.9g,%.9g,%.9g],\"lastMomentumOracleOnBTorque\":[%.9g,%.9g,%.9g],\"lastMotorTorque\":%.9g,\"maxTorqueOracleError\":%.9g,\"maxKnownValueError\":%.9g,\"maxAngularMomentumError\":%.9g,\"maxSettledNetTorque\":%.9g,\"pureStateReads\":%d,\"wholeSolverBodyStateUnchanged\":true}\n",
        current_case, TORQUE_TICKS, TORQUE_SUBSTEPS, control_inertia, control_motor_cap,
        last_reported.x, last_reported.y, last_reported.z, last_oracle.x, last_oracle.y, last_oracle.z,
        last_motor, m.max_oracle_error, m.max_known_error, m.max_momentum_error, max_settled_total, m.pure_reads);
    CHECK(air_b3_world_destroy(world) == AIR_B3_OK); check_no_owned_bytes(); current_tick = -1;
    return m;
}
static TorqueMetrics torque_contract(void) {
    TorqueMetrics total = {0};
    fprintf(stderr, "{\"case\":\"torque_thresholds\",\"torqueErrorNewtonMeters\":%.9g,\"momentumErrorKgM2PerSecond\":%.9g,\"ticksPerControl\":%d,\"substeps\":%d,\"substepMatchesMomentumWindow\":true}\n",
        torque_oracle_limit, momentum_oracle_limit, TORQUE_TICKS, TORQUE_SUBSTEPS);
    for (int mode = 0; mode < 4; ++mode) {
        TorqueMetrics m = torque_control(mode);
        total.max_oracle_error = fmaxf(total.max_oracle_error, m.max_oracle_error);
        total.max_known_error = fmaxf(total.max_known_error, m.max_known_error);
        total.max_momentum_error = fmaxf(total.max_momentum_error, m.max_momentum_error);
        total.pure_reads += m.pure_reads;
    }
    CHECK(total.pure_reads == 4 * (TORQUE_TICKS + 1) * PURE_READS_PER_TICK);
    return total;
}

static void lifecycle_contract(void) {
    current_case = "lifecycle";
    for (int mode = 0; mode < 3; ++mode) {
        uint32_t world, a[2], b[2], j[2], c[7], counts[6], out[CANARY_WORDS];
        config(c, 0, 0, -.5f, .5f, 1, 1, 3); make_motor_fixture(&world, a, b, j, c);
        CHECK(air_b3_world_step(world, dt, SUBSTEPS) == AIR_B3_OK);
        if (mode == 0) {
            CHECK(air_b3_joint_destroy(world, j[0], j[1]) == AIR_B3_OK);
            CHECK(b3Body_GetJointCount(body(a)) == 0 && b3Body_GetJointCount(body(b)) == 0);
            CHECK(air_b3_world_counts(world, counts) == AIR_B3_OK && counts[3] == 0);
            CHECK(air_b3_body_destroy(a[0], a[1]) == AIR_B3_OK);
            CHECK(air_b3_body_destroy(b[0], b[1]) == AIR_B3_OK);
            CHECK(air_b3_world_counts(world, counts) == AIR_B3_OK && counts[0] == 0 && counts[2] == 0);
        } else if (mode == 1) {
            CHECK(air_b3_body_destroy(b[0], b[1]) == AIR_B3_OK);
            CHECK(b3Body_GetJointCount(body(a)) == 0);
            CHECK(air_b3_world_counts(world, counts) == AIR_B3_OK && counts[0] == 1 && counts[3] == 0);
        }
        if (mode < 2) {
            CHECK(!b3Joint_IsValid(joint(j))); fill_canary(out);
            CHECK(air_b3_hinge_state(world, j[0], j[1], out + 1, 36) == AIR_B3_INVALID);
            CHECK(air_b3_hinge_configure(world, j[0], j[1], c, 7) == AIR_B3_INVALID);
            CHECK(air_b3_joint_destroy(world, j[0], j[1]) == AIR_B3_INVALID); check_canary(out);
        }
        CHECK(air_b3_world_destroy(world) == AIR_B3_OK);
        CHECK(!b3Joint_IsValid(joint(j)) && !b3Body_IsValid(body(a)) && !b3Body_IsValid(body(b)));
        fill_canary(out);
        CHECK(air_b3_hinge_state(world, j[0], j[1], out + 1, 36) == AIR_B3_INVALID);
        CHECK(air_b3_hinge_configure(world, j[0], j[1], c, 7) == AIR_B3_INVALID);
        CHECK(air_b3_joint_destroy(world, j[0], j[1]) == AIR_B3_INVALID); check_canary(out); check_no_owned_bytes();
    }
    fprintf(stderr, "{\"case\":\"lifecycle\",\"status\":\"PASS\",\"jointBodyWorldDestroyPaths\":3,\"allOwnedBytesReleased\":true}\n");
}
int main(void) {
    CHECK(strcmp(air_b3_core_sha(), "efca0c184d40fd6a82016983f1601c4d23965867") == 0);
    check_no_owned_bytes();
    fprintf(stderr, "{\"case\":\"thresholds\",\"ticks\":%d,\"substeps\":%d,\"positionLimitMeters\":%.9g,\"axisLimitRadians\":%.9g,\"limitOvershootRadians\":%.9g,\"motorSpeedErrorRadiansPerSecond\":%.9g}\n",
        TICKS, SUBSTEPS, position_limit, axis_limit, limit_overshoot, speed_error_limit);
    validation_contract(); geometry_contract();
    Metrics anchored = dynamics_contract(1), moving = dynamics_contract(0);
    motor_contract(); limits_contract(); TorqueMetrics torque = torque_contract();
    lifecycle_contract(); check_no_owned_bytes();
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"coreSha\":\"%s\",\"nativeRevolute\":true,\"rejectionChecks\":%d,\"geometryChecks\":%d,\"fullGenerationWorldOwnership\":true,\"independentQuaternionMotorAndLimitOracles\":true,\"configurePreservesFramesAndPoses\":true,\"anchoredMaxAnchorMeters\":%.9g,\"anchoredMaxAxisRadians\":%.9g,\"twoDynamicMaxAnchorMeters\":%.9g,\"twoDynamicMaxAxisRadians\":%.9g,\"independentAngularMomentumTorqueControls\":4,\"maxTorqueOracleError\":%.9g,\"maxTorqueKnownValueError\":%.9g,\"maxAngularMomentumError\":%.9g,\"pureStateReads\":%d,\"wholeSolverBodyStateUnchanged\":true,\"finalCoreBytes\":0,\"finalBridgeBytes\":0}\n",
        sizeof(void*), air_b3_core_sha(), rejection_checks, geometry_checks, anchored.position, anchored.axis, moving.position, moving.axis,
        torque.max_oracle_error, torque.max_known_error, torque.max_momentum_error, torque.pure_reads);
    return 0;
}
