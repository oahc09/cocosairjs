/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Intrusive, independent native qualification, not the public C20 APP fixture.
 * Only this executable may inject private boundary states. No production test API.
 * No historical native PASS or assertion count is carried into this source. */
#include <box3d/box3d.h>
#include <box3d/collision.h>
#include <box3d/constants.h>
#include <box3d/math_functions.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "physics_world.h"
#include "body.h"
#include "shape.h"
#include "contact.h"
#include "joint.h"

#ifdef NDEBUG
#error "Native storage qualification requires Debug assertions"
#endif

static unsigned checks;
static void check(int condition, const char* expression, int line)
{
    ++checks;
    if (!condition) {
        fprintf(stderr, "storage check %u failed at %d: %s\n", checks, line, expression);
        exit(1);
    }
}
#define CHECK(expression) check((expression), #expression, __LINE__)

static b3WorldDef world_def(int custom)
{
    b3WorldDef def = b3DefaultWorldDef();
    def.workerCount = 1;
    def.gravity = (b3Vec3){0, 0, 0};
    if (custom) {
        def.capacity = (b3Capacity){24, 40, 20, 32, 48};
        /* Two contexts, synchronous external tasks: storage coverage, NOT MT proof. */
        def.workerCount = 2;
    }
    return def;
}

#ifndef AIR_STORAGE_BASELINE_ONLY
static b3BodyId make_body(b3WorldId world, b3BodyType type, float x, float y, const char* name)
{
    b3BodyDef def = b3DefaultBodyDef();
    def.type = type;
    def.position = (b3Pos){x, y, 0};
    def.name = name;
    return b3CreateBody(world, &def);
}

static b3ShapeId make_sphere(b3BodyId body, bool sensor)
{
    b3ShapeDef def = b3DefaultShapeDef();
    def.isSensor = sensor;
    def.enableSensorEvents = true;
    def.enableContactEvents = true;
    def.name = sensor ? "retired-sensor" : "retired-sphere";
    b3Sphere sphere = {{0, 0, 0}, sensor ? 3.0f : 1.0f};
    return b3CreateSphereShape(body, &def, &sphere);
}

static b3JointId make_weld(b3WorldId world, b3BodyId a, b3BodyId b)
{
    b3WeldJointDef def = b3DefaultWeldJointDef();
    def.base.bodyIdA = a;
    def.base.bodyIdB = b;
    return b3CreateWeldJoint(world, &def);
}

static b3ContactId first_contact(b3BodyId body)
{
    b3ContactData contacts[16];
    int count = b3Body_GetContactData(body, contacts, 16);
    CHECK(count > 0);
    return contacts[0].contactId;
}

static int retired_events(const b3World* world)
{
    return world->bodyMoveEvents.count + world->sensorBeginEvents.count + world->contactBeginEvents.count +
        world->sensorEndEvents[0].count + world->sensorEndEvents[1].count +
        world->contactEndEvents[0].count + world->contactEndEvents[1].count +
        world->contactHitEvents.count + world->jointEvents.count;
}

static uint64_t hash_bytes(uint64_t hash, const void* input, size_t bytes)
{
    const unsigned char* data = input;
    for (size_t i = 0; i < bytes; ++i) hash = (hash ^ data[i]) * UINT64_C(1099511628211);
    return hash;
}

/* Compare live event records as well as the world struct on every rejection.
 * This is a fixture integrity hash, not a substitute for a native resource counter. */
static uint64_t event_hash(const b3World* world)
{
    uint64_t hash = UINT64_C(14695981039346656037);
#define HASH_EVENTS(member) hash = hash_bytes(hash, world->member.data, \
    (size_t)world->member.count * sizeof(*world->member.data))
    HASH_EVENTS(bodyMoveEvents);
    HASH_EVENTS(sensorBeginEvents);
    HASH_EVENTS(contactBeginEvents);
    HASH_EVENTS(sensorEndEvents[0]);
    HASH_EVENTS(sensorEndEvents[1]);
    HASH_EVENTS(contactEndEvents[0]);
    HASH_EVENTS(contactEndEvents[1]);
    HASH_EVENTS(contactHitEvents);
    HASH_EVENTS(jointEvents);
#undef HASH_EVENTS
    return hash;
}

static void rejected(b3WorldId id, bool acknowledge, b3EmptyTrimResult expected)
{
    b3World* world = b3GetWorldFromId(id);
    unsigned char snapshot[sizeof(b3World)];
    memcpy(snapshot, world, sizeof snapshot);
    int64_t bytes = b3GetByteCount();
    uint64_t events = event_hash(world);
    CHECK(b3World_TrimEmptyStorage(id, acknowledge) == expected);
    CHECK(memcmp(snapshot, world, sizeof snapshot) == 0);
    CHECK(b3GetByteCount() == bytes);
    CHECK(event_hash(world) == events);
}

/* Check only promised persistent state, not intentionally retired scratch or pointers
 * into the old containers. Copying a b3World here does not transfer ownership. */
static void preserved(b3WorldId id, const b3World* old, const b3World* pointer, const int* arena_peaks)
{
    const b3World* now = b3GetWorldFromId(id);
    CHECK(now == pointer && now->worldId == old->worldId && now->generation == old->generation && now->inUse);
    CHECK(now->stepIndex == old->stepIndex && now->endEventArrayIndex == old->endEventArrayIndex);
    CHECK(memcmp(&now->gravity, &old->gravity, sizeof now->gravity) == 0 &&
        now->maxLinearSpeed == old->maxLinearSpeed && now->contactHertz == old->contactHertz &&
        now->contactDampingRatio == old->contactDampingRatio && now->contactSpeed == old->contactSpeed);
    CHECK(now->enableSleep == old->enableSleep && now->enableWarmStarting == old->enableWarmStarting &&
        now->enableContinuous == old->enableContinuous && now->enableSpeculative == old->enableSpeculative);
    CHECK(now->frictionCallback == old->frictionCallback && now->restitutionCallback == old->restitutionCallback &&
        now->customFilterFcn == old->customFilterFcn && now->customFilterContext == old->customFilterContext &&
        now->preSolveFcn == old->preSolveFcn && now->preSolveContext == old->preSolveContext);
    CHECK(now->createDebugShape == old->createDebugShape && now->destroyDebugShape == old->destroyDebugShape &&
        now->userDebugShapeContext == old->userDebugShapeContext && now->userData == old->userData);
    CHECK(now->workerCount == old->workerCount && now->enqueueTaskFcn == old->enqueueTaskFcn &&
        now->finishTaskFcn == old->finishTaskFcn && now->userTaskContext == old->userTaskContext);
    CHECK(now->scheduler == old->scheduler && now->manifoldAllocatorMutex == old->manifoldAllocatorMutex &&
        now->recording == old->recording);
    CHECK(memcmp(&now->maxCapacity, &old->maxCapacity, sizeof now->maxCapacity) == 0 &&
        memcmp(&now->creationCapacity, &old->creationCapacity, sizeof now->creationCapacity) == 0);
    bool same_peaks = true;
    for (int i = 0; i < now->workerCount; ++i) {
        same_peaks = same_peaks && now->taskContexts.data[i].arena.shared->peakDemand == arena_peaks[i];
    }
    CHECK(now->stack.maxAllocation == old->stack.maxAllocation && same_peaks);
    CHECK(now->inv_h == old->inv_h && now->inv_dt == old->inv_dt);
    CHECK(memcmp(&now->profile, &old->profile, sizeof now->profile) == 0 && now->taskCount == old->taskCount);
    CHECK(!now->locked && now->identity.contactExhausted == old->identity.contactExhausted);
    for (int kind = 0; kind < b3_identityKindCount; ++kind) {
        CHECK(now->identity.high[kind] == old->identity.high[kind] &&
            now->identity.floor[kind] == old->identity.high[kind]);
    }
}

static void trim_to_baseline(b3WorldId id, int64_t ledger, int64_t module)
{
    b3World* world = b3GetWorldFromId(id);
    b3World old = *world;
    int peaks[B3_MAX_WORKERS];
    for (int i = 0; i < world->workerCount; ++i) peaks[i] = world->taskContexts.data[i].arena.shared->peakDemand;
    CHECK(b3World_TrimEmptyStorage(id, true) == b3_emptyTrimSuccess);
    preserved(id, &old, world, peaks);
    CHECK(b3World_GetCounters(id).byteCount == ledger);
    CHECK(b3GetByteCount() == module);
    CHECK(retired_events(world) == 0);
    CHECK(world->names.entries.count == 0 && world->sensors.count == 0 && world->compoundShapeCount == 0);
}

static void close_world(b3WorldId id, int64_t bytes)
{
    b3DestroyWorld(id);
    CHECK(!b3World_IsValid(id));
    CHECK(b3GetByteCount() == bytes);
}

/* Use real synchronous task callbacks and count actual rebuild invocations. */
static unsigned tree_tasks;
static void* inline_task(b3TaskCallback* task, void* context, void* user, const char* name)
{
    (void)user;
    if (strcmp(name, "rebuild tree") == 0) ++tree_tasks;
    task(context);
    return NULL;
}
static void no_pending_task(void* task, void* user)
{
    (void)task;
    (void)user;
    /* Synchronous enqueue never supplies a handle for finish. */
    abort();
}
static float friction(float a, uint64_t ma, float b, uint64_t mb)
{
    (void)ma;
    (void)mb;
    return 0.5f * (a + b);
}

static void mixed_scene(int custom)
{
    int64_t before = b3GetByteCount();
    b3WorldDef def = world_def(custom);
    def.enqueueTask = inline_task;
    def.finishTask = no_pending_task;
    def.userTaskContext = &tree_tasks;
    def.frictionCallback = friction;
    def.userData = &tree_tasks;
    b3WorldId id = b3CreateWorld(&def);
    b3World* world = b3GetWorldFromId(id);
    int64_t initial = b3World_GetCounters(id).byteCount;
    int64_t module = b3GetByteCount();
    CHECK(memcmp(&world->creationCapacity, &def.capacity, sizeof def.capacity) == 0);
    b3BodyId bodies[50];
    b3ShapeId shapes[50];
    b3BoxHull box = b3MakeBoxHull(10, 0.5f, 10);
    for (int i = 0; i < 50; ++i) {
        char name[40];
        snprintf(name, sizeof name, "retired-body-%d", i);
        b3BodyType type = i == 0 || i == 2 ? b3_staticBody : i == 1 ? b3_kinematicBody : b3_dynamicBody;
        bodies[i] = make_body(id, type, i <= 4 ? 0 : 4.0f * i, i == 0 ? -1.0f : 0, name);
        if (i == 0) {
            b3ShapeDef shape = b3DefaultShapeDef();
            shape.enableContactEvents = true;
            shape.enableSensorEvents = true;
            shape.name = "retired-hull";
            shapes[i] = b3CreateHullShape(bodies[i], &shape, &box.base);
        } else shapes[i] = make_sphere(bodies[i], i == 2);
        CHECK(b3Body_IsValid(bodies[i]) && b3Shape_IsValid(shapes[i]));
    }
    b3JointId joint = make_weld(id, bodies[3], bodies[4]);
    CHECK(b3Joint_IsValid(joint));
    unsigned tasks = tree_tasks;
    b3World_Step(id, 1.0f / 60.0f, 1);
    CHECK(tree_tasks > tasks && world->stepIndex > 0);
    CHECK(b3World_GetSensorEvents(id).beginCount > 0);
    b3ContactId contact = first_contact(bodies[3]);
    CHECK(b3Contact_IsValid(contact));
    b3World_Step(id, 1.0f / 60.0f, 1);
    b3World_Step(id, 1.0f / 60.0f, 1);
    for (int i = 0; i < 50; ++i) b3DestroyBody(bodies[i]);
    b3Counters empty = b3World_GetCounters(id);
    CHECK(empty.bodyCount == 0 && empty.shapeCount == 0 && empty.contactCount == 0 && empty.jointCount == 0);
    CHECK(!b3Body_IsValid(bodies[3]) && !b3Shape_IsValid(shapes[3]) &&
        !b3Joint_IsValid(joint) && !b3Contact_IsValid(contact));
    CHECK(world->names.entries.count > 0 && retired_events(world) > 0);
    rejected(id, false, b3_emptyTrimUnacknowledgedEvents);
    trim_to_baseline(id, initial, module);
    /* Zero-work trim and a real subsequent step cannot reset the original baseline. */
    CHECK(b3World_TrimEmptyStorage(id, false) == b3_emptyTrimSuccess);
    CHECK(b3World_GetCounters(id).byteCount == initial && b3GetByteCount() == module);
    uint64_t step = world->stepIndex;
    b3World_Step(id, 1.0f / 60.0f, 1);
    CHECK(world->stepIndex > step);
    trim_to_baseline(id, initial, module);
    close_world(id, before);
}

static void hundred_cycles(void)
{
    int64_t before = b3GetByteCount();
    b3WorldDef def = world_def(0);
    b3WorldId id = b3CreateWorld(&def);
    b3World* world = b3GetWorldFromId(id);
    int64_t initial = b3World_GetCounters(id).byteCount;
    int64_t module = b3GetByteCount();
    b3BodyId previous_body = b3_nullBodyId;
    b3ShapeId previous_shape = b3_nullShapeId;
    b3JointId previous_joint = b3_nullJointId;
    b3ContactId previous_contact = b3_nullContactId;
    for (int cycle = 0; cycle < 100; ++cycle) {
        uint32_t high[4];
        memcpy(high, world->identity.high, sizeof high);
        b3BodyId bodies[3];
        b3ShapeId shapes[3];
        for (int i = 0; i < 3; ++i) {
            bodies[i] = make_body(id, b3_dynamicBody, 0, 0, "cycle-body");
            shapes[i] = make_sphere(bodies[i], false);
            CHECK(b3Body_IsValid(bodies[i]) && bodies[i].generation > high[b3_bodyIdentity] &&
                b3Shape_IsValid(shapes[i]) && shapes[i].generation > high[b3_shapeIdentity]);
        }
        b3JointId joint = make_weld(id, bodies[0], bodies[1]);
        CHECK(b3Joint_IsValid(joint) && joint.generation > high[b3_jointIdentity]);
        uint64_t step = world->stepIndex;
        b3World_Step(id, 1.0f / 60.0f, 1);
        CHECK(world->stepIndex > step);
        b3ContactId contact = first_contact(bodies[2]);
        CHECK(b3Contact_IsValid(contact) && contact.generation > high[b3_contactIdentity]);
        CHECK(!b3Body_IsValid(previous_body) && !b3Shape_IsValid(previous_shape) &&
            !b3Joint_IsValid(previous_joint) && !b3Contact_IsValid(previous_contact));
        for (int i = 0; i < 3; ++i) b3DestroyBody(bodies[i]);
        CHECK(!b3Body_IsValid(bodies[0]) && !b3Shape_IsValid(shapes[0]) &&
            !b3Joint_IsValid(joint) && !b3Contact_IsValid(contact));
        trim_to_baseline(id, initial, module);
        previous_body = bodies[0];
        previous_shape = shapes[0];
        previous_joint = joint;
        previous_contact = contact;
    }
    /* After 100 trims, exercise newly grown indices in every identity family.
     * Twenty isolated overlapping pairs yield real contacts, not injected IDs. */
    uint32_t high[4];
    memcpy(high, world->identity.high, sizeof high);
    b3BodyId high_ids[40];
    for (int pair = 0; pair < 20; ++pair) {
        for (int side = 0; side < 2; ++side) {
            int index = 2 * pair + side;
            high_ids[index] = make_body(id, b3_dynamicBody, 5.0f * pair, 0, NULL);
            b3ShapeId shape = make_sphere(high_ids[index], false);
            CHECK(high_ids[index].index1 == index + 1 && high_ids[index].generation > high[b3_bodyIdentity] &&
                b3Body_IsValid(high_ids[index]) && shape.index1 == index + 1 &&
                shape.generation > high[b3_shapeIdentity] && b3Shape_IsValid(shape));
        }
        b3WeldJointDef joint_def = b3DefaultWeldJointDef();
        joint_def.base.bodyIdA = high_ids[2 * pair];
        joint_def.base.bodyIdB = high_ids[2 * pair + 1];
        joint_def.base.collideConnected = true;
        b3JointId joint = b3CreateWeldJoint(id, &joint_def);
        CHECK(joint.index1 == pair + 1 && joint.generation > high[b3_jointIdentity] && b3Joint_IsValid(joint));
    }
    b3World_Step(id, 1.0f / 60.0f, 1);
    CHECK(b3World_GetCounters(id).contactCount == 20 && world->contacts.count == 20);
    for (int index = 0; index < 20; ++index) {
        b3ContactId contact = {index + 1, (uint16_t)world->worldId, 0, world->contacts.data[index].generation};
        CHECK(contact.generation > high[b3_contactIdentity] && b3Contact_IsValid(contact));
    }
    for (int i = 0; i < 40; ++i) b3DestroyBody(high_ids[i]);
    trim_to_baseline(id, initial, module);
    CHECK(!b3Body_IsValid(previous_body) && !b3Contact_IsValid(previous_contact));
    close_world(id, before);
}

static void refusal_integrity(void)
{
    int64_t before = b3GetByteCount();
    CHECK(b3World_TrimEmptyStorage(b3_nullWorldId, true) == b3_emptyTrimInvalidWorld);
    CHECK(b3GetByteCount() == before);
    b3WorldDef def = world_def(0);
    b3WorldId id = b3CreateWorld(&def);
    b3World* world = b3GetWorldFromId(id);
#define REJECT_FIELD(field, value, result) do { \
    b3World saved = *world; \
    world->field = (value); \
    rejected(id, true, (result)); \
    world->field = saved.field; \
} while (0)
    REJECT_FIELD(locked, true, b3_emptyTrimLocked);
    REJECT_FIELD(activeTaskCount, 1, b3_emptyTrimBusy);
    REJECT_FIELD(userTreeTask, world, b3_emptyTrimBusy);
    REJECT_FIELD(stack.allocation, 1, b3_emptyTrimBusy);
    REJECT_FIELD(stack.index, 1, b3_emptyTrimBusy);
    REJECT_FIELD(stack.entryCount, 1, b3_emptyTrimBusy);
    REJECT_FIELD(broadPhase.movedSiblings, (int*)world, b3_emptyTrimBusy);
    REJECT_FIELD(splitIslandId, 0, b3_emptyTrimBusy);
    REJECT_FIELD(identity.contactExhausted, 1, b3_emptyTrimFaulted);
    REJECT_FIELD(identity.floor[b3_bodyIdentity], 1, b3_emptyTrimInconsistent);
#undef REJECT_FIELD
    for (int kind = 0; kind < b3_identityKindCount; ++kind) {
        uint32_t old = world->identity.high[kind];
        world->identity.high[kind] = kind == b3_contactIdentity ? UINT32_MAX : UINT16_MAX;
        rejected(id, true, b3_emptyTrimIdentityExhausted);
        world->identity.high[kind] = old;
    }
    b3BodyId live = make_body(id, b3_dynamicBody, 0, 0, NULL);
    rejected(id, true, b3_emptyTrimNonempty);
    CHECK(b3Body_IsValid(live));
    b3DestroyBody(live);
    b3Recording* recording = b3CreateRecording(4096);
    b3World_StartRecording(id, recording);
    int recording_size = b3Recording_GetSize(recording);
    rejected(id, true, b3_emptyTrimRecording);
    CHECK(b3Recording_GetSize(recording) == recording_size);
    b3World_StopRecording(id);
    b3DestroyRecording(recording);
    CHECK(b3World_TrimEmptyStorage(id, true) == b3_emptyTrimSuccess);
    close_world(id, before);
}

static void world_isolation(void)
{
    int64_t before = b3GetByteCount();
    b3WorldDef def = world_def(0);
    b3WorldId a = b3CreateWorld(&def), b = b3CreateWorld(&def);
    b3BodyId kept = make_body(b, b3_dynamicBody, 0, 0, "keep-other-world");
    b3ShapeId shape = make_sphere(kept, false);
    b3World* other = b3GetWorldFromId(b);
    unsigned char snapshot[sizeof(b3World)];
    memcpy(snapshot, other, sizeof snapshot);
    int64_t ledger = b3World_GetCounters(b).byteCount;
    CHECK(b3World_TrimEmptyStorage(a, true) == b3_emptyTrimSuccess);
    CHECK(memcmp(snapshot, other, sizeof snapshot) == 0 && b3World_GetCounters(b).byteCount == ledger);
    CHECK(b3Body_IsValid(kept) && b3Shape_IsValid(shape));
    b3World_Step(b, 1.0f / 60.0f, 1);
    CHECK(other->stepIndex > 0 && !b3World_HasIdentityFault(b));
    b3DestroyWorld(a);
    close_world(b, before);
}

/* A cooked mesh is caller-owned. Trimming a world must not destroy it;
 * a second world must still be able to use the exact mesh after the first closes. */
static void caller_owned_mesh(void)
{
    int64_t before = b3GetByteCount();
    b3MeshData* mesh = b3CreateGridMesh(3, 3, 2.0f, 1, true);
    CHECK(mesh != NULL && mesh->byteCount > 0 && mesh->triangleCount > 0);
    int64_t held = b3GetByteCount();
    uint64_t mesh_hash = hash_bytes(UINT64_C(14695981039346656037), mesh, (size_t)mesh->byteCount);
    for (int pass = 0; pass < 2; ++pass) {
        b3WorldDef def = world_def(0);
        b3WorldId id = b3CreateWorld(&def);
        int64_t initial = b3World_GetCounters(id).byteCount;
        int64_t module = b3GetByteCount();
        b3BodyId ground = make_body(id, b3_staticBody, 0, 0, "caller-owned-mesh");
        b3BodyId ball = make_body(id, b3_dynamicBody, 0, 0.5f, "mesh-ball");
        b3ShapeDef shape_def = b3DefaultShapeDef();
        shape_def.enableContactEvents = true;
        b3ShapeId shape = b3CreateMeshShape(ground, &shape_def, mesh, b3Vec3_one);
        b3ShapeId ball_shape = make_sphere(ball, false);
        CHECK(b3Shape_IsValid(shape) && b3Shape_IsValid(ball_shape));
        b3World_Step(id, 1.0f / 60.0f, 1);
        CHECK(b3World_GetCounters(id).contactCount > 0);
        b3DestroyBody(ball);
        b3DestroyBody(ground);
        trim_to_baseline(id, initial, module);
        CHECK(hash_bytes(UINT64_C(14695981039346656037), mesh, (size_t)mesh->byteCount) == mesh_hash);
        close_world(id, held);
    }
    b3DestroyMesh(mesh);
    CHECK(b3GetByteCount() == before);
}

static void sleeping_and_disabled(void)
{
    int64_t before = b3GetByteCount();
    b3WorldDef def = world_def(0);
    b3WorldId id = b3CreateWorld(&def);
    b3World* world = b3GetWorldFromId(id);
    int64_t initial = b3World_GetCounters(id).byteCount;
    int64_t module = b3GetByteCount();
    b3BodyId bodies[3];
    for (int i = 0; i < 3; ++i) {
        bodies[i] = make_body(id, b3_dynamicBody, 4.0f * i, 0, "retired-solver-set");
        b3ShapeId shape = make_sphere(bodies[i], false);
        CHECK(b3Shape_IsValid(shape));
    }
    b3JointId joint = make_weld(id, bodies[0], bodies[1]);
    CHECK(b3Joint_IsValid(joint));
    b3World_Step(id, 1.0f / 60.0f, 1);
    b3Body_SetAwake(bodies[0], false);
    CHECK(!b3Body_IsAwake(bodies[0]) && !b3Body_IsAwake(bodies[1]) &&
        world->bodies.data[bodies[0].index1 - 1].setIndex >= b3_firstSleepingSet &&
        b3GetIdCount(&world->solverSetIdPool) > b3_firstSleepingSet);
    b3Body_Disable(bodies[2]);
    CHECK(!b3Body_IsEnabled(bodies[2]) && world->bodies.data[bodies[2].index1 - 1].setIndex == b3_disabledSet);
    rejected(id, true, b3_emptyTrimNonempty);
    for (int i = 0; i < 3; ++i) b3DestroyBody(bodies[i]);
    trim_to_baseline(id, initial, module);
    close_world(id, before);
}

/* Explicit test-only ACK branch coverage. These zero records are injected,
 * NOT physics events. The mixed-scene group separately observes real events. */
static void private_event_ack(void)
{
    int64_t before = b3GetByteCount();
    b3WorldDef def = world_def(0);
    b3WorldId id = b3CreateWorld(&def);
    b3World* world = b3GetWorldFromId(id);
    int64_t initial = b3World_GetCounters(id).byteCount;
    int64_t module = b3GetByteCount();
    for (int role = 0; role < 2; ++role) {
        world->endEventArrayIndex = role;
        b3Array_Push(world->bodyMoveEvents, (b3BodyMoveEvent){0});
        b3Array_Push(world->sensorBeginEvents, (b3SensorBeginTouchEvent){0});
        b3Array_Push(world->contactBeginEvents, (b3ContactBeginTouchEvent){0});
        b3Array_Push(world->sensorEndEvents[0], (b3SensorEndTouchEvent){0});
        b3Array_Push(world->sensorEndEvents[1], (b3SensorEndTouchEvent){0});
        b3Array_Push(world->contactEndEvents[0], (b3ContactEndTouchEvent){0});
        b3Array_Push(world->contactEndEvents[1], (b3ContactEndTouchEvent){0});
        b3Array_Push(world->contactHitEvents, (b3ContactHitEvent){0});
        b3Array_Push(world->jointEvents, (b3JointEvent){0});
        CHECK(retired_events(world) == 9);
        rejected(id, false, b3_emptyTrimUnacknowledgedEvents);
        trim_to_baseline(id, initial, module);
        CHECK(b3World_TrimEmptyStorage(id, false) == b3_emptyTrimSuccess);
        CHECK(b3World_GetCounters(id).byteCount == initial && b3GetByteCount() == module);
    }
    close_world(id, before);
}

static bool fail_allocations;
static unsigned failed_requests;
static void* oom_alloc(size_t size, int32_t alignment)
{
    if (fail_allocations) {
        ++failed_requests;
        fprintf(stderr, "STORAGE_OOM_RETURN_NULL request=%u size=%zu alignment=%d\n", failed_requests, size, alignment);
        fflush(stderr);
        return NULL;
    }
    size_t align = (size_t)alignment;
    if (align < sizeof(void*)) align = sizeof(void*);
    size_t rounded = (size + align - 1) & ~(align - 1);
    return aligned_alloc(align, rounded);
}
static void oom_free(void* pointer, size_t size)
{
    (void)size;
    free(pointer);
}
static int ignore_assert(const char* condition, const char* file, int line)
{
    fprintf(stderr, "STORAGE_OOM_ASSERT_IGNORED %s %s:%d\n", condition, file, line);
    return 0;
}
static int oom_case(void)
{
    /* Install before any world allocation so free uses the matching allocator.
     * Returning 0 from asserts proves fatal OOM is not merely a Debug breakpoint. */
    b3SetAllocator(oom_alloc, oom_free);
    b3SetAssertFcn(ignore_assert);
    b3WorldDef def = world_def(0);
    b3WorldId id = b3CreateWorld(&def);
    if (!b3World_IsValid(id)) return 2;
    b3BodyId bodies[50];
    for (int i = 0; i < 50; ++i) {
        bodies[i] = make_body(id, b3_dynamicBody, 4.0f * i, 0, "oom-retired-body");
        if (!b3Body_IsValid(bodies[i])) return 2;
    }
    for (int i = 0; i < 50; ++i) b3DestroyBody(bodies[i]);
    fail_allocations = true;
    fprintf(stderr, "STORAGE_OOM_ARMED\n");
    fflush(stderr);
    b3EmptyTrimResult result = b3World_TrimEmptyStorage(id, true);
    /* A returned enum is never accepted as the expected fatal-allocation test. */
    fprintf(stderr, "STORAGE_OOM_UNEXPECTED_RETURN result=%d failedRequests=%u\n", (int)result, failed_requests);
    return 2;
}
#endif

int main(int argc, char** argv)
{
#ifndef AIR_STORAGE_BASELINE_ONLY
    if (argc == 2 && strcmp(argv[1], "--oom") == 0) return oom_case();
#endif
    if (argc != 1) return 2;
    (void)argv;
    int64_t before = b3GetByteCount();
    b3WorldDef def = world_def(0);
    b3WorldId id = b3CreateWorld(&def);
    int64_t initial = b3World_GetCounters(id).byteCount;
    CHECK(b3World_IsValid(id));
    b3DestroyWorld(id);
    CHECK(b3GetByteCount() == before);
#ifdef AIR_STORAGE_BASELINE_ONLY
    printf("{\"profile\":\"air-box3d-empty-storage-identity-control-v1\",\"status\":\"PASS\","
        "\"checks\":%u,\"initialLedgerBytes\":%" PRId64 ",\"trimEnabled\":false}\n", checks, initial);
#else
    CHECK(sizeof(b3Capacity) == 20 && sizeof(b3IdentityState) == 36);
    /* Successful-path source arithmetic, NOT an execution result:
     * defaultMixed 112 + customMixed 112 + cycles 3206 + refusals 71 + isolation 6 +
     * mesh 56 + sleepingDisabled 34 + privateEventAck 60 + main 4 = 3661. */
    unsigned groups[9];
    unsigned start = checks;
    mixed_scene(0);
    groups[0] = checks - start;
    start = checks;
    mixed_scene(1);
    groups[1] = checks - start;
    start = checks;
    hundred_cycles();
    groups[2] = checks - start;
    start = checks;
    refusal_integrity();
    groups[3] = checks - start;
    start = checks;
    world_isolation();
    groups[4] = checks - start;
    start = checks;
    caller_owned_mesh();
    groups[5] = checks - start;
    start = checks;
    sleeping_and_disabled();
    groups[6] = checks - start;
    start = checks;
    private_event_ack();
    groups[7] = checks - start;
    CHECK(b3GetByteCount() == before);
    groups[8] = 4;
    printf("{\"profile\":\"air-box3d-empty-storage-native-v1\",\"status\":\"PASS\","
        "\"checks\":%u,\"initialLedgerBytes\":%" PRId64 ",\"creationCapacityLedgerBytes\":20,"
        "\"identityMetadataLedgerBytes\":36,\"fixedMetadataLedgerBytes\":56,\"trimEnabled\":true,"
        "\"sameWorldCycles\":100,\"moduleAfterClose\":%" PRId64 ",\"groups\":{\"defaultMixed\":%u,"
        "\"customMixed\":%u,\"cycles\":%u,\"refusals\":%u,\"isolation\":%u,"
        "\"callerOwnedMesh\":%u,\"sleepingDisabled\":%u,\"privateEventAck\":%u,\"main\":%u}}\n",
        checks, initial, b3GetByteCount(), groups[0], groups[1], groups[2], groups[3], groups[4], groups[5], groups[6], groups[7], groups[8]);
#endif
    return 0;
}
