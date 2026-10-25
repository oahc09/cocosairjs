/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Only pinned public Box3D APIs. Threshold events report threshold exceedances, not automatic
   breakage; the adapter owns the broken latch and subsequent safe-point destruction. */
#include "air_box3d.h"
#include <box3d/box3d.h>
#include <limits.h>
#include <math.h>
#include <stddef.h>
#include <string.h>

_Static_assert(sizeof(b3JointId) == 8, "Review full joint ID layout");
_Static_assert(sizeof(float) == sizeof(uint32_t), "float32 wire required");
static uint64_t join(uint32_t lo, uint32_t hi) { return (uint64_t)lo | ((uint64_t)hi << 32); }
static void put_id(uint32_t* out, uint64_t id) { out[0] = (uint32_t)id; out[1] = (uint32_t)(id >> 32); }
static void put_float(uint32_t* out, float value) { memcpy(out, &value, sizeof(value)); }
static void put_vec(uint32_t* out, b3Vec3 value) { put_float(out, value.x); put_float(out + 1, value.y); put_float(out + 2, value.z); }
static void put_frame(uint32_t* out, b3Transform frame) {
    put_vec(out, frame.p); put_vec(out + 3, frame.q.v); put_float(out + 6, frame.q.s);
}
static int aligned(const void* p) { return p && (uintptr_t)p % sizeof(uint32_t) == 0; }
static int valid_config(int collide, float force, float torque) {
    return (collide == 0 || collide == 1) && isfinite(force) && force >= 0
        && isfinite(torque) && torque >= 0;
}
static int valid_frame(b3Transform t) {
    float q2 = b3Dot(t.q.v, t.q.v) + t.q.s * t.q.s;
    return isfinite(t.p.x) && isfinite(t.p.y) && isfinite(t.p.z)
        && isfinite(q2) && fabsf(q2 - 1.0f) <= 1e-4f;
}
static int owned_body(uint32_t world, b3BodyId body) {
    return body.index1 > 0 && b3Body_IsValid(body) && b3StoreWorldId(b3Body_GetWorld(body)) == world;
}
static int owned_joint(uint32_t world, uint32_t lo, uint32_t hi, b3JointId* joint) {
    int status = air_b3_world_unlocked(world); if (status) return status;
    *joint = b3LoadJointId(join(lo, hi));
    if (joint->index1 <= 0 || !b3Joint_IsValid(*joint) || b3StoreWorldId(b3Joint_GetWorld(*joint)) != world) return AIR_B3_INVALID;
    return AIR_B3_OK;
}
int air_b3_fixed_create(uint32_t world, uint32_t alo, uint32_t ahi,
    uint32_t blo, uint32_t bhi, int collide, float force, float torque, uint32_t* out)
{
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!aligned(out) || !valid_config(collide, force, torque)) return AIR_B3_ARGUMENT;
    b3BodyId a = b3LoadBodyId(join(alo, ahi)), b = b3LoadBodyId(join(blo, bhi));
    if (!owned_body(world, a) || !owned_body(world, b)) return AIR_B3_INVALID;
    if (join(alo, ahi) == join(blo, bhi)) return AIR_B3_ARGUMENT;
    b3WorldTransform ta = b3Body_GetTransform(a), tb = b3Body_GetTransform(b);
    /* Fixed has no public anchor. Choose one symmetric, dynamic-aware common
       frame to avoid an unnecessary lever on the sole dynamic endpoint. This
       changes neither body origin pose nor their captured relative pose. */
    b3Pos ca = b3Body_GetWorldCenter(a), cb = b3Body_GetWorldCenter(b);
    int dynamic_a = b3Body_GetType(a) == b3_dynamicBody;
    int dynamic_b = b3Body_GetType(b) == b3_dynamicBody;
    b3Pos center = dynamic_a != dynamic_b ? (dynamic_a ? ca : cb)
        : (b3Pos){ca.x * 0.5 + cb.x * 0.5, ca.y * 0.5 + cb.y * 0.5, ca.z * 0.5 + cb.z * 0.5};
    b3WorldTransform common = {center, ta.q};
    b3Transform fa = b3InvMulWorldTransforms(ta, common), fb = b3InvMulWorldTransforms(tb, common);
    if (!valid_frame(fa) || !valid_frame(fb)) return AIR_B3_ARGUMENT;
    b3WeldJointDef def = b3DefaultWeldJointDef();
    def.base.bodyIdA = a; def.base.bodyIdB = b;
    def.base.localFrameA = fa; def.base.localFrameB = fb;
    def.base.collideConnected = collide != 0;
    def.base.forceThreshold = force; def.base.torqueThreshold = torque;
    /* Pinned defaults use zero hertz for maximum stiffness, not an invented spring. */
    b3JointId joint = b3CreateWeldJoint(b3LoadWorldId(world), &def);
    if (!b3Joint_IsValid(joint)) return AIR_B3_CREATION;
    put_id(out, b3StoreJointId(joint));
    return AIR_B3_OK;
}
int air_b3_fixed_configure(uint32_t world, uint32_t lo, uint32_t hi,
    int collide, float force, float torque)
{
    b3JointId joint; int status = owned_joint(world, lo, hi, &joint); if (status) return status;
    if (b3Joint_GetType(joint) != b3_weldJoint) return AIR_B3_UNSUPPORTED;
    if (!valid_config(collide, force, torque)) return AIR_B3_ARGUMENT;
    /* All validation precedes the first mutation; frames/pose/broken state are not reset. */
    b3Joint_SetForceThreshold(joint, force);
    b3Joint_SetTorqueThreshold(joint, torque);
    b3Joint_SetCollideConnected(joint, collide != 0);
    b3Joint_WakeBodies(joint);
    return AIR_B3_OK;
}
int air_b3_fixed_state(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out, int capacity)
{
    b3JointId joint; int status = owned_joint(world, lo, hi, &joint); if (status) return status;
    if (b3Joint_GetType(joint) != b3_weldJoint) return AIR_B3_UNSUPPORTED;
    if (!aligned(out) || capacity < 0) return AIR_B3_ARGUMENT;
    if (capacity < AIR_B3_FIXED_STATE_WORDS) return AIR_B3_CAPACITY;
    uint32_t copy[AIR_B3_FIXED_STATE_WORDS] = {1};
    put_id(copy + 1, b3StoreBodyId(b3Joint_GetBodyA(joint)));
    put_id(copy + 3, b3StoreBodyId(b3Joint_GetBodyB(joint)));
    copy[5] = b3Joint_GetCollideConnected(joint);
    put_frame(copy + 6, b3Joint_GetLocalFrameA(joint));
    put_frame(copy + 13, b3Joint_GetLocalFrameB(joint));
    put_float(copy + 20, b3Joint_GetForceThreshold(joint));
    put_float(copy + 21, b3Joint_GetTorqueThreshold(joint));
    put_vec(copy + 22, b3Joint_GetConstraintForce(joint));
    put_vec(copy + 25, b3Joint_GetConstraintTorque(joint));
    put_float(copy + 28, b3Joint_GetLinearSeparation(joint));
    /* The pinned generic accessor omits localFrame rotations for welds. Report
       actual captured joint-frame error, not the bodies' initial relative angle. */
    b3Quat qa = b3MulQuat(b3Body_GetRotation(b3Joint_GetBodyA(joint)), b3Joint_GetLocalFrameA(joint).q);
    b3Quat qb = b3MulQuat(b3Body_GetRotation(b3Joint_GetBodyB(joint)), b3Joint_GetLocalFrameB(joint).q);
    b3Quat dq = b3InvMulQuat(qa, qb);
    put_float(copy + 29, 2.0f * atan2f(sqrtf(b3Dot(dq.v, dq.v)), fabsf(dq.s)));
    for (int i = 6; i < AIR_B3_FIXED_STATE_WORDS; ++i) {
        float value; memcpy(&value, copy + i, sizeof(value));
        if (!isfinite(value)) return AIR_B3_UNSUPPORTED;
    }
    memcpy(out, copy, sizeof(copy)); return AIR_B3_OK;
}
int air_b3_joint_destroy(uint32_t world, uint32_t lo, uint32_t hi)
{
    b3JointId joint; int status = owned_joint(world, lo, hi, &joint); if (status) return status;
    b3DestroyJoint(joint, true); return AIR_B3_OK;
}
int air_b3_joint_event_size(uint32_t world, uint32_t* out)
{
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!aligned(out)) return AIR_B3_ARGUMENT;
    b3JointEvents events = b3World_GetJointEvents(b3LoadWorldId(world));
    if (events.count < 0 || events.count > (INT_MAX - 1) / 3) return AIR_B3_CAPACITY;
    *out = 1u + 3u * (uint32_t)events.count; return AIR_B3_OK;
}
int air_b3_joint_events(uint32_t world, uint32_t* out, int capacity)
{
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!aligned(out) || capacity < 0) return AIR_B3_ARGUMENT;
    b3JointEvents events = b3World_GetJointEvents(b3LoadWorldId(world));
    if (events.count < 0 || events.count > (INT_MAX - 1) / 3) return AIR_B3_CAPACITY;
    if (capacity < 1 + 3 * events.count) return AIR_B3_CAPACITY;
    out[0] = (uint32_t)events.count;
    for (int i = 0; i < events.count; ++i) {
        b3JointId joint = events.jointEvents[i].jointId;
        put_id(out + 1 + 3 * i, b3StoreJointId(joint));
        out[3 + 3 * i] = b3Joint_IsValid(joint);
    }
    return AIR_B3_OK;
}
