/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Independent, intrusive native qualification. No production test exports.
 * These private H/F writes construct boundary states, NOT an implemented trim.
 * Build the real hash-bound core and complete bridge step adapter in Debug.
 * This source is newly reconstructed; it is not the lost historical fixture. */
#include <box3d/box3d.h>
#include <box3d/collision.h>
#include <box3d/math_functions.h>
#include <inttypes.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef NDEBUG
#error "Identity qualification requires assertions in the real core"
#endif

static unsigned checks;
static void check(int ok, const char* expression, int line)
{
    ++checks;
    if (!ok) {
        fprintf(stderr, "identity check %u failed at line %d: %s\n", checks, line, expression);
        exit(1);
    }
}
#define CHECK(expression) check((expression), #expression, __LINE__)

static b3WorldId new_world(void)
{
    b3WorldDef def = b3DefaultWorldDef();
    def.gravity = (b3Vec3){0, 0, 0};
    def.workerCount = 1;
    return b3CreateWorld(&def);
}

#ifndef AIR_IDENTITY_BASELINE_ONLY
#include "air_box3d.h"
#include "physics_world.h"
#include "body.h"
#include "shape.h"
#include "joint.h"
#include "contact.h"
#include "id_pool.h"

static b3BodyId body(b3WorldId world)
{
    b3BodyDef def = b3DefaultBodyDef();
    def.type = b3_dynamicBody;
    return b3CreateBody(world, &def);
}

static b3ShapeId sphere(b3BodyId id)
{
    b3ShapeDef def = b3DefaultShapeDef();
    b3Sphere geometry = {{0, 0, 0}, 1};
    return b3CreateSphereShape(id, &def, &geometry);
}

static b3JointId weld(b3WorldId world, b3BodyId a, b3BodyId b)
{
    b3WeldJointDef def = b3DefaultWeldJointDef();
    def.base.bodyIdA = a;
    def.base.bodyIdB = b;
    return b3CreateWeldJoint(world, &def);
}

static b3ContactId raw_contact(b3World* world, int slot)
{
    return (b3ContactId){slot + 1, (uint16_t)world->worldId, 0, world->contacts.data[slot].generation};
}

static int make_contact(b3World* world, b3ShapeId a, b3ShapeId b)
{
    int slot = b3PeekId(&world->contactIdPool);
    b3CreateContact(world, world->shapes.data + a.index1 - 1, world->shapes.data + b.index1 - 1, 0);
    return slot;
}

static void close_world(b3WorldId id, int64_t before)
{
    b3DestroyWorld(id);
    CHECK(!b3World_IsValid(id));
    CHECK(b3GetByteCount() == before);
}

static void body_identity(void)
{
    int64_t before = b3GetByteCount();
    b3WorldId id = new_world();
    b3World* world = b3GetWorldFromId(id);
    world->identity.high[b3_bodyIdentity] = 7;
    world->identity.floor[b3_bodyIdentity] = 7;
    b3BodyId ids[20];
    for (int i = 0; i < 20; ++i) {
        ids[i] = body(id);
        CHECK(b3Body_IsValid(ids[i]) && ids[i].index1 == i + 1 && ids[i].generation == 8);
    }
    CHECK(world->identity.high[b3_bodyIdentity] == 8);
    b3DestroyBody(ids[0]);
    CHECK(!b3Body_IsValid(ids[0]));
    b3BodyId reused = body(id);
    CHECK(reused.index1 == ids[0].index1 && reused.generation == 9 && b3Body_IsValid(reused));
    CHECK(!b3Body_IsValid(ids[0]));
    b3DestroyBody(reused);
    world->bodies.data[0].generation = UINT16_MAX - 1;
    world->identity.high[b3_bodyIdentity] = UINT16_MAX - 1;
    b3BodyId last = body(id);
    CHECK(last.index1 == 1 && last.generation == UINT16_MAX && b3Body_IsValid(last));
    b3DestroyBody(last);
    int count = b3GetIdCount(&world->bodyIdPool);
    int free_count = world->bodyIdPool.freeArray.count;
    CHECK(B3_IS_NULL(body(id)));
    CHECK(b3GetIdCount(&world->bodyIdPool) == count && world->bodyIdPool.freeArray.count == free_count);
    CHECK(!b3Body_IsValid(last) && !world->locked && world->identity.high[b3_bodyIdentity] == UINT16_MAX);
    CHECK(!b3World_HasIdentityFault(id));
    close_world(id, before);
}

static void shape_identity(void)
{
    int64_t before = b3GetByteCount();
    b3WorldId id = new_world();
    b3BodyId owner = body(id);
    b3World* world = b3GetWorldFromId(id);
    world->identity.high[b3_shapeIdentity] = 17;
    world->identity.floor[b3_shapeIdentity] = 17;
    b3ShapeId ids[20];
    for (int i = 0; i < 20; ++i) {
        ids[i] = sphere(owner);
        CHECK(b3Shape_IsValid(ids[i]) && ids[i].index1 == i + 1 && ids[i].generation == 18);
    }
    CHECK(world->identity.high[b3_shapeIdentity] == 18);
    b3DestroyShape(ids[0], true);
    CHECK(!b3Shape_IsValid(ids[0]));
    b3ShapeId reused = sphere(owner);
    CHECK(reused.index1 == 1 && reused.generation == 19 && b3Shape_IsValid(reused));
    CHECK(!b3Shape_IsValid(ids[0]));
    b3DestroyShape(reused, true);
    world->shapes.data[0].generation = UINT16_MAX - 1;
    world->identity.high[b3_shapeIdentity] = UINT16_MAX - 1;
    b3ShapeId last = sphere(owner);
    CHECK(last.index1 == 1 && last.generation == UINT16_MAX && b3Shape_IsValid(last));
    b3DestroyShape(last, true);
    int count = b3GetIdCount(&world->shapeIdPool);
    int attached = world->bodies.data[owner.index1 - 1].shapeCount;
    CHECK(B3_IS_NULL(sphere(owner)));
    CHECK(b3GetIdCount(&world->shapeIdPool) == count && world->bodies.data[owner.index1 - 1].shapeCount == attached);
    CHECK(!b3Shape_IsValid(last) && !world->locked && world->identity.high[b3_shapeIdentity] == UINT16_MAX);
    CHECK(!b3World_HasIdentityFault(id));
    close_world(id, before);
}

static void failed_hull_floor(void)
{
    int64_t before = b3GetByteCount();
    b3WorldId id = new_world();
    b3BodyId owner = body(id);
    b3World* world = b3GetWorldFromId(id);
    world->identity.high[b3_shapeIdentity] = 59;
    world->identity.floor[b3_shapeIdentity] = 59;
    b3BoxHull hull = b3MakeBoxHull(1, 1, 1);
    b3ShapeDef def = b3DefaultShapeDef();
    b3ShapeId failed = b3CreateTransformedHullShape(owner, &def, &hull.base,
        b3Transform_identity, (b3Vec3){1e8f, 1e8f, 1e8f});
    CHECK(B3_IS_NULL(failed));
    CHECK(world->shapes.count == 1 && b3PeekId(&world->shapeIdPool) == 0);
    CHECK(world->shapes.data[0].generation == 59 && world->identity.high[b3_shapeIdentity] == 59);
    CHECK(b3GetIdCount(&world->shapeIdPool) == 0 && world->bodies.data[owner.index1 - 1].shapeCount == 0);
    CHECK(!world->locked && !b3World_HasIdentityFault(id));
    b3ShapeId retry = sphere(owner);
    CHECK(retry.index1 == 1 && retry.generation == 60 && b3Shape_IsValid(retry));
    close_world(id, before);
    /* The last global-byte assertion detects retained clone allocation after close.
     * It does not independently attribute in-world hull-database capacities. */
}

static void joint_identity(void)
{
    int64_t before = b3GetByteCount();
    b3WorldId id = new_world();
    b3BodyId a = body(id), b = body(id);
    b3ShapeId sa = sphere(a), sb = sphere(b);
    b3World* world = b3GetWorldFromId(id);
    world->identity.high[b3_jointIdentity] = 23;
    world->identity.floor[b3_jointIdentity] = 23;
    b3JointId ids[20];
    for (int i = 0; i < 20; ++i) {
        ids[i] = weld(id, a, b);
        CHECK(b3Joint_IsValid(ids[i]) && ids[i].index1 == i + 1 && ids[i].generation == 24);
    }
    CHECK(world->identity.high[b3_jointIdentity] == 24);
    b3DestroyJoint(ids[0], false);
    CHECK(!b3Joint_IsValid(ids[0]));
    b3JointId reused = weld(id, a, b);
    CHECK(reused.index1 == 1 && reused.generation == 25 && b3Joint_IsValid(reused));
    CHECK(!b3Joint_IsValid(ids[0]));
    b3DestroyJoint(reused, false);
    for (int i = 1; i < 20; ++i) b3DestroyJoint(ids[i], false);
    int slot = b3PeekId(&world->jointIdPool);
    world->joints.data[slot].generation = UINT16_MAX - 1;
    world->identity.high[b3_jointIdentity] = UINT16_MAX - 1;
    b3JointId last = weld(id, a, b);
    CHECK(last.index1 == slot + 1 && last.generation == UINT16_MAX && b3Joint_IsValid(last));
    b3DestroyJoint(last, false);
    int contact = make_contact(world, sa, sb);
    b3ContactId retained = raw_contact(world, contact);
    CHECK(b3Contact_IsValid(retained) && b3GetIdCount(&world->contactIdPool) == 1);
    int free_count = world->jointIdPool.freeArray.count;
#define REJECT_JOINT(Name) do { \
    b3##Name##JointDef def = b3Default##Name##JointDef(); \
    def.base.bodyIdA = a; def.base.bodyIdB = b; \
    CHECK(B3_IS_NULL(b3Create##Name##Joint(id, &def))); \
} while (0)
    REJECT_JOINT(Parallel);
    REJECT_JOINT(Distance);
    REJECT_JOINT(Motor);
    REJECT_JOINT(Filter);
    REJECT_JOINT(Prismatic);
    REJECT_JOINT(Revolute);
    REJECT_JOINT(Spherical);
    REJECT_JOINT(Weld);
    REJECT_JOINT(Wheel);
#undef REJECT_JOINT
    CHECK(b3Contact_IsValid(retained) && b3GetIdCount(&world->contactIdPool) == 1);
    CHECK(b3GetIdCount(&world->jointIdPool) == 0 && world->jointIdPool.freeArray.count == free_count);
    CHECK(!b3Joint_IsValid(last) && !world->locked && !b3World_HasIdentityFault(id));
    close_world(id, before);
}

static void contact_high_slots(void)
{
    int64_t before = b3GetByteCount();
    b3WorldId id = new_world();
    b3BodyId a = body(id), b = body(id);
    b3ShapeId sa = sphere(a), shapes[20];
    b3World* world = b3GetWorldFromId(id);
    for (int i = 0; i < 20; ++i) shapes[i] = sphere(b);
    world->identity.high[b3_contactIdentity] = 101;
    world->identity.floor[b3_contactIdentity] = 101;
    b3ContactId old[20];
    for (int i = 0; i < 20; ++i) {
        int slot = make_contact(world, sa, shapes[i]);
        old[i] = raw_contact(world, slot);
        CHECK(slot == i && old[i].generation == 102 && b3Contact_IsValid(old[i]));
    }
    CHECK(world->identity.high[b3_contactIdentity] == 102);
    b3DestroyContact(world, world->contacts.data, false);
    CHECK(!b3Contact_IsValid(old[0]));
    int reused = make_contact(world, sa, shapes[0]);
    CHECK(reused == 0 && world->contacts.data[reused].generation == 103);
    CHECK(!b3Contact_IsValid(old[0]) && b3Contact_IsValid(raw_contact(world, reused)));
    close_world(id, before);
}

static void contact_unsigned(void)
{
    int64_t before = b3GetByteCount();
    b3WorldId id = new_world();
    b3BodyId a = body(id), b = body(id);
    b3ShapeId sa = sphere(a), sb = sphere(b);
    b3World* world = b3GetWorldFromId(id);
    world->identity.high[b3_contactIdentity] = INT32_MAX;
    world->identity.floor[b3_contactIdentity] = INT32_MAX;
    int slot = make_contact(world, sa, sb);
    b3ContactId signed_boundary = raw_contact(world, slot);
    CHECK(signed_boundary.generation == UINT32_C(2147483648) && b3Contact_IsValid(signed_boundary));
    b3DestroyContact(world, world->contacts.data + slot, false);
    CHECK(!b3Contact_IsValid(signed_boundary));
    world->contacts.data[slot].generation = UINT32_MAX - 1;
    world->identity.high[b3_contactIdentity] = UINT32_MAX - 1;
    make_contact(world, sa, sb);
    b3ContactId last = raw_contact(world, slot);
    CHECK(last.generation == UINT32_MAX && b3Contact_IsValid(last));
    b3DestroyContact(world, world->contacts.data + slot, false);
    int free_count = world->contactIdPool.freeArray.count;
    make_contact(world, sa, sb);
    CHECK(b3World_HasIdentityFault(id) && b3GetIdCount(&world->contactIdPool) == 0);
    CHECK(world->contactIdPool.freeArray.count == free_count && !b3Contact_IsValid(last));
    CHECK(world->identity.high[b3_contactIdentity] == UINT32_MAX && !world->locked);
    close_world(id, before);
}

/* An actual core tree task is deferred and executed exactly once at finish.
 * Other real tasks execute synchronously; no physics routine is replaced. */
typedef struct DeferredTree {
    b3TaskCallback* task;
    void* context;
    unsigned queued;
    unsigned joined;
} DeferredTree;

static void* enqueue(b3TaskCallback* task, void* context, void* user, const char* name)
{
    DeferredTree* tree = user;
    if (strcmp(name, "rebuild tree") == 0) {
        if (tree->task != NULL) abort();
        tree->task = task;
        tree->context = context;
        ++tree->queued;
        return tree;
    }
    task(context);
    return NULL;
}

static void finish(void* token, void* user)
{
    DeferredTree* tree = user;
    if (token != tree || tree->task == NULL) abort();
    b3TaskCallback* task = tree->task;
    tree->task = NULL;
    task(tree->context);
    ++tree->joined;
}

static void contact_partial_step_fault(void)
{
    int64_t before = b3GetByteCount();
    DeferredTree tree = {0};
    b3WorldDef def = b3DefaultWorldDef();
    def.gravity = (b3Vec3){0, 0, 0};
    def.workerCount = 1;
    def.enqueueTask = enqueue;
    def.finishTask = finish;
    def.userTaskContext = &tree;
    b3WorldId id = b3CreateWorld(&def);
    b3World* world = b3GetWorldFromId(id);
    b3BodyId bodies[3];
    b3ShapeId shapes[3];
    for (int i = 0; i < 3; ++i) {
        bodies[i] = body(id);
        shapes[i] = sphere(bodies[i]);
    }
    int c0 = make_contact(world, shapes[0], shapes[1]);
    int c1 = make_contact(world, shapes[0], shapes[2]);
    b3ContactId old0 = raw_contact(world, c0), old1 = raw_contact(world, c1);
    CHECK(c0 == 0 && c1 == 1 && b3GetIdCount(&world->contactIdPool) == 2);
    b3DestroyContact(world, world->contacts.data + c0, false);
    b3DestroyContact(world, world->contacts.data + c1, false);
    CHECK(b3PeekId(&world->contactIdPool) == 1 && b3GetIdCount(&world->contactIdPool) == 0);
    world->contacts.data[0].generation = UINT32_MAX;
    world->identity.high[b3_contactIdentity] = UINT32_MAX;
    uint64_t step = world->stepIndex;
    int event_index = world->endEventArrayIndex;
    CHECK(air_b3_world_step(b3StoreWorldId(id), 1.0f / 60.0f, 1) == AIR_B3_CAPACITY);
    CHECK(b3World_HasIdentityFault(id));
    CHECK(b3GetIdCount(&world->contactIdPool) == 1 && world->contacts.data[1].generation == 2);
    CHECK(!b3Contact_IsValid(old0) && !b3Contact_IsValid(old1));
    CHECK(tree.queued == 1 && tree.joined == 1 && tree.task == NULL);
    CHECK(world->userTreeTask == NULL && world->activeTaskCount == 0 && world->stack.allocation == 0);
    CHECK(!world->locked && world->stepIndex == step && world->endEventArrayIndex == event_index);
    CHECK(world->identity.high[b3_contactIdentity] == UINT32_MAX);
    CHECK(B3_IS_NULL(body(id)) && B3_IS_NULL(sphere(bodies[0])) && B3_IS_NULL(weld(id, bodies[0], bodies[1])));
    CHECK(air_b3_world_step(b3StoreWorldId(id), 1.0f / 60.0f, 1) == AIR_B3_CAPACITY);
    CHECK(tree.queued == 1 && tree.joined == 1 && world->stepIndex == step);
    b3ContactEvents events = b3World_GetContactEvents(id);
    CHECK(events.beginCount == 0 && events.endCount == 0 && events.hitCount == 0);
    b3SensorEvents sensors = b3World_GetSensorEvents(id);
    CHECK(sensors.beginCount == 0 && sensors.endCount == 0);
    /* A separate live world remains operational; the fault is world-local. */
    b3WorldId other = new_world();
    b3BodyId other_body = body(other);
    CHECK(b3Body_IsValid(other_body) && !b3World_HasIdentityFault(other));
    CHECK(air_b3_world_step(b3StoreWorldId(other), 1.0f / 60.0f, 1) == AIR_B3_OK);
    b3DestroyWorld(other);
    for (int i = 0; i < 3; ++i) b3DestroyBody(bodies[i]);
    CHECK(b3World_GetCounters(id).bodyCount == 0 && b3World_GetCounters(id).shapeCount == 0 &&
        b3World_GetCounters(id).contactCount == 0 && b3World_GetCounters(id).jointCount == 0);
    close_world(id, before);
}
#endif

int main(void)
{
    int64_t before = b3GetByteCount();
    b3WorldId id = new_world();
    CHECK(b3World_IsValid(id));
    b3Counters initial = b3World_GetCounters(id);
    int64_t with_world = b3GetByteCount();
    CHECK(initial.bodyCount == 0 && initial.shapeCount == 0 && initial.contactCount == 0 && initial.jointCount == 0);
    b3DestroyWorld(id);
    CHECK(!b3World_IsValid(id));
    CHECK(b3GetByteCount() == before);
#ifdef AIR_IDENTITY_BASELINE_ONLY
    printf("{\"profile\":\"air-box3d-identity-base-control-v1\",\"status\":\"PASS\","
        "\"checks\":%u,\"identityMetadataLedgerBytes\":0,\"trimEnabled\":false,"
        "\"initialLedgerBytes\":%" PRId64 ",\"moduleBeforeWorld\":%" PRId64 ",\"moduleWithWorld\":%" PRId64
        ",\"moduleAfterClose\":%" PRId64 "}\n", checks, initial.byteCount, before, with_world, b3GetByteCount());
#else
    CHECK(sizeof(b3IdentityState) == 36);
    /* Expected successful-path groups: 31,31,8,40,26,8,20; main 6 = 170.
     * This is source arithmetic, not a claim that native execution passed. */
    unsigned starts[8];
    starts[0] = checks;
    body_identity();
    starts[1] = checks;
    shape_identity();
    starts[2] = checks;
    failed_hull_floor();
    starts[3] = checks;
    joint_identity();
    starts[4] = checks;
    contact_high_slots();
    starts[5] = checks;
    contact_unsigned();
    starts[6] = checks;
    contact_partial_step_fault();
    starts[7] = checks;
    CHECK(b3GetByteCount() == before);
    printf("{\"profile\":\"air-box3d-identity-native-rebuild-v1\",\"status\":\"PASS\","
        "\"checks\":%u,\"identityMetadataLedgerBytes\":%zu,\"trimEnabled\":false,"
        "\"initialLedgerBytes\":%" PRId64 ",\"moduleBeforeWorld\":%" PRId64 ",\"moduleWithWorld\":%" PRId64
        ",\"moduleAfterClose\":%" PRId64 ",\"groups\":{\"body\":%u,\"shape\":%u,\"failedHullFloor\":%u,"
        "\"joint\":%u,\"contactHigh\":%u,\"contactUnsigned\":%u,\"contactFault\":%u,\"main\":6}}\n",
        checks, sizeof(b3IdentityState), initial.byteCount, before, with_world, b3GetByteCount(),
        starts[1]-starts[0], starts[2]-starts[1], starts[3]-starts[2], starts[4]-starts[3],
        starts[5]-starts[4], starts[6]-starts[5], starts[7]-starts[6]);
#endif
    return 0;
}
