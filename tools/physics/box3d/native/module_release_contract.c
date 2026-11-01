/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Real module-local lifetime qualification, without simulation steps or private
 * injection. Link normal production bridge translation units, including world
 * and mesh; do NOT include their .c files here. Not an all-allocation census. */
#include "air_box3d.h"
#include "mesh_bridge.h"
#include "world_bridge.h"
#include <box3d/box3d.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum Field {
    CORE_WORLDS, CORE_BYTES, BRIDGE_WORLDS, BRIDGE_ALLOCS, BRIDGE_BYTES,
    DEBUG_SHAPES, TEMP_NODES, TEMP_BYTES, WIRE_BUFFERS, WIRE_CAPACITY,
    WIRE_LENGTH, CAPTURED_WORLDS, MESH_RESOURCES, MESH_LEASES,
    MESH_REFS, MESH_BORROWS, MESH_STORAGE
};
static unsigned checks;
#define CHECK(name, expression) do { \
    ++checks; \
    if (!(expression)) { \
        fprintf(stderr, "FAIL %s line=%d expression=%s\n", name, __LINE__, #expression); \
        exit(1); \
    } \
} while (0)

static uint64_t field(const uint32_t *words, enum Field f) {
    unsigned at = 4 + 2 * (unsigned)f;
    return (uint64_t)words[at] | ((uint64_t)words[at + 1] << 32);
}
static void snapshot(uint32_t *words) {
    CHECK("snapshot-success", air_b3_module_release_snapshot_v1(words, AIR_B3_MODULE_RELEASE_WORDS) == AIR_B3_OK);
    CHECK("snapshot-header", words[0] == 1 && words[1] == 38 && words[2] == 17 && words[3] == 0);
}
static void registered_zero(const uint32_t *words) {
    for (int f = BRIDGE_WORLDS; f <= MESH_STORAGE; ++f)
        CHECK("registered-field-zero", field(words, (enum Field)f) == 0);
}
static void static_body(uint32_t world, float x, uint32_t *body) {
    const float input[16] = {x,0,0, 0,0,0,1, 0,0,0, 0,0,0, 0,0,1};
    CHECK("static-body-create", air_b3_body_create(world, 0, input, 1, body) == AIR_B3_OK);
}

static void print_words(const char *name, const uint32_t *words) {
    printf(",\"%s\":[", name);
    for (unsigned i = 0; i < 38; ++i) printf("%s%u", i ? "," : "", (unsigned)words[i]);
    printf("]");
}

int main(void) {
    uint32_t baseline[38], readback[38], active[38], before[38], invalid[38];
    uint32_t direct_words[38], mesh_words[38], temporary_words[38], debug_words[38], borrowed_words[38];
    CHECK("wire-size", AIR_B3_MODULE_RELEASE_WORDS == 38);
    snapshot(baseline);
    CHECK("fresh-core-worlds-zero", field(baseline, CORE_WORLDS) == 0);
    registered_zero(baseline);
    snapshot(readback);
    CHECK("baseline-repeat-read", memcmp(readback, baseline, sizeof baseline) == 0);

    for (unsigned i = 0; i < 38; ++i) invalid[i] = UINT32_C(0x9a71cc03) + i;
    memcpy(before, invalid, sizeof invalid);
    CHECK("null-output-rejected", air_b3_module_release_snapshot_v1(NULL, 38) != AIR_B3_OK);
    CHECK("short-output-rejected", air_b3_module_release_snapshot_v1(invalid, 37) != AIR_B3_OK);
    CHECK("short-output-untouched", memcmp(invalid, before, sizeof invalid) == 0);
    CHECK("negative-capacity-rejected", air_b3_module_release_snapshot_v1(invalid, -1) != AIR_B3_OK);
    CHECK("negative-output-untouched", memcmp(invalid, before, sizeof invalid) == 0);
    snapshot(readback);
    CHECK("invalid-read-no-state-change", memcmp(readback, baseline, sizeof baseline) == 0);

    /* Real negative: a core world that the bridge never registered. A JS/bridge
     * world count alone would miss it. This fixture owns and destroys it. */
    b3WorldDef definition = b3DefaultWorldDef();
    definition.workerCount = 1;
    b3WorldId direct = b3CreateWorld(&definition);
    CHECK("direct-core-world-valid", b3World_IsValid(direct));
    snapshot(active);
    CHECK("direct-world-detected", field(active, CORE_WORLDS) == 1);
    CHECK("direct-world-not-bridge", field(active, BRIDGE_WORLDS) == 0);
    CHECK("direct-world-allocated", field(active, CORE_BYTES) > field(baseline, CORE_BYTES));
    registered_zero(active);
    memcpy(direct_words, active, sizeof active);
    b3DestroyWorld(direct);
    snapshot(readback);
    CHECK("direct-world-restored", memcmp(readback, baseline, sizeof baseline) == 0);

    uint32_t world = air_b3_world_create(0, -10, 0);
    CHECK("bridge-world-create", world != 0);
    const float positions[12] = {-.5f,0,-.5f, .5f,0,-.5f, .5f,0,.5f, -.5f,0,.5f};
    const int32_t indices[6] = {0,2,1, 0,3,2};
    uint32_t resource[2], bodies[2][2], shapes[2][2];
    CHECK("real-mesh-cook", air_b3_mesh_cook(world, positions, 4, 12, indices, 2, 6, resource) == AIR_B3_OK);
    CHECK("real-mesh-retain", air_b3_mesh_retain(world, resource[0], resource[1]) == AIR_B3_OK);
    for (int i = 0; i < 2; ++i) {
        static_body(world, (float)(i * 3), bodies[i]);
        CHECK("real-mesh-borrow", air_b3_mesh_shape_create(world, bodies[i][0], bodies[i][1], resource[0], resource[1], shapes[i]) == AIR_B3_OK);
    }
    snapshot(active);
    CHECK("owned-world-counts", field(active, CORE_WORLDS) == 1 && field(active, BRIDGE_WORLDS) == 1);
    CHECK("owned-bridge-live", field(active, BRIDGE_ALLOCS) > 1 && field(active, BRIDGE_BYTES) > 0);
    CHECK("mesh-real-live-counts", field(active, MESH_RESOURCES) == 1 && field(active, MESH_LEASES) == 2 && field(active, MESH_REFS) == 2 && field(active, MESH_BORROWS) == 2);
    CHECK("mesh-storage-subset", field(active, MESH_STORAGE) > 0 && field(active, MESH_STORAGE) <= field(active, BRIDGE_BYTES));
    snapshot(readback);
    CHECK("active-repeat-read", memcmp(readback, active, sizeof active) == 0);
    memcpy(mesh_words, active, sizeof active);

    memcpy(before, active, sizeof before);
    void *temporary = air_b3_bridge_temp_alloc(world, 37);
    CHECK("real-temporary-allocation", temporary != NULL);
    snapshot(active);
    CHECK("temporary-node-delta", field(active, TEMP_NODES) == field(before, TEMP_NODES) + 1);
    CHECK("temporary-byte-delta", field(active, TEMP_BYTES) >= field(before, TEMP_BYTES) + 37);
    CHECK("temporary-bridge-accounted", field(active, BRIDGE_ALLOCS) == field(before, BRIDGE_ALLOCS) + 1 && field(active, BRIDGE_BYTES) > field(before, BRIDGE_BYTES));
    memcpy(temporary_words, active, sizeof active);
    air_b3_bridge_temp_free(world, temporary, 37);
    snapshot(active);
    CHECK("temporary-release-restored", memcmp(active, before, sizeof before) == 0);

    uint32_t debug_size = 0;
    CHECK("real-debug-capture", air_b3_world_debug_capture(world, 1, 1, &debug_size) == AIR_B3_OK);
    CHECK("debug-nonempty", debug_size > 0);
    snapshot(active);
    CHECK("debug-shapes-live", field(active, DEBUG_SHAPES) == 2);
    CHECK("debug-wire-live", field(active, WIRE_BUFFERS) == 1 && field(active, WIRE_CAPACITY) >= field(active, WIRE_LENGTH) && field(active, WIRE_LENGTH) > 0 && field(active, CAPTURED_WORLDS) == 1);
    memcpy(debug_words, active, sizeof active);
    CHECK("real-debug-release", air_b3_world_debug_release(world) == AIR_B3_OK);
    snapshot(active);
    CHECK("debug-wire-released", field(active, WIRE_BUFFERS) == 0 && field(active, WIRE_CAPACITY) == 0 && field(active, WIRE_LENGTH) == 0 && field(active, CAPTURED_WORLDS) == 0);
    CHECK("debug-cache-still-owned", field(active, DEBUG_SHAPES) == 2);

    CHECK("release-first-lease", air_b3_mesh_release(world, resource[0], resource[1]) == AIR_B3_OK);
    CHECK("release-second-lease", air_b3_mesh_release(world, resource[0], resource[1]) == AIR_B3_OK);
    snapshot(active);
    CHECK("borrow-survives-no-leases", field(active, MESH_LEASES) == 0 && field(active, MESH_RESOURCES) == 1 && field(active, MESH_REFS) == 2 && field(active, MESH_BORROWS) == 2);
    memcpy(borrowed_words, active, sizeof active);
    CHECK("destroy-one-shape", air_b3_shape_destroy(shapes[0][0], shapes[0][1]) == AIR_B3_OK);
    snapshot(active);
    CHECK("remaining-borrow-detected", field(active, MESH_LEASES) == 0 && field(active, MESH_RESOURCES) == 1 && field(active, MESH_REFS) == 1 && field(active, MESH_BORROWS) == 1);
    CHECK("destroy-world-cleans-last-borrow", air_b3_world_destroy(world) == AIR_B3_OK);
    snapshot(readback);
    CHECK("final-core-worlds-zero", field(readback, CORE_WORLDS) == 0);
    registered_zero(readback);
    CHECK("final-core-original-baseline", field(readback, CORE_BYTES) == field(baseline, CORE_BYTES));
    CHECK("final-all-fields-restored", memcmp(readback, baseline, sizeof baseline) == 0);

    printf("{\"profile\":\"air-box3d-module-release-native-v1\",\"schema\":\"air-box3d-module-release-native-v1\",\"status\":\"PASS\",\"checks\":%u,\"coreSha\":\"%s\",\"schemaSha256\":\"%s\",\"patchChainSha256\":\"%s\",\"snapshotWords\":38,\"globalCoreWorldNegative\":true,\"meshLeaseBorrowNegative\":true,\"noPartialOutput\":true,\"repeatedRead\":true,\"finalCoreDelta\":0,\"finalRegisteredStateZero\":true,\"controlledFixture\":true,\"simulationSteps\":0,\"pointerBytes\":%zu", checks, air_b3_core_sha(), air_b3_schema_sha(), air_b3_patch_chain_sha(), sizeof(void*));
    print_words("baselineWords", baseline);
    print_words("directCoreWords", direct_words);
    print_words("meshWords", mesh_words);
    print_words("temporaryWords", temporary_words);
    print_words("debugWords", debug_words);
    print_words("borrowedWords", borrowed_words);
    print_words("terminalWords", readback);
    printf("}\n");
    return 0;
}
