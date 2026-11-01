/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Independent native qualification fixture ONLY. Never linked into the production module.
 * Exact production .c sources are included to reach private readonly arithmetic branches.
 * Temporary state/counter injections below are test inputs, never production measurements. */
#include "world_bridge.c"
#include "physics_world.h"
#include "memory_diagnostics.h"
#include <limits.h>
#include <stdio.h>

static int inject_counter_mismatch;
static int core_counter_calls;
static b3Counters fixture_counters(b3WorldId id) {
    ++core_counter_calls;
    b3Counters result = b3World_GetCounters(id);
    if (inject_counter_mismatch) ++result.byteCount;
    return result;
}
#define b3World_GetCounters fixture_counters
#include "memory_diagnostics.c"
#undef b3World_GetCounters
#undef CHECK
#define T(x) do { ++checks; if (!(x)) { fprintf(stderr, "memory contract line %d: %s\n", __LINE__, #x); return 1; } } while (0)
static uint64_t u64(const uint32_t* p) { return (uint64_t)p[0] | ((uint64_t)p[1] << 32); }
static int unchanged(const uint32_t* p, int count) {
    for (int i = 0; i < count; ++i) if (p[i] != 0xa5a5a5a5u) return 0;
    return 1;
}
static void canary(uint32_t* p, int count) { for (int i = 0; i < count; ++i) p[i] = 0xa5a5a5a5u; }
static uint64_t classified(const uint32_t* p) {
    uint64_t result = 0;
    for (int i = 0; i < AIR_B3_MEMORY_ROW_COUNT; ++i)
        result += u64(p + AIR_B3_MEMORY_HEADER_WORDS + AIR_B3_MEMORY_ROW_WORDS * i + 6);
    return result;
}
int main(void) {
    int checks = 0;
    int64_t baseline = b3GetByteCount();
    uint32_t world = air_b3_world_create(0, -10, 0), other = air_b3_world_create(0, -10, 0);
    T(world && other && world != other);
    uint32_t a[AIR_B3_MEMORY_WORDS], b[AIR_B3_MEMORY_WORDS];
    T(air_b3_world_memory_diagnostics_v2(world, a, AIR_B3_MEMORY_WORDS) == AIR_B3_OK);
    T(a[3] == world && u64(a + 4) == 0 && classified(a) == u64(a + 6));
    T(a[8] == 0 && a[9] == 0 && a[10] == 0 && a[11] == 0);
    T(u64(a + 22) == (uint64_t)b3GetByteCount());
    uint32_t wm[6], om[6], gm[6];
    T(air_b3_bridge_memory(world, wm) == AIR_B3_OK && air_b3_bridge_memory(other, om) == AIR_B3_OK);
    T(air_b3_bridge_memory(0, gm) == AIR_B3_OK);
    T(!memcmp(a + 24, wm, sizeof(wm)) && !memcmp(a + 30, gm, sizeof(gm)));
    T(u64(gm) == u64(wm) + u64(om) && gm[2] == wm[2] + om[2]);
    T(air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS) == AIR_B3_OK && !memcmp(a, b, sizeof(a)));
    canary(b, AIR_B3_MEMORY_WORDS);
    T(air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS - 1) == AIR_B3_CAPACITY);
    T(unchanged(b, AIR_B3_MEMORY_WORDS));
    T(air_b3_world_memory_diagnostics_v2(0, b, AIR_B3_MEMORY_WORDS) == AIR_B3_INVALID);
    T(unchanged(b, AIR_B3_MEMORY_WORDS));
    T(air_b3_world_memory_diagnostics_v2(world, NULL, AIR_B3_MEMORY_WORDS) == AIR_B3_ARGUMENT);
    b3World* native = b3GetWorldFromId(b3LoadWorldId(world));
    int calls = core_counter_calls;
    native->locked = true;
    int status = air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS);
    native->locked = false;
    T(status == AIR_B3_LOCKED && core_counter_calls == calls && unchanged(b, AIR_B3_MEMORY_WORDS));
    int oldCapacity = native->bodies.capacity;
    native->bodies.capacity = INT_MAX; /* Fixture-only arithmetic overflow; never dereference beyond actual storage. */
    status = air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS);
    native->bodies.capacity = oldCapacity;
    T(status == AIR_B3_CAPACITY && core_counter_calls == calls && unchanged(b, AIR_B3_MEMORY_WORDS));
    inject_counter_mismatch = 1;
    status = air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS);
    inject_counter_mismatch = 0;
    T(status == AIR_B3_MEMORY_INCONSISTENT && unchanged(b, AIR_B3_MEMORY_WORDS));
    BridgeWorld* bridge = find_world(world);
    uint64_t oldBytes = bridge->bytes;
    bridge->bytes = UINT64_MAX;
    canary(gm, 6);
    status = air_b3_bridge_memory(0, gm);
    bridge->bytes = oldBytes;
    T(status == AIR_B3_CAPACITY && unchanged(gm, 6));
    uint32_t oldAllocations = bridge->allocations;
    bridge->allocations = UINT32_MAX;
    status = air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS);
    bridge->allocations = oldAllocations;
    T(status == AIR_B3_CAPACITY && unchanged(b, AIR_B3_MEMORY_WORDS));
    float bodyInput[AIR_B3_BODY_INPUT_FLOATS] = {0}; bodyInput[6] = 1; bodyInput[15] = 1;
    uint32_t body[2], shape[2];
    T(air_b3_body_create(world, 2, bodyInput, 0, body) == AIR_B3_OK);
    T(air_b3_shape_sphere(body[0], body[1], 0.5f, 1.0f, shape) == AIR_B3_OK);
    T(air_b3_world_memory_diagnostics_v2(world, a, AIR_B3_MEMORY_WORDS) == AIR_B3_OK);
    T(a[8] == 1 && a[9] == 1 && classified(a) == u64(a + 6));
    T(air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS) == AIR_B3_OK && !memcmp(a, b, sizeof(a)));
    /* A real step must rebuild the nonempty dynamic tree; do not inject rebuildCapacity. */
    T(air_b3_world_step(world, 1.0f / 60.0f, 1) == AIR_B3_OK);
    b3DynamicTree* tree = native->broadPhase.trees + b3_dynamicBody;
    int rebuiltCapacity = tree->rebuildCapacity;
    T(rebuiltCapacity > 0 && tree->leafIndices && tree->leafNodes && tree->leafCenters &&
        tree->leafBoxes == NULL && tree->binIndices == NULL);
    T(air_b3_world_memory_diagnostics_v2(world, a, AIR_B3_MEMORY_WORDS) == AIR_B3_OK &&
        u64(a + 4) == 1 && classified(a) == u64(a + 6));
    const uint32_t* boxes = a + AIR_B3_MEMORY_HEADER_WORDS + AIR_B3_MEMORY_ROW_WORDS * M_TREE_DYNAMIC_LEAFBOXES;
    const uint32_t* bins = a + AIR_B3_MEMORY_HEADER_WORDS + AIR_B3_MEMORY_ROW_WORDS * M_TREE_DYNAMIC_BININDICES;
    T(boxes[1] == 2 && bins[1] == 2 && u64(boxes + 2) == 0 && u64(bins + 2) == 0 &&
        u64(boxes + 4) == (uint64_t)rebuiltCapacity && u64(bins + 4) == (uint64_t)rebuiltCapacity &&
        u64(boxes + 6) == (uint64_t)rebuiltCapacity * sizeof(b3AABB) &&
        u64(bins + 6) == (uint64_t)rebuiltCapacity * sizeof(int32_t));
    T(air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS) == AIR_B3_OK && !memcmp(a, b, sizeof(a)));
    canary(b, AIR_B3_MEMORY_WORDS);
    calls = core_counter_calls;
    b3Vec3* centers = tree->leafCenters;
    tree->leafCenters = NULL; /* Fixture-only missing required backing, restored before any physics. */
    status = air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS);
    tree->leafCenters = centers;
    T(status == AIR_B3_MEMORY_INCONSISTENT && core_counter_calls == calls && unchanged(b, AIR_B3_MEMORY_WORDS));
    tree->leafBoxes = (b3AABB*)centers; /* Fixture-only unexpected inactive backing; never dereferenced. */
    status = air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS);
    tree->leafBoxes = NULL;
    T(status == AIR_B3_MEMORY_INCONSISTENT && core_counter_calls == calls && unchanged(b, AIR_B3_MEMORY_WORDS));
    T(air_b3_body_destroy(body[0], body[1]) == AIR_B3_OK);
    T(air_b3_world_memory_diagnostics_v2(world, a, AIR_B3_MEMORY_WORDS) == AIR_B3_OK);
    T(a[8] == 0 && a[9] == 0 && u64(a + 4) == 1 && classified(a) == u64(a + 6) &&
        tree->rebuildCapacity == rebuiltCapacity && tree->leafBoxes == NULL && tree->binIndices == NULL);
    /* Retained capacity is observed, never substituted for the original C20 acceptance baseline. */
    T(air_b3_world_memory_diagnostics_v2(world, b, AIR_B3_MEMORY_WORDS) == AIR_B3_OK && !memcmp(a, b, sizeof(a)));
    T(air_b3_world_destroy(world) == AIR_B3_OK && air_b3_world_destroy(other) == AIR_B3_OK);
    T(b3GetByteCount() == baseline);
    T(air_b3_bridge_memory(0, gm) == AIR_B3_OK && u64(gm) == 0 && gm[2] == 0);
    printf("{\"schema\":\"air-box3d-memory-native-contract-v2\",\"status\":\"PASS\",\"pointerBytes\":%zu,"
        "\"coreSha\":\"%s\",\"schemaSha256\":\"%s\",\"patchChainSha256\":\"%s\","
        "\"checks\":%d,\"controlledFixture\":true,\"injectionsAreProductionObservations\":false,"
        "\"rowCount\":%d,\"wireWords\":%d,\"readonlyRepeat\":true,\"initialZeroStep\":true,"
        "\"liveAndReleasedWorld\":true,\"sumMatchesCore\":true,\"trueGlobalBridge\":true,"
        "\"invalidNoWrite\":true,\"shortNoWrite\":true,\"lockedBeforeCoreGetter\":true,"
        "\"overflowBeforeCoreGetter\":true,\"injectedMismatchNoWrite\":true,\"bridgeOverflowNoWrite\":true,"
        "\"postStepRebuildAndRelease\":true,\"inactiveScratchLedgerNotAllocation\":true,"
        "\"requiredScratchNullNoWrite\":true,\"unexpectedInactiveBackingNoWrite\":true,"
        "\"finalCoreDelta\":0,\"finalBridgeBytes\":0}\n", sizeof(void*), air_b3_core_sha(), air_b3_schema_sha(), air_b3_patch_chain_sha(),
        checks, AIR_B3_MEMORY_ROW_COUNT, AIR_B3_MEMORY_WORDS);
    return 0;
}
