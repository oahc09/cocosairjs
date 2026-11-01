/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Real pinned-core Fixed/weld qualification. Host results are not WASM evidence.
   No body transform is assigned after creation. The private world header is used
   only to exercise the existing locked-world rejection, never to drive physics. */
#include "air_box3d.h"
#include "physics_world.h"
#include <box3d/box3d.h>
#include <float.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(x) do { if (!(x)) { fprintf(stderr, "FAIL %s:%d %s\n", __FILE__, __LINE__, #x); exit(1); } } while (0)

enum { CANARY_WORDS = 40, TICKS = 600, SUBSTEPS = 4 };
static const uint32_t canary_word = UINT32_C(0x5a7e3c19);
static const float time_step = 1.0f / 60.0f;
static const float position_limit = 0.02f;
static const float angular_limit = 0.02f; /* Radians, approximately 1.15 degrees. */
static int rejection_checks;

typedef struct Fixture {
    uint32_t world, other;
    uint32_t a[2], b[2], foreign[2], joint[2];
} Fixture;

typedef struct Guard {
    uint32_t counts[2][6], bridge[6], core[2], state[AIR_B3_FIXED_STATE_WORDS];
    float bodies[3][AIR_B3_BODY_SNAPSHOT_FLOATS];
} Guard;

typedef struct Drift {
    float position, angle, force, torque, travel, rotation;
} Drift;

typedef struct Threshold {
    float low_peak, high_peak;
    uint32_t event_lo, event_hi;
    int low_ticks, high_ticks, repeated_events;
} Threshold;

static uint64_t id_value(const uint32_t id[2]) {
    return ((uint64_t)id[1] << 32) | id[0];
}

static b3BodyId body_id(const uint32_t id[2]) {
    return b3LoadBodyId(id_value(id));
}

static b3JointId joint_id(const uint32_t id[2]) {
    return b3LoadJointId(id_value(id));
}

static float word_float(const uint32_t* word) {
    float value;
    memcpy(&value, word, sizeof(value));
    return value;
}

static float length(b3Vec3 value) {
    return sqrtf(b3Dot(value, value));
}

static float angle_between(b3Quat a, b3Quat b) {
    b3Quat delta = b3InvMulQuat(a, b);
    return 2.0f * atan2f(length(delta.v), fabsf(delta.s));
}

static void fill_canary(uint32_t out[CANARY_WORDS]) {
    for (int i = 0; i < CANARY_WORDS; ++i) out[i] = canary_word;
}

static void check_canary(const uint32_t out[CANARY_WORDS]) {
    for (int i = 0; i < CANARY_WORDS; ++i) CHECK(out[i] == canary_word);
}

static void check_tail(const uint32_t out[CANARY_WORDS], int written) {
    CHECK(out[0] == canary_word);
    for (int i = written + 1; i < CANARY_WORDS; ++i) CHECK(out[i] == canary_word);
}

static Guard capture_guard(const Fixture* f) {
    Guard guard = {0};
    CHECK(air_b3_world_counts(f->world, guard.counts[0]) == AIR_B3_OK);
    CHECK(air_b3_world_counts(f->other, guard.counts[1]) == AIR_B3_OK);
    CHECK(air_b3_bridge_memory(0, guard.bridge) == AIR_B3_OK);
    air_b3_live_bytes(guard.core);
    CHECK(air_b3_body_snapshot(f->a[0], f->a[1], guard.bodies[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(f->b[0], f->b[1], guard.bodies[1]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(f->foreign[0], f->foreign[1], guard.bodies[2]) == AIR_B3_OK);
    if (b3Joint_IsValid(joint_id(f->joint))) {
        CHECK(air_b3_fixed_state(f->world, f->joint[0], f->joint[1], guard.state,
            AIR_B3_FIXED_STATE_WORDS) == AIR_B3_OK);
    }
    return guard;
}

static void check_guard(const Fixture* f, const Guard* before) {
    Guard after = capture_guard(f);
    CHECK(memcmp(before, &after, sizeof(after)) == 0);
}

/* Every rejected request preserves the full output envelope, both worlds' counts,
   core/bridge allocation counts and bytes, all bodies, and the existing joint. */
#define REJECT(expected, call) do { \
    Guard before = capture_guard(&f); \
    fill_canary(out); \
    CHECK((call) == (expected)); \
    check_canary(out); \
    check_guard(&f, &before); \
    ++rejection_checks; \
} while (0)

static void make_body(uint32_t world, int type, b3Vec3 position, b3Quat rotation,
    b3Vec3 velocity, b3Vec3 angular, uint32_t out[2]) {
    float input[AIR_B3_BODY_INPUT_FLOATS] = {
        position.x, position.y, position.z, rotation.v.x, rotation.v.y, rotation.v.z, rotation.s,
        velocity.x, velocity.y, velocity.z, angular.x, angular.y, angular.z, 0, 0, 1
    };
    CHECK(air_b3_body_create(world, type, input, 0, out) == AIR_B3_OK);
}

static void add_box(const uint32_t body[2], float x, float y, float z, float density) {
    uint32_t shape[2];
    CHECK(air_b3_shape_box(body[0], body[1], x, y, z, density, shape) == AIR_B3_OK);
}

static void read_state(uint32_t world, const uint32_t id[2], uint32_t out[AIR_B3_FIXED_STATE_WORDS]) {
    CHECK(air_b3_fixed_state(world, id[0], id[1], out, AIR_B3_FIXED_STATE_WORDS) == AIR_B3_OK);
}

static void compare_frame(const uint32_t* words, b3Transform frame) {
    const float expected[7] = {
        frame.p.x, frame.p.y, frame.p.z, frame.q.v.x, frame.q.v.y, frame.q.v.z, frame.q.s
    };
    for (int i = 0; i < 7; ++i) CHECK(fabsf(word_float(words + i) - expected[i]) <= 1e-6f);
}

static void create_fixed(uint32_t world, const uint32_t a[2], const uint32_t b[2],
    float force, float torque, uint32_t joint[2]) {
    float before[2][AIR_B3_BODY_SNAPSHOT_FLOATS], after[2][AIR_B3_BODY_SNAPSHOT_FLOATS];
    uint32_t counts_before[6], counts_after[6], state[AIR_B3_FIXED_STATE_WORDS];
    CHECK(air_b3_body_snapshot(a[0], a[1], before[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], before[1]) == AIR_B3_OK);
    CHECK(air_b3_world_counts(world, counts_before) == AIR_B3_OK);
    b3WorldTransform ta = b3Body_GetTransform(body_id(a));
    b3WorldTransform tb = b3Body_GetTransform(body_id(b));
    CHECK(air_b3_fixed_create(world, a[0], a[1], b[0], b[1], 0, force, torque, joint) == AIR_B3_OK);
    CHECK(b3Joint_IsValid(joint_id(joint)));
    CHECK(b3Joint_GetType(joint_id(joint)) == b3_weldJoint);
    CHECK(b3WeldJoint_GetLinearHertz(joint_id(joint)) == 0);
    CHECK(b3WeldJoint_GetAngularHertz(joint_id(joint)) == 0);
    CHECK(air_b3_body_snapshot(a[0], a[1], after[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], after[1]) == AIR_B3_OK);
    CHECK(memcmp(before, after, sizeof(before)) == 0); /* Not even an immediate teleport. */
    CHECK(air_b3_world_counts(world, counts_after) == AIR_B3_OK);
    CHECK(counts_after[0] == counts_before[0] && counts_after[1] == counts_before[1]);
    CHECK(counts_after[2] == counts_before[2] && counts_after[3] == counts_before[3] + 1);
    read_state(world, joint, state);
    CHECK(state[0] == 1 && state[1] == a[0] && state[2] == a[1]);
    CHECK(state[3] == b[0] && state[4] == b[1] && state[5] == 0);
    b3Pos ca = b3Body_GetWorldCenter(body_id(a)), cb = b3Body_GetWorldCenter(body_id(b));
    int da = b3Body_GetType(body_id(a)) == b3_dynamicBody, db = b3Body_GetType(body_id(b)) == b3_dynamicBody;
    b3Pos center = da != db ? (da ? ca : cb) : (b3Pos){(ca.x + cb.x) * 0.5, (ca.y + cb.y) * 0.5, (ca.z + cb.z) * 0.5};
    b3WorldTransform common = {center, ta.q};
    compare_frame(state + 6, b3InvMulWorldTransforms(ta, common));
    compare_frame(state + 13, b3InvMulWorldTransforms(tb, common));
    CHECK(fabsf(word_float(state + 28)) < 1e-5f && fabsf(word_float(state + 29)) < 1e-5f);
    CHECK(word_float(state + 20) == force && word_float(state + 21) == torque);
}

static void configure_without_reset(uint32_t world, const uint32_t a[2], const uint32_t b[2],
    const uint32_t joint[2], int collide, float force, float torque) {
    uint32_t before[AIR_B3_FIXED_STATE_WORDS], after[AIR_B3_FIXED_STATE_WORDS];
    float bodies_before[2][AIR_B3_BODY_SNAPSHOT_FLOATS], bodies_after[2][AIR_B3_BODY_SNAPSHOT_FLOATS];
    read_state(world, joint, before);
    CHECK(air_b3_body_snapshot(a[0], a[1], bodies_before[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], bodies_before[1]) == AIR_B3_OK);
    CHECK(air_b3_fixed_configure(world, joint[0], joint[1], collide, force, torque) == AIR_B3_OK);
    read_state(world, joint, after);
    CHECK(memcmp(before, after, 5 * sizeof(uint32_t)) == 0);
    CHECK(memcmp(before + 6, after + 6, 14 * sizeof(uint32_t)) == 0);
    CHECK(memcmp(before + 22, after + 22, 8 * sizeof(uint32_t)) == 0);
    CHECK(after[5] == (uint32_t)collide);
    CHECK(word_float(after + 20) == force && word_float(after + 21) == torque);
    CHECK(air_b3_body_snapshot(a[0], a[1], bodies_after[0]) == AIR_B3_OK);
    CHECK(air_b3_body_snapshot(b[0], b[1], bodies_after[1]) == AIR_B3_OK);
    CHECK(memcmp(bodies_before, bodies_after, sizeof(bodies_before)) == 0);
}

static void validation_contract(void) {
    Fixture f = {0};
    uint32_t out[CANARY_WORDS];
    f.world = air_b3_world_create(0, 0, 0);
    f.other = air_b3_world_create(0, 0, 0);
    CHECK(f.world && f.other && f.world != f.other);
    make_body(f.world, b3_staticBody, (b3Vec3){-1, 2, 0.5f},
        b3MakeQuatFromAxisAngle((b3Vec3){0, 0, 1}, 0.37f), b3Vec3_zero, b3Vec3_zero, f.a);
    make_body(f.world, b3_dynamicBody, (b3Vec3){1.5f, 1, -0.75f},
        b3MakeQuatFromAxisAngle((b3Vec3){0, 1, 0}, -0.61f), b3Vec3_zero, b3Vec3_zero, f.b);
    make_body(f.other, b3_dynamicBody, (b3Vec3){3, 2, 1},
        b3Quat_identity, b3Vec3_zero, b3Vec3_zero, f.foreign);
    add_box(f.b, 0.4f, 0.3f, 0.2f, 2);
    add_box(f.foreign, 0.4f, 0.3f, 0.2f, 2);

    uint32_t stale_body[2], replacement[2];
    make_body(f.world, b3_dynamicBody, b3Vec3_zero, b3Quat_identity,
        b3Vec3_zero, b3Vec3_zero, stale_body);
    CHECK(air_b3_body_destroy(stale_body[0], stale_body[1]) == AIR_B3_OK);
    make_body(f.world, b3_dynamicBody, b3Vec3_zero, b3Quat_identity,
        b3Vec3_zero, b3Vec3_zero, replacement);
    CHECK(stale_body[1] == replacement[1] && stale_body[0] != replacement[0]);

    REJECT(AIR_B3_INVALID, air_b3_fixed_create(0, f.a[0], f.a[1], f.b[0], f.b[1], 0, 1, 1, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_fixed_create(f.world ^ 1u, f.a[0], f.a[1], f.b[0], f.b[1], 0, 1, 1, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_fixed_create(f.other, f.a[0], f.a[1], f.b[0], f.b[1], 0, 1, 1, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_fixed_create(f.world, f.a[0], f.a[1],
        f.foreign[0], f.foreign[1], 0, 1, 1, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_fixed_create(f.world, f.a[0] ^ 1u, f.a[1], f.b[0], f.b[1], 0, 1, 1, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_fixed_create(f.world, f.a[0], f.a[1], f.b[0], UINT32_MAX, 0, 1, 1, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_fixed_create(f.world, stale_body[0], stale_body[1],
        f.b[0], f.b[1], 0, 1, 1, out + 1));
    REJECT(AIR_B3_INVALID, air_b3_fixed_create(f.world, 0, 0, f.b[0], f.b[1], 0, 1, 1, out + 1));
    REJECT(AIR_B3_ARGUMENT, air_b3_fixed_create(f.world, f.a[0], f.a[1], f.a[0], f.a[1], 0, 1, 1, out + 1));
    REJECT(AIR_B3_ARGUMENT, air_b3_fixed_create(f.world, f.a[0], f.a[1], f.b[0], f.b[1], 2, 1, 1, out + 1));
    REJECT(AIR_B3_ARGUMENT, air_b3_fixed_create(f.world, f.a[0], f.a[1], f.b[0], f.b[1], 0, 1, 1, NULL));
    REJECT(AIR_B3_ARGUMENT, air_b3_fixed_create(f.world, f.a[0], f.a[1], f.b[0], f.b[1], 0, 1, 1,
        (uint32_t*)((unsigned char*)out + 1)));
    const float bad_thresholds[] = {-1, NAN, INFINITY, -INFINITY};
    for (size_t i = 0; i < sizeof(bad_thresholds) / sizeof(bad_thresholds[0]); ++i) {
        REJECT(AIR_B3_ARGUMENT, air_b3_fixed_create(f.world, f.a[0], f.a[1], f.b[0], f.b[1],
            0, bad_thresholds[i], 1, out + 1));
        REJECT(AIR_B3_ARGUMENT, air_b3_fixed_create(f.world, f.a[0], f.a[1], f.b[0], f.b[1],
            0, 1, bad_thresholds[i], out + 1));
    }

    create_fixed(f.world, f.a, f.b, FLT_MAX, FLT_MAX, f.joint);
    fill_canary(out);
    CHECK(air_b3_fixed_state(f.world, f.joint[0], f.joint[1], out + 1, AIR_B3_FIXED_STATE_WORDS) == AIR_B3_OK);
    check_tail(out, AIR_B3_FIXED_STATE_WORDS);
    for (int capacity = 0; capacity < AIR_B3_FIXED_STATE_WORDS; ++capacity) {
        REJECT(AIR_B3_CAPACITY, air_b3_fixed_state(f.world, f.joint[0], f.joint[1], out + 1, capacity));
    }
    REJECT(AIR_B3_ARGUMENT, air_b3_fixed_state(f.world, f.joint[0], f.joint[1], out + 1, -1));
    REJECT(AIR_B3_ARGUMENT, air_b3_fixed_state(f.world, f.joint[0], f.joint[1], NULL, AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_ARGUMENT, air_b3_fixed_state(f.world, f.joint[0], f.joint[1],
        (uint32_t*)((unsigned char*)out + 1), AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_INVALID, air_b3_fixed_state(f.other, f.joint[0], f.joint[1], out + 1, AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_INVALID, air_b3_fixed_state(f.world ^ 1u, f.joint[0], f.joint[1], out + 1, AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_INVALID, air_b3_fixed_state(f.world, f.joint[0] ^ 1u, f.joint[1], out + 1, AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_INVALID, air_b3_fixed_state(f.world, f.joint[0], UINT32_MAX, out + 1, AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_INVALID, air_b3_fixed_state(f.world, 0, 0, out + 1, AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_ARGUMENT, air_b3_fixed_configure(f.world, f.joint[0], f.joint[1], -1, 1, 1));
    for (size_t i = 0; i < sizeof(bad_thresholds) / sizeof(bad_thresholds[0]); ++i) {
        REJECT(AIR_B3_ARGUMENT, air_b3_fixed_configure(f.world, f.joint[0], f.joint[1], 0, bad_thresholds[i], 1));
        REJECT(AIR_B3_ARGUMENT, air_b3_fixed_configure(f.world, f.joint[0], f.joint[1], 0, 1, bad_thresholds[i]));
    }
    REJECT(AIR_B3_INVALID, air_b3_fixed_configure(f.other, f.joint[0], f.joint[1], 0, 1, 1));
    REJECT(AIR_B3_INVALID, air_b3_fixed_configure(f.world, f.joint[0] ^ 1u, f.joint[1], 0, 1, 1));
    REJECT(AIR_B3_INVALID, air_b3_joint_destroy(f.other, f.joint[0], f.joint[1]));
    REJECT(AIR_B3_INVALID, air_b3_joint_destroy(f.world, f.joint[0] ^ 1u, f.joint[1]));
    REJECT(AIR_B3_INVALID, air_b3_joint_destroy(f.world, 0, 0));
    REJECT(AIR_B3_INVALID, air_b3_joint_event_size(f.world ^ 1u, out + 1));
    REJECT(AIR_B3_ARGUMENT, air_b3_joint_event_size(f.world, NULL));
    REJECT(AIR_B3_ARGUMENT, air_b3_joint_event_size(f.world, (uint32_t*)((unsigned char*)out + 1)));
    REJECT(AIR_B3_INVALID, air_b3_joint_events(f.world ^ 1u, out + 1, CANARY_WORDS - 1));
    REJECT(AIR_B3_ARGUMENT, air_b3_joint_events(f.world, out + 1, -1));
    REJECT(AIR_B3_ARGUMENT, air_b3_joint_events(f.world, NULL, 1));
    REJECT(AIR_B3_ARGUMENT, air_b3_joint_events(f.world, (uint32_t*)((unsigned char*)out + 1), 1));
    REJECT(AIR_B3_CAPACITY, air_b3_joint_events(f.world, out + 1, 0));
    fill_canary(out);
    CHECK(air_b3_joint_event_size(f.world, out + 1) == AIR_B3_OK && out[1] == 1);
    check_tail(out, 1);
    CHECK(air_b3_joint_events(f.world, out + 1, 1) == AIR_B3_OK && out[1] == 0);
    check_tail(out, 1);

    Guard before_lock = capture_guard(&f);
    fill_canary(out);
    b3World* internal = b3GetWorldFromId(b3LoadWorldId(f.world));
    internal->locked = true;
    CHECK(air_b3_fixed_create(f.world, f.a[0], f.a[1], f.b[0], f.b[1], 0, 1, 1, out + 1) == AIR_B3_LOCKED);
    CHECK(air_b3_fixed_configure(f.world, f.joint[0], f.joint[1], 1, 1, 1) == AIR_B3_LOCKED);
    CHECK(air_b3_fixed_state(f.world, f.joint[0], f.joint[1], out + 1, AIR_B3_FIXED_STATE_WORDS) == AIR_B3_LOCKED);
    CHECK(air_b3_joint_destroy(f.world, f.joint[0], f.joint[1]) == AIR_B3_LOCKED);
    CHECK(air_b3_joint_event_size(f.world, out + 1) == AIR_B3_LOCKED);
    CHECK(air_b3_joint_events(f.world, out + 1, CANARY_WORDS - 1) == AIR_B3_LOCKED);
    internal->locked = false;
    check_canary(out);
    check_guard(&f, &before_lock);
    rejection_checks += 6;

    configure_without_reset(f.world, f.a, f.b, f.joint, 1, 0, 0);
    configure_without_reset(f.world, f.a, f.b, f.joint, 0, FLT_MAX, FLT_MAX);
    uint32_t old_joint[2] = {f.joint[0], f.joint[1]};
    CHECK(air_b3_joint_destroy(f.world, old_joint[0], old_joint[1]) == AIR_B3_OK);
    CHECK(!b3Joint_IsValid(joint_id(old_joint)));
    create_fixed(f.world, f.a, f.b, FLT_MAX, FLT_MAX, f.joint);
    CHECK(old_joint[1] == f.joint[1] && old_joint[0] != f.joint[0]);
    REJECT(AIR_B3_INVALID, air_b3_fixed_state(f.world, old_joint[0], old_joint[1],
        out + 1, AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_INVALID, air_b3_fixed_configure(f.world, old_joint[0], old_joint[1], 0, 1, 1));
    REJECT(AIR_B3_INVALID, air_b3_joint_destroy(f.world, old_joint[0], old_joint[1]));

    /* A real, valid non-weld joint must not be treated as a Fixed constraint. */
    b3DistanceJointDef distance = b3DefaultDistanceJointDef();
    distance.base.bodyIdA = body_id(f.a);
    distance.base.bodyIdB = body_id(replacement);
    b3JointId other_type = b3CreateDistanceJoint(b3LoadWorldId(f.world), &distance);
    CHECK(b3Joint_IsValid(other_type));
    uint64_t other_id = b3StoreJointId(other_type);
    REJECT(AIR_B3_UNSUPPORTED, air_b3_fixed_state(f.world, (uint32_t)other_id, (uint32_t)(other_id >> 32),
        out + 1, AIR_B3_FIXED_STATE_WORDS));
    REJECT(AIR_B3_UNSUPPORTED, air_b3_fixed_configure(f.world,
        (uint32_t)other_id, (uint32_t)(other_id >> 32), 0, 1, 1));
    CHECK(air_b3_joint_destroy(f.world, (uint32_t)other_id, (uint32_t)(other_id >> 32)) == AIR_B3_OK);

    uint32_t counts[6];
    CHECK(air_b3_body_destroy(f.b[0], f.b[1]) == AIR_B3_OK);
    CHECK(!b3Joint_IsValid(joint_id(f.joint)));
    CHECK(air_b3_world_counts(f.world, counts) == AIR_B3_OK && counts[3] == 0);
    fill_canary(out);
    CHECK(air_b3_fixed_state(f.world, f.joint[0], f.joint[1], out + 1, AIR_B3_FIXED_STATE_WORDS) == AIR_B3_INVALID);
    CHECK(air_b3_fixed_configure(f.world, f.joint[0], f.joint[1], 0, 1, 1) == AIR_B3_INVALID);
    CHECK(air_b3_joint_destroy(f.world, f.joint[0], f.joint[1]) == AIR_B3_INVALID);
    check_canary(out);
    CHECK(air_b3_world_destroy(f.world) == AIR_B3_OK);
    CHECK(air_b3_world_destroy(f.other) == AIR_B3_OK);
    CHECK(air_b3_joint_event_size(f.world, out + 1) == AIR_B3_INVALID);
    CHECK(air_b3_joint_events(f.world, out + 1, CANARY_WORDS - 1) == AIR_B3_INVALID);
    check_canary(out);
}

static Drift dynamics_contract(int anchored) {
    uint32_t world = air_b3_world_create(0, anchored ? -9.81f : -0.4f, 0);
    uint32_t a[2], b[2], joint[2], state[AIR_B3_FIXED_STATE_WORDS], frames[14], counts[6];
    CHECK(world);
    b3Vec3 pa = {-1, 0.8f, 0.4f}, pb = {1.25f, 2.1f, -0.8f};
    b3Quat qa = b3MakeQuatFromAxisAngle((b3Vec3){0, 0, 1}, 0.37f);
    b3Quat qb = b3MulQuat(b3MakeQuatFromAxisAngle((b3Vec3){1, 0, 0}, 0.63f),
        b3MakeQuatFromAxisAngle((b3Vec3){0, 1, 0}, -0.29f));
    b3Vec3 angular = anchored ? b3Vec3_zero : (b3Vec3){0.1f, 0.2f, 0.15f};
    b3Vec3 va = anchored ? b3Vec3_zero : (b3Vec3){0.35f, 0.1f, -0.2f};
    b3Vec3 vb = b3Add(va, b3Cross(angular, b3Sub(pb, pa)));
    make_body(world, anchored ? b3_staticBody : b3_dynamicBody, pa, qa, va, angular, a);
    make_body(world, b3_dynamicBody, pb, qb, vb, angular, b);
    if (!anchored) add_box(a, 0.6f, 0.5f, 0.4f, 3);
    add_box(b, 0.4f, 0.3f, 0.2f, 2);
    CHECK(air_b3_world_counts(world, counts) == AIR_B3_OK);
    CHECK(counts[0] == 2 && counts[1] == (uint32_t)(anchored ? 1 : 2));
    CHECK(b3Body_GetType(body_id(a)) == (anchored ? b3_staticBody : b3_dynamicBody));
    b3Transform captured = b3InvMulWorldTransforms(b3Body_GetTransform(body_id(a)), b3Body_GetTransform(body_id(b)));
    CHECK(length(captured.p) > 2 && angle_between(qa, qb) > 0.1f);
    create_fixed(world, anchored == 2 ? b : a, anchored == 2 ? a : b, FLT_MAX, FLT_MAX, joint);
    read_state(world, joint, state);
    memcpy(frames, state + 6, sizeof(frames));
    Drift result = {0};
    for (int tick = 0; tick < TICKS; ++tick) {
        float phase = 0.031f * (float)tick;
        b3Body_ApplyForceToCenter(body_id(b), (b3Vec3){0.3f * sinf(phase), 0.15f * cosf(phase), -0.1f}, true);
        b3Body_ApplyTorque(body_id(b), (b3Vec3){0.01f, 0.008f * sinf(phase), 0.005f * cosf(phase)}, true);
        CHECK(air_b3_world_step(world, time_step, SUBSTEPS) == AIR_B3_OK);
        CHECK(b3Joint_IsValid(joint_id(joint)));
        b3Transform current = b3InvMulWorldTransforms(b3Body_GetTransform(body_id(a)), b3Body_GetTransform(body_id(b)));
        float position = length(b3Sub(current.p, captured.p));
        float angle = angle_between(current.q, captured.q);
        CHECK(isfinite(position) && isfinite(angle));
        result.position = fmaxf(result.position, position);
        result.angle = fmaxf(result.angle, angle);
        CHECK(position <= position_limit && angle <= angular_limit);
        result.force = fmaxf(result.force, length(b3Joint_GetConstraintForce(joint_id(joint))));
        result.torque = fmaxf(result.torque, length(b3Joint_GetConstraintTorque(joint_id(joint))));
        read_state(world, joint, state);
        CHECK(memcmp(frames, state + 6, sizeof(frames)) == 0);
        CHECK(fabsf(word_float(state + 28)) <= position_limit);
        CHECK(fabsf(word_float(state + 29)) <= angular_limit);
        uint32_t events = UINT32_MAX;
        CHECK(air_b3_joint_events(world, &events, 1) == AIR_B3_OK && events == 0);
        if (tick == 199) configure_without_reset(world, a, b, joint, 1, FLT_MAX / 2, FLT_MAX / 4);
        if (tick == 399) configure_without_reset(world, a, b, joint, 0, FLT_MAX, FLT_MAX);
    }
    result.travel = length(b3SubPos(b3Body_GetPosition(body_id(a)), (b3Pos){pa.x, pa.y, pa.z}));
    result.rotation = angle_between(qa, b3Body_GetRotation(body_id(a)));
    CHECK(result.force > 0.01f && result.torque > 0.001f);
    if (anchored) CHECK(result.travel == 0 && result.rotation < 1e-6f);
    else CHECK(result.travel > 1 && result.rotation > 0.1f);
    CHECK(air_b3_world_counts(world, counts) == AIR_B3_OK && counts[3] == 1);
    /* Deliberately leave the joint and bodies live: actual world destruction owns cleanup. */
    CHECK(air_b3_world_destroy(world) == AIR_B3_OK);
    CHECK(!b3Joint_IsValid(joint_id(joint)));
    return result;
}

static Threshold threshold_contract(int torque_only) {
    uint32_t world = air_b3_world_create(0, 0, 0), a[2], b[2], joint[2], old[2], counts[6];
    CHECK(world);
    make_body(world, b3_staticBody, (b3Vec3){-0.5f, 0.25f, 0.1f},
        b3MakeQuatFromAxisAngle((b3Vec3){0, 0, 1}, 0.25f), b3Vec3_zero, b3Vec3_zero, a);
    make_body(world, b3_dynamicBody, (b3Vec3){1.25f, 0.5f, -0.4f},
        b3MakeQuatFromAxisAngle((b3Vec3){0, 1, 0}, -0.4f), b3Vec3_zero, b3Vec3_zero, b);
    add_box(b, 0.4f, 0.3f, 0.2f, 2);
    float force_threshold = torque_only ? FLT_MAX : 100;
    float torque_threshold = torque_only ? 100 : FLT_MAX;
    create_fixed(world, a, b, force_threshold, torque_threshold, old);
    CHECK(air_b3_joint_destroy(world, old[0], old[1]) == AIR_B3_OK);
    create_fixed(world, a, b, force_threshold, torque_threshold, joint);
    CHECK(old[1] == joint[1] && old[0] != joint[0]); /* Event must include the recycled generation. */
    Threshold result = {0};
    uint32_t copied[4] = {0}, saved[4] = {0};
    for (int tick = 0; tick < 24; ++tick) {
        if (torque_only) b3Body_ApplyTorque(body_id(b), (b3Vec3){0, 0, 1}, true);
        else b3Body_ApplyForceToCenter(body_id(b), (b3Vec3){1, 0, 0}, true);
        CHECK(air_b3_world_step(world, time_step, SUBSTEPS) == AIR_B3_OK);
        uint32_t size = 0;
        CHECK(air_b3_joint_event_size(world, &size) == AIR_B3_OK && size == 1);
        CHECK(air_b3_joint_events(world, copied, 4) == AIR_B3_OK && copied[0] == 0);
        CHECK(b3World_GetJointEvents(b3LoadWorldId(world)).count == 0);
        b3Vec3 reaction = torque_only ? b3Joint_GetConstraintTorque(joint_id(joint))
            : b3Joint_GetConstraintForce(joint_id(joint));
        result.low_peak = fmaxf(result.low_peak, length(reaction));
        ++result.low_ticks;
    }
    CHECK(result.low_peak > 0.1f && result.low_peak < 100);
    for (int tick = 0; tick < 12; ++tick) {
        if (torque_only) b3Body_ApplyTorque(body_id(b), (b3Vec3){0, 0, 1000}, true);
        else b3Body_ApplyForceToCenter(body_id(b), (b3Vec3){1000, 0, 0}, true);
        CHECK(air_b3_world_step(world, time_step, SUBSTEPS) == AIR_B3_OK);
        b3Vec3 reaction = torque_only ? b3Joint_GetConstraintTorque(joint_id(joint))
            : b3Joint_GetConstraintForce(joint_id(joint));
        result.high_peak = fmaxf(result.high_peak, length(reaction));
        b3JointEvents native = b3World_GetJointEvents(b3LoadWorldId(world));
        CHECK(native.count == 0 || native.count == 1);
        CHECK(air_b3_joint_events(world, copied, 4) == AIR_B3_OK);
        CHECK(copied[0] == (uint32_t)native.count);
        ++result.high_ticks;
        if (!native.count) continue;
        CHECK(b3StoreJointId(native.jointEvents[0].jointId) == id_value(joint));
        CHECK(copied[1] == joint[0] && copied[2] == joint[1] && copied[3] == 1);
        CHECK(b3Joint_IsValid(joint_id(joint)));
        CHECK(air_b3_world_counts(world, counts) == AIR_B3_OK && counts[3] == 1);
        uint32_t out[CANARY_WORDS], size = 0, before_counts[6], after_counts[6], before_memory[6], after_memory[6];
        CHECK(air_b3_joint_event_size(world, &size) == AIR_B3_OK && size == 4);
        CHECK(air_b3_world_counts(world, before_counts) == AIR_B3_OK);
        CHECK(air_b3_bridge_memory(world, before_memory) == AIR_B3_OK);
        for (int capacity = 0; capacity < 4; ++capacity) {
            fill_canary(out);
            CHECK(air_b3_joint_events(world, out + 1, capacity) == AIR_B3_CAPACITY);
            check_canary(out);
            ++rejection_checks;
        }
        CHECK(air_b3_world_counts(world, after_counts) == AIR_B3_OK);
        CHECK(air_b3_bridge_memory(world, after_memory) == AIR_B3_OK);
        CHECK(memcmp(before_counts, after_counts, sizeof(before_counts)) == 0);
        CHECK(memcmp(before_memory, after_memory, sizeof(before_memory)) == 0);
        fill_canary(out);
        CHECK(air_b3_joint_events(world, out + 1, 4) == AIR_B3_OK);
        CHECK(memcmp(out + 1, copied, sizeof(copied)) == 0);
        check_tail(out, 4);
        if (!result.repeated_events) memcpy(saved, copied, sizeof(saved));
        ++result.repeated_events;
    }
    CHECK(result.high_peak > 100 && result.repeated_events >= 2);
    CHECK(saved[1] == joint[0] && saved[2] == joint[1] && saved[3] == 1);
    result.event_lo = saved[1];
    result.event_hi = saved[2];
    /* Native threshold events are notifications, not breakage. The same joint
       survives repeated over-threshold ticks until this explicit safe-point call. */
    CHECK(b3Joint_IsValid(joint_id(joint)));
    CHECK(air_b3_joint_destroy(world, joint[0], joint[1]) == AIR_B3_OK);
    CHECK(!b3Joint_IsValid(joint_id(joint)));
    CHECK(air_b3_joint_destroy(world, joint[0], joint[1]) == AIR_B3_INVALID);
    CHECK(air_b3_world_counts(world, counts) == AIR_B3_OK && counts[3] == 0);
    b3WorldTransform released = b3Body_GetTransform(body_id(b));
    if (torque_only) b3Body_ApplyTorque(body_id(b), (b3Vec3){0, 0, 1}, true);
    else b3Body_ApplyForceToCenter(body_id(b), (b3Vec3){1, 0, 0}, true);
    CHECK(air_b3_world_step(world, time_step, SUBSTEPS) == AIR_B3_OK);
    b3WorldTransform free_pose = b3Body_GetTransform(body_id(b));
    CHECK(length(b3SubPos(free_pose.p, released.p)) > 1e-5f || angle_between(free_pose.q, released.q) > 1e-5f);
    CHECK(air_b3_joint_events(world, copied, 4) == AIR_B3_OK && copied[0] == 0);
    CHECK(saved[0] == 1 && saved[1] == joint[0] && saved[2] == joint[1] && saved[3] == 1);
    CHECK(air_b3_world_destroy(world) == AIR_B3_OK);
    return result;
}

int main(void) {
    uint32_t core_before[2], core_after[2], bridge[6];
    CHECK(strcmp(air_b3_core_sha(), "efca0c184d40fd6a82016983f1601c4d23965867") == 0);
    air_b3_live_bytes(core_before);
    CHECK(core_before[0] == 0 && core_before[1] == 0);
    CHECK(air_b3_bridge_memory(0, bridge) == AIR_B3_OK);
    for (int i = 0; i < 6; ++i) CHECK(bridge[i] == 0);
    validation_contract();
    Drift anchored = dynamics_contract(1);
    Drift reversed = dynamics_contract(2);
    Drift moving = dynamics_contract(0);
    Threshold force = threshold_contract(0);
    Threshold torque = threshold_contract(1);
    air_b3_live_bytes(core_after);
    CHECK(memcmp(core_before, core_after, sizeof(core_before)) == 0);
    CHECK(core_after[0] == 0 && core_after[1] == 0);
    CHECK(air_b3_bridge_memory(0, bridge) == AIR_B3_OK);
    for (int i = 0; i < 6; ++i) CHECK(bridge[i] == 0);
    printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"coreSha\":\"%s\","
        "\"rejectionChecks\":%d,\"rejectionOutputBodyCountMemoryUnchanged\":true,"
        "\"fullGenerationWorldOwnership\":true,\"nativeWeldCaptureNoTeleport\":true,"
        "\"nonconcentricNonidentityFrames\":true,\"ticksPerDynamicsCase\":%d,\"substeps\":%d,"
        "\"positionLimitMeters\":%.9g,\"angularLimitRadians\":%.9g,"
        "\"anchoredMaxPositionError\":%.9g,\"anchoredMaxAngularError\":%.9g,"
        "\"reversedAnchoredMaxPositionError\":%.9g,\"reversedAnchoredMaxAngularError\":%.9g,"
        "\"movingMaxPositionError\":%.9g,\"movingMaxAngularError\":%.9g,"
        "\"movingTravelMeters\":%.9g,\"movingRotationRadians\":%.9g,"
        "\"shapeFreeStaticAnchor\":true,\"configurePreservesFramesPosesAndReaction\":true,"
        "\"forceLowPeak\":%.9g,\"forceHighPeak\":%.9g,\"forceEventId\":[%u,%u],"
        "\"torqueLowPeak\":%.9g,\"torqueHighPeak\":%.9g,\"torqueEventId\":[%u,%u],"
        "\"lowTicksPerThresholdCase\":%d,\"highTicksPerThresholdCase\":%d,"
        "\"forceRepeatedEvents\":%d,\"torqueRepeatedEvents\":%d,"
        "\"nativeThresholdDoesNotDestroy\":true,\"fullEventIdCopied\":true,"
        "\"explicitDestroyReleasesConstraint\":true,\"bodyDestroyInvalidatesJoint\":true,"
        "\"worldDestroyInvalidatesJoint\":true,\"finalCoreBytes\":0,\"finalBridgeBytes\":0}\n",
        sizeof(void*), air_b3_core_sha(), rejection_checks, TICKS, SUBSTEPS, position_limit, angular_limit,
        anchored.position, anchored.angle, reversed.position, reversed.angle, moving.position, moving.angle, moving.travel, moving.rotation,
        force.low_peak, force.high_peak, force.event_lo, force.event_hi,
        torque.low_peak, torque.high_peak, torque.event_lo, torque.event_hi,
        force.low_ticks, force.high_ticks, force.repeated_events, torque.repeated_events);
    return 0;
}
