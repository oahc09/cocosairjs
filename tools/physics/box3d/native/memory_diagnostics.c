/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Read-only diagnostic ledger for exactly the source hashes in memory-diagnostics/v2/source-lock.json.
 * This re-expresses the pinned b3GetWorldByteCount formula with checked arithmetic.
 * It does not describe complete allocator ownership. The original core/vendor bytes stay untouched. */
#include "air_box3d.h"
#include "memory_diagnostics.h"
#include "mesh_bridge.h"
#include "physics_world.h"
#include "body.h"
#include "contact.h"
#include "hull.h"
#include "island.h"
#include "joint.h"
#include "sensor.h"
#include "shape.h"
#include "solver_set.h"
#include <box3d/box3d.h>
#include <box3d/collision.h>
#include <box3d/constants.h>
#include <limits.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/heap.h>
#endif
#ifdef __EMSCRIPTEN_PTHREADS__
#error "Memory diagnostics requires serialized ST module use"
#endif

enum {
    M_IDFREELIST_BODY = 0,
    M_IDFREELIST_SOLVERSET = 1,
    M_IDFREELIST_JOINT = 2,
    M_IDFREELIST_CONTACT = 3,
    M_IDFREELIST_ISLAND = 4,
    M_IDFREELIST_SHAPE = 5,
    M_WORLDARRAY_BODIES = 6,
    M_WORLDARRAY_SOLVERSETS = 7,
    M_WORLDARRAY_JOINTS = 8,
    M_WORLDARRAY_CONTACTS = 9,
    M_WORLDARRAY_ISLANDS = 10,
    M_WORLDARRAY_SHAPES = 11,
    M_WORLDARRAY_SENSORS = 12,
    M_ISLANDLINKS_BODIES = 13,
    M_ISLANDLINKS_CONTACTS = 14,
    M_ISLANDLINKS_JOINTS = 15,
    M_SENSOROWNED_HITS = 16,
    M_SENSOROWNED_OVERLAPS1 = 17,
    M_SENSOROWNED_OVERLAPS2 = 18,
    M_HULLS_MAP = 19,
    M_HULLS_DATA = 20,
    M_TREE_STATIC_INLINESTRUCT = 21,
    M_TREE_STATIC_NODES = 22,
    M_TREE_STATIC_PARENTS = 23,
    M_TREE_STATIC_PROXIES = 24,
    M_TREE_STATIC_SWAPNODES = 25,
    M_TREE_STATIC_LEAFINDICES = 26,
    M_TREE_STATIC_LEAFNODES = 27,
    M_TREE_STATIC_LEAFBOXES = 28,
    M_TREE_STATIC_LEAFCENTERS = 29,
    M_TREE_STATIC_BININDICES = 30,
    M_TREE_KINEMATIC_INLINESTRUCT = 31,
    M_TREE_KINEMATIC_NODES = 32,
    M_TREE_KINEMATIC_PARENTS = 33,
    M_TREE_KINEMATIC_PROXIES = 34,
    M_TREE_KINEMATIC_SWAPNODES = 35,
    M_TREE_KINEMATIC_LEAFINDICES = 36,
    M_TREE_KINEMATIC_LEAFNODES = 37,
    M_TREE_KINEMATIC_LEAFBOXES = 38,
    M_TREE_KINEMATIC_LEAFCENTERS = 39,
    M_TREE_KINEMATIC_BININDICES = 40,
    M_TREE_DYNAMIC_INLINESTRUCT = 41,
    M_TREE_DYNAMIC_NODES = 42,
    M_TREE_DYNAMIC_PARENTS = 43,
    M_TREE_DYNAMIC_PROXIES = 44,
    M_TREE_DYNAMIC_SWAPNODES = 45,
    M_TREE_DYNAMIC_LEAFINDICES = 46,
    M_TREE_DYNAMIC_LEAFNODES = 47,
    M_TREE_DYNAMIC_LEAFBOXES = 48,
    M_TREE_DYNAMIC_LEAFCENTERS = 49,
    M_TREE_DYNAMIC_BININDICES = 50,
    M_BROADPHASE_PAIRSET = 51,
    M_MANIFOLD_ALLOCATORARRAY = 52,
    M_MANIFOLD_BLOCKDIRECTORY = 53,
    M_MANIFOLD_BLOCKSTORAGE = 54,
    M_SOLVERSET_BODYSIMS = 55,
    M_SOLVERSET_BODYSTATES = 56,
    M_SOLVERSET_JOINTSIMS = 57,
    M_SOLVERSET_CONTACTINDICES = 58,
    M_SOLVERSET_ISLANDSIMS = 59,
    M_GRAPH_BODYBITS = 60,
    M_GRAPH_CONVEXCONTACTS = 61,
    M_GRAPH_CONTACTS = 62,
    M_GRAPH_JOINTSIMS = 63,
    M_TASK_CONTEXTARRAY = 64,
    M_TASK_SENSORHITS = 65,
    M_TASK_PAIRKEYS = 66,
    M_TASK_CONTACTSTATEBITS = 67,
    M_TASK_JOINTSTATEBITS = 68,
    M_TASK_HITEVENTBITS = 69,
    M_TASK_AWAKEISLANDBITS = 70,
    M_SENSORTASK_CONTEXTARRAY = 71,
    M_SENSORTASK_EVENTBITS = 72,
    M_EVENT_BODYMOVEEVENTS = 73,
    M_EVENT_SENSORBEGINEVENTS = 74,
    M_EVENT_CONTACTBEGINEVENTS = 75,
    M_EVENT_SENSORENDEVENTS0 = 76,
    M_EVENT_SENSORENDEVENTS1 = 77,
    M_EVENT_CONTACTENDEVENTS0 = 78,
    M_EVENT_CONTACTENDEVENTS1 = 79,
    M_EVENT_CONTACTHITEVENTS = 80,
    M_EVENT_JOINTEVENTS = 81,
    M_DEBUG_BODY = 82,
    M_DEBUG_JOINT = 83,
    M_DEBUG_CONTACT = 84,
    M_DEBUG_ISLAND = 85,
    M_STACK = 86,
    M_WORLDFIXED_IDENTITYHISTORY = 87,
    M_WORLDFIXED_CREATIONCAPACITY = 88
};
typedef struct MemoryRow { uint64_t count, capacity, bytes; uint32_t known; } MemoryRow;
static int add_u64(uint64_t* value, uint64_t add) {
    if (UINT64_MAX - *value < add) return AIR_B3_CAPACITY;
    *value += add; return AIR_B3_OK;
}
static int multiply(uint64_t a, uint64_t b, uint64_t* out) {
    if (b && a > UINT64_MAX / b) return AIR_B3_CAPACITY;
    *out = a * b; return AIR_B3_OK;
}
static int add_row(MemoryRow* row, uint64_t count, uint64_t capacity, uint64_t bytes, uint32_t known) {
    int s;
    if ((s = add_u64(&row->count, count)) || (s = add_u64(&row->capacity, capacity)) ||
        (s = add_u64(&row->bytes, bytes))) return s;
    row->known = known; return AIR_B3_OK;
}
static int array_row(MemoryRow* row, int count, int capacity, size_t element, const void* data) {
    if (count < 0 || capacity < count || (capacity && !data)) return AIR_B3_MEMORY_INCONSISTENT;
    uint64_t bytes; int s = multiply((uint64_t)capacity, element, &bytes);
    if (s || bytes > INT_MAX) return AIR_B3_CAPACITY;
    return add_row(row, (uint64_t)count, (uint64_t)capacity, bytes, 3);
}
static int bit_row(MemoryRow* row, const b3BitSet* bitset) {
    if (bitset->blockCount > bitset->blockCapacity || (bitset->blockCapacity && !bitset->bits))
        return AIR_B3_MEMORY_INCONSISTENT;
    uint64_t bytes; int s = multiply(bitset->blockCapacity, sizeof(uint64_t), &bytes);
    if (s || bytes > INT_MAX) return AIR_B3_CAPACITY;
    return add_row(row, bitset->blockCount, bitset->blockCapacity, bytes, 3);
}
static int storage_row(MemoryRow* row, int capacity, size_t element, const void* pointer) {
    if (capacity < 0 || (capacity && !pointer)) return AIR_B3_MEMORY_INCONSISTENT;
    uint64_t bytes; int s = multiply((uint64_t)capacity, element, &bytes);
    if (s || bytes > INT_MAX) return AIR_B3_CAPACITY;
    return add_row(row, 0, (uint64_t)capacity, bytes, 2); /* current used count not stored */
}
/* Pinned dynamic_tree.c uses B3_TREE_HEURISTIC == 0. leafBoxes/binIndices remain NULL,
 * but GetByteCount still charges shared rebuildCapacity for both. These are ledger estimates,
 * not backing allocations. Reject non-NULL here; never relax storage_row for active scratch. */
static int inactive_rebuild_row(MemoryRow* row, int capacity, size_t element, const void* pointer) {
    if (capacity < 0 || pointer != NULL) return AIR_B3_MEMORY_INCONSISTENT;
    uint64_t bytes; int s = multiply((uint64_t)capacity, element, &bytes);
    if (s || bytes > INT_MAX) return AIR_B3_CAPACITY;
    return add_row(row, 0, (uint64_t)capacity, bytes, 2);
}
static int int_group(const MemoryRow* rows, int begin, int end) {
    uint64_t bytes = 0;
    for (int i = begin; i <= end; ++i) {
        int s = add_u64(&bytes, rows[i].bytes); if (s) return s;
    }
    return bytes > INT_MAX ? AIR_B3_CAPACITY : AIR_B3_OK;
}
static void split(uint32_t* out, uint64_t value) { out[0] = (uint32_t)value; out[1] = (uint32_t)(value >> 32); }
static int output_region(uint32_t* out, int capacity) {
    if (!out || (uintptr_t)out % sizeof(uint32_t)) return AIR_B3_ARGUMENT;
    if (capacity < AIR_B3_MEMORY_WORDS) return AIR_B3_CAPACITY;
    const size_t bytes = AIR_B3_MEMORY_WORDS * sizeof(uint32_t);
    if ((uintptr_t)out > UINTPTR_MAX - bytes) return AIR_B3_ARGUMENT;
#ifdef __EMSCRIPTEN__
    if ((uintptr_t)out + bytes > emscripten_get_heap_size()) return AIR_B3_ARGUMENT;
#endif
    return AIR_B3_OK;
}
#define CHECK(call) do { int result_ = (call); if (result_) return result_; } while (0)
#define ARRAY(row, a) CHECK(array_row(&rows[row], (a).count, (a).capacity, sizeof(*(a).data), (a).data))
#define BITS(row, b) CHECK(bit_row(&rows[row], &(b)))
#define STORAGE(row, capacity, type, pointer) CHECK(storage_row(&rows[row], capacity, sizeof(type), pointer))

int air_b3_world_memory_diagnostics_v2(uint32_t world, uint32_t* out, int capacityWords) {
    CHECK(output_region(out, capacityWords));
    /* This helper does IsValid, then GetWorldFromId->locked without GetUnlocked's assertion. */
    CHECK(air_b3_world_unlocked(world));
    const b3World* w = b3GetWorldFromId(b3LoadWorldId(world));
    if (w->activeTaskCount != 0) return AIR_B3_LOCKED;
    const uint64_t step = w->stepIndex;
    MemoryRow rows[AIR_B3_MEMORY_ROW_COUNT] = {0};
    uint32_t wire[AIR_B3_MEMORY_WORDS] = {0};
    for (int i = 0; i < AIR_B3_MEMORY_ROW_COUNT; ++i) rows[i].known = 3;
    if (w->bodyIdPool.nextIndex < 0 || w->bodyIdPool.nextIndex < w->bodyIdPool.freeArray.count) return AIR_B3_MEMORY_INCONSISTENT;
    ARRAY(M_IDFREELIST_BODY, w->bodyIdPool.freeArray);
    if (w->solverSetIdPool.nextIndex < 0 || w->solverSetIdPool.nextIndex < w->solverSetIdPool.freeArray.count) return AIR_B3_MEMORY_INCONSISTENT;
    ARRAY(M_IDFREELIST_SOLVERSET, w->solverSetIdPool.freeArray);
    if (w->jointIdPool.nextIndex < 0 || w->jointIdPool.nextIndex < w->jointIdPool.freeArray.count) return AIR_B3_MEMORY_INCONSISTENT;
    ARRAY(M_IDFREELIST_JOINT, w->jointIdPool.freeArray);
    if (w->contactIdPool.nextIndex < 0 || w->contactIdPool.nextIndex < w->contactIdPool.freeArray.count) return AIR_B3_MEMORY_INCONSISTENT;
    ARRAY(M_IDFREELIST_CONTACT, w->contactIdPool.freeArray);
    if (w->islandIdPool.nextIndex < 0 || w->islandIdPool.nextIndex < w->islandIdPool.freeArray.count) return AIR_B3_MEMORY_INCONSISTENT;
    ARRAY(M_IDFREELIST_ISLAND, w->islandIdPool.freeArray);
    if (w->shapeIdPool.nextIndex < 0 || w->shapeIdPool.nextIndex < w->shapeIdPool.freeArray.count) return AIR_B3_MEMORY_INCONSISTENT;
    ARRAY(M_IDFREELIST_SHAPE, w->shapeIdPool.freeArray);
    ARRAY(M_WORLDARRAY_BODIES, w->bodies);
    ARRAY(M_WORLDARRAY_SOLVERSETS, w->solverSets);
    ARRAY(M_WORLDARRAY_JOINTS, w->joints);
    ARRAY(M_WORLDARRAY_CONTACTS, w->contacts);
    ARRAY(M_WORLDARRAY_ISLANDS, w->islands);
    ARRAY(M_WORLDARRAY_SHAPES, w->shapes);
    ARRAY(M_WORLDARRAY_SENSORS, w->sensors);
    for (int i = 0; i < w->islands.count; ++i) {
        const b3Island* item = w->islands.data + i;
        ARRAY(M_ISLANDLINKS_BODIES, item->bodies);
        ARRAY(M_ISLANDLINKS_CONTACTS, item->contacts);
        ARRAY(M_ISLANDLINKS_JOINTS, item->joints);
    }
    for (int i = 0; i < w->sensors.count; ++i) {
        const b3Sensor* item = w->sensors.data + i;
        ARRAY(M_SENSOROWNED_HITS, item->hits);
        ARRAY(M_SENSOROWNED_OVERLAPS1, item->overlaps1);
        ARRAY(M_SENSOROWNED_OVERLAPS2, item->overlaps2);
    }
    b3HullMap* map = w->hullDatabase;
    if (!map) return AIR_B3_MEMORY_INCONSISTENT;
    if (map->buckets_mask > INT_MAX) return AIR_B3_CAPACITY;
    uint64_t hullCount = b3HullMap_size(map), hullBuckets = b3HullMap_bucket_count(map);
    if (hullCount > INT_MAX || hullBuckets > INT_MAX) return AIR_B3_CAPACITY;
    if (hullCount > hullBuckets || (hullBuckets && (!map->buckets || !map->metadata)))
        return AIR_B3_MEMORY_INCONSISTENT;
    uint64_t mapBytes = sizeof(b3HullMap);
    if (hullBuckets) {
        /* Exact verstable metadata_offset/total_alloc_size, checked before size_t helpers. */
        uint64_t bucketBytes, metadataBytes;
        CHECK(multiply(hullBuckets, sizeof(*map->buckets), &bucketBytes));
        CHECK(add_u64(&bucketBytes, sizeof(uint16_t) - 1));
        bucketBytes = bucketBytes / sizeof(uint16_t) * sizeof(uint16_t);
        CHECK(multiply(hullBuckets + 4, sizeof(uint16_t), &metadataBytes));
        CHECK(add_u64(&mapBytes, bucketBytes)); CHECK(add_u64(&mapBytes, metadataBytes));
        if (mapBytes > INT_MAX || mapBytes > SIZE_MAX) return AIR_B3_CAPACITY;
    }
    if (mapBytes != b3HullMapByteCount(map)) return AIR_B3_MEMORY_INCONSISTENT;
    CHECK(add_row(&rows[M_HULLS_MAP], hullCount, hullBuckets, mapBytes, 3));
    uint64_t seenHulls = 0;
    for (b3HullMap_itr itr = b3HullMap_first(map); !b3HullMap_is_end(itr); itr = b3HullMap_next(itr)) {
        if (!itr.data->key || itr.data->key->byteCount < 0 || seenHulls >= hullCount)
            return AIR_B3_MEMORY_INCONSISTENT;
        uint64_t bytes = (uint64_t)itr.data->key->byteCount;
        CHECK(add_row(&rows[M_HULLS_DATA], 1, bytes, bytes, 3)); ++seenHulls;
    }
    if (seenHulls != hullCount) return AIR_B3_MEMORY_INCONSISTENT;
    {
        const b3DynamicTree* tree = w->broadPhase.trees + b3_staticBody;
        if (tree->nodeCapacity < 2 || !tree->nodes) return AIR_B3_MEMORY_INCONSISTENT;
        CHECK(add_row(&rows[M_TREE_STATIC_INLINESTRUCT], 1, 1, sizeof(b3DynamicTree), 3));
        CHECK(array_row(&rows[M_TREE_STATIC_NODES], tree->nodeEnd, tree->nodeCapacity, sizeof(b3TreeNode), tree->nodes));
        CHECK(array_row(&rows[M_TREE_STATIC_PARENTS], tree->nodeEnd, tree->nodeCapacity, sizeof(int32_t), tree->parents));
        CHECK(array_row(&rows[M_TREE_STATIC_PROXIES], tree->proxyCount, tree->proxyCapacity, sizeof(b3TreeProxy), tree->proxies));
        STORAGE(M_TREE_STATIC_SWAPNODES, tree->swapNodes ? tree->nodeCapacity : 0, b3TreeNode, tree->swapNodes);
        STORAGE(M_TREE_STATIC_LEAFINDICES, tree->rebuildCapacity, int32_t, tree->leafIndices);
        STORAGE(M_TREE_STATIC_LEAFNODES, tree->rebuildCapacity, b3TreeNode, tree->leafNodes);
        CHECK(inactive_rebuild_row(&rows[M_TREE_STATIC_LEAFBOXES], tree->rebuildCapacity, sizeof(b3AABB), tree->leafBoxes));
        STORAGE(M_TREE_STATIC_LEAFCENTERS, tree->rebuildCapacity, b3Vec3, tree->leafCenters);
        CHECK(inactive_rebuild_row(&rows[M_TREE_STATIC_BININDICES], tree->rebuildCapacity, sizeof(int32_t), tree->binIndices));
        CHECK(int_group(rows, M_TREE_STATIC_INLINESTRUCT, M_TREE_STATIC_BININDICES));
    }
    {
        const b3DynamicTree* tree = w->broadPhase.trees + b3_kinematicBody;
        if (tree->nodeCapacity < 2 || !tree->nodes) return AIR_B3_MEMORY_INCONSISTENT;
        CHECK(add_row(&rows[M_TREE_KINEMATIC_INLINESTRUCT], 1, 1, sizeof(b3DynamicTree), 3));
        CHECK(array_row(&rows[M_TREE_KINEMATIC_NODES], tree->nodeEnd, tree->nodeCapacity, sizeof(b3TreeNode), tree->nodes));
        CHECK(array_row(&rows[M_TREE_KINEMATIC_PARENTS], tree->nodeEnd, tree->nodeCapacity, sizeof(int32_t), tree->parents));
        CHECK(array_row(&rows[M_TREE_KINEMATIC_PROXIES], tree->proxyCount, tree->proxyCapacity, sizeof(b3TreeProxy), tree->proxies));
        STORAGE(M_TREE_KINEMATIC_SWAPNODES, tree->swapNodes ? tree->nodeCapacity : 0, b3TreeNode, tree->swapNodes);
        STORAGE(M_TREE_KINEMATIC_LEAFINDICES, tree->rebuildCapacity, int32_t, tree->leafIndices);
        STORAGE(M_TREE_KINEMATIC_LEAFNODES, tree->rebuildCapacity, b3TreeNode, tree->leafNodes);
        CHECK(inactive_rebuild_row(&rows[M_TREE_KINEMATIC_LEAFBOXES], tree->rebuildCapacity, sizeof(b3AABB), tree->leafBoxes));
        STORAGE(M_TREE_KINEMATIC_LEAFCENTERS, tree->rebuildCapacity, b3Vec3, tree->leafCenters);
        CHECK(inactive_rebuild_row(&rows[M_TREE_KINEMATIC_BININDICES], tree->rebuildCapacity, sizeof(int32_t), tree->binIndices));
        CHECK(int_group(rows, M_TREE_KINEMATIC_INLINESTRUCT, M_TREE_KINEMATIC_BININDICES));
    }
    {
        const b3DynamicTree* tree = w->broadPhase.trees + b3_dynamicBody;
        if (tree->nodeCapacity < 2 || !tree->nodes) return AIR_B3_MEMORY_INCONSISTENT;
        CHECK(add_row(&rows[M_TREE_DYNAMIC_INLINESTRUCT], 1, 1, sizeof(b3DynamicTree), 3));
        CHECK(array_row(&rows[M_TREE_DYNAMIC_NODES], tree->nodeEnd, tree->nodeCapacity, sizeof(b3TreeNode), tree->nodes));
        CHECK(array_row(&rows[M_TREE_DYNAMIC_PARENTS], tree->nodeEnd, tree->nodeCapacity, sizeof(int32_t), tree->parents));
        CHECK(array_row(&rows[M_TREE_DYNAMIC_PROXIES], tree->proxyCount, tree->proxyCapacity, sizeof(b3TreeProxy), tree->proxies));
        STORAGE(M_TREE_DYNAMIC_SWAPNODES, tree->swapNodes ? tree->nodeCapacity : 0, b3TreeNode, tree->swapNodes);
        STORAGE(M_TREE_DYNAMIC_LEAFINDICES, tree->rebuildCapacity, int32_t, tree->leafIndices);
        STORAGE(M_TREE_DYNAMIC_LEAFNODES, tree->rebuildCapacity, b3TreeNode, tree->leafNodes);
        CHECK(inactive_rebuild_row(&rows[M_TREE_DYNAMIC_LEAFBOXES], tree->rebuildCapacity, sizeof(b3AABB), tree->leafBoxes));
        STORAGE(M_TREE_DYNAMIC_LEAFCENTERS, tree->rebuildCapacity, b3Vec3, tree->leafCenters);
        CHECK(inactive_rebuild_row(&rows[M_TREE_DYNAMIC_BININDICES], tree->rebuildCapacity, sizeof(int32_t), tree->binIndices));
        CHECK(int_group(rows, M_TREE_DYNAMIC_INLINESTRUCT, M_TREE_DYNAMIC_BININDICES));
    }
    const b3HashSet* pairs = &w->broadPhase.pairSet;
    if (pairs->count > pairs->capacity || (pairs->capacity && !pairs->items)) return AIR_B3_MEMORY_INCONSISTENT;
    uint64_t pairBytes; CHECK(multiply(pairs->capacity, sizeof(b3SetItem), &pairBytes));
    if (pairBytes > INT_MAX) return AIR_B3_CAPACITY;
    CHECK(add_row(&rows[M_BROADPHASE_PAIRSET], pairs->count, pairs->capacity, pairBytes, 3));
    ARRAY(M_MANIFOLD_ALLOCATORARRAY, w->manifoldAllocators);
    for (int i = 0; i < w->manifoldAllocators.count; ++i) {
        const b3BlockAllocator* a = w->manifoldAllocators.data + i;
        ARRAY(M_MANIFOLD_BLOCKDIRECTORY, a->blocks);
        if (a->elementSize < 0 || a->allocationCount < 0) return AIR_B3_MEMORY_INCONSISTENT;
        uint64_t elements, bytes;
        CHECK(multiply((uint64_t)a->blocks.count, B3_BLOCK_SIZE, &elements));
        CHECK(multiply(elements, (uint64_t)a->elementSize, &bytes));
        if (elements > INT_MAX || bytes > INT_MAX || (uint64_t)a->allocationCount > elements)
            return AIR_B3_CAPACITY;
        CHECK(add_row(&rows[M_MANIFOLD_BLOCKSTORAGE], a->allocationCount, bytes, bytes, 3));
    }
    if (w->solverSets.count <= b3_awakeSet) return AIR_B3_MEMORY_INCONSISTENT;
    for (int i = 0; i < w->solverSets.count; ++i) {
        const b3SolverSet* set = w->solverSets.data + i;
        if (set->setIndex == B3_NULL_INDEX) continue;
        ARRAY(M_SOLVERSET_BODYSIMS, set->bodySims);
        ARRAY(M_SOLVERSET_BODYSTATES, set->bodyStates);
        ARRAY(M_SOLVERSET_JOINTSIMS, set->jointSims);
        ARRAY(M_SOLVERSET_CONTACTINDICES, set->contactIndices);
        ARRAY(M_SOLVERSET_ISLANDSIMS, set->islandSims);
    }
    if (w->solverSets.data[b3_awakeSet].contactIndices.count < 0) return AIR_B3_MEMORY_INCONSISTENT;
    uint64_t awakeContactCount = (uint64_t)w->solverSets.data[b3_awakeSet].contactIndices.count;
    for (int i = 0; i < B3_GRAPH_COLOR_COUNT; ++i) {
        const b3GraphColor* color = w->constraintGraph.colors + i;
        BITS(M_GRAPH_BODYBITS, color->bodySet);
        if (color->convexContacts.count < 0 || color->contacts.count < 0 || color->jointSims.count < 0)
            return AIR_B3_MEMORY_INCONSISTENT;
        uint64_t colorContacts = (uint64_t)color->convexContacts.count + (uint64_t)color->contacts.count;
        if (colorContacts + (uint64_t)color->jointSims.count > INT_MAX) return AIR_B3_CAPACITY;
        CHECK(add_u64(&awakeContactCount, colorContacts));
        if (awakeContactCount > INT_MAX) return AIR_B3_CAPACITY;
        ARRAY(M_GRAPH_CONVEXCONTACTS, color->convexContacts);
        ARRAY(M_GRAPH_CONTACTS, color->contacts);
        ARRAY(M_GRAPH_JOINTSIMS, color->jointSims);
    }
    ARRAY(M_TASK_CONTEXTARRAY, w->taskContexts);
    if (w->workerCount < 1 || w->workerCount > w->taskContexts.count) return AIR_B3_MEMORY_INCONSISTENT;
    uint64_t arenaBacking = 0, recycledContacts = 0;
    for (int i = 0; i < w->taskContexts.count; ++i) {
        const b3TaskContext* task = w->taskContexts.data + i;
        if (task->arena.capacity < 0 || !task->arena.shared || task->arena.shared->peakDemand < 0 ||
            (task->arena.capacity && !task->arena.memory)) return AIR_B3_MEMORY_INCONSISTENT;
        CHECK(add_u64(&arenaBacking, task->arena.capacity));
        if (i < w->workerCount) {
            if (task->recycledContactCount < 0) return AIR_B3_MEMORY_INCONSISTENT;
            CHECK(add_u64(&recycledContacts, (uint64_t)task->recycledContactCount));
            if (recycledContacts > INT_MAX) return AIR_B3_CAPACITY;
        }
        ARRAY(M_TASK_SENSORHITS, task->sensorHits);
        ARRAY(M_TASK_PAIRKEYS, task->pairKeys);
        BITS(M_TASK_CONTACTSTATEBITS, task->contactStateBitSet);
        BITS(M_TASK_JOINTSTATEBITS, task->jointStateBitSet);
        BITS(M_TASK_HITEVENTBITS, task->hitEventBitSet);
        BITS(M_TASK_AWAKEISLANDBITS, task->awakeIslandBitSet);
    }
    ARRAY(M_SENSORTASK_CONTEXTARRAY, w->sensorTaskContexts);
    for (int i = 0; i < w->sensorTaskContexts.count; ++i) BITS(M_SENSORTASK_EVENTBITS, w->sensorTaskContexts.data[i].eventBits);
    ARRAY(M_EVENT_BODYMOVEEVENTS, w->bodyMoveEvents);
    ARRAY(M_EVENT_SENSORBEGINEVENTS, w->sensorBeginEvents);
    ARRAY(M_EVENT_CONTACTBEGINEVENTS, w->contactBeginEvents);
    ARRAY(M_EVENT_SENSORENDEVENTS0, w->sensorEndEvents[0]);
    ARRAY(M_EVENT_SENSORENDEVENTS1, w->sensorEndEvents[1]);
    ARRAY(M_EVENT_CONTACTENDEVENTS0, w->contactEndEvents[0]);
    ARRAY(M_EVENT_CONTACTENDEVENTS1, w->contactEndEvents[1]);
    ARRAY(M_EVENT_CONTACTHITEVENTS, w->contactHitEvents);
    ARRAY(M_EVENT_JOINTEVENTS, w->jointEvents);
    BITS(M_DEBUG_BODY, w->debugBodySet);
    BITS(M_DEBUG_JOINT, w->debugJointSet);
    BITS(M_DEBUG_CONTACT, w->debugContactSet);
    BITS(M_DEBUG_ISLAND, w->debugIslandSet);
    if (w->stack.capacity < 0 || w->stack.allocation < 0 || (w->stack.capacity && !w->stack.memory))
        return AIR_B3_MEMORY_INCONSISTENT;
    CHECK(add_row(&rows[M_STACK], w->stack.allocation, w->stack.capacity, w->stack.capacity, 3));
    CHECK(add_row(&rows[M_WORLDFIXED_IDENTITYHISTORY], 1, 1, sizeof(w->identity), 3));
    CHECK(add_row(&rows[M_WORLDFIXED_CREATIONCAPACITY], 1, 1, sizeof(w->creationCapacity), 3));
    /* Match every signed-int intermediate in the pinned core before invoking GetCounters. */
    CHECK(int_group(rows, M_ISLANDLINKS_BODIES, M_ISLANDLINKS_JOINTS));
    CHECK(int_group(rows, M_SENSOROWNED_HITS, M_SENSOROWNED_OVERLAPS2));
    CHECK(int_group(rows, M_MANIFOLD_BLOCKDIRECTORY, M_MANIFOLD_BLOCKSTORAGE));
    CHECK(int_group(rows, M_GRAPH_CONVEXCONTACTS, M_GRAPH_CONTACTS));
    CHECK(int_group(rows, M_TASK_CONTEXTARRAY, M_TASK_AWAKEISLANDBITS));
    CHECK(int_group(rows, M_SENSORTASK_CONTEXTARRAY, M_SENSORTASK_EVENTBITS));
    CHECK(int_group(rows, M_EVENT_BODYMOVEEVENTS, M_EVENT_JOINTEVENTS));
    CHECK(int_group(rows, M_DEBUG_BODY, M_DEBUG_ISLAND));
    for (int i = 0; i < AIR_B3_MEMORY_ROW_COUNT; ++i) {
        if (i != M_HULLS_MAP && i != M_HULLS_DATA && rows[i].bytes > INT_MAX) return AIR_B3_CAPACITY;
        if (rows[i].known != 2 && rows[i].known != 3) return AIR_B3_MEMORY_INCONSISTENT;
    }
    for (int i = M_SOLVERSET_BODYSIMS; i <= M_SOLVERSET_ISLANDSIMS; ++i)
        if (rows[i].capacity > INT_MAX) return AIR_B3_CAPACITY;
    uint64_t total = 0;
    for (int i = 0; i < AIR_B3_MEMORY_ROW_COUNT; ++i) CHECK(add_u64(&total, rows[i].bytes));
    b3Counters counters = b3World_GetCounters(b3LoadWorldId(world));
    if (counters.byteCount < 0 || total != (uint64_t)counters.byteCount ||
        counters.bodyCount < 0 || counters.shapeCount < 0 || counters.contactCount < 0 ||
        counters.jointCount < 0 || counters.islandCount < 0 || counters.arenaCapacity < 0)
        return AIR_B3_MEMORY_INCONSISTENT;
    b3Capacity max = b3World_GetMaxCapacity(b3LoadWorldId(world));
    if (max.staticShapeCount < 0 || max.dynamicShapeCount < 0 || max.staticBodyCount < 0 ||
        max.dynamicBodyCount < 0 || max.contactCount < 0) return AIR_B3_MEMORY_INCONSISTENT;
    int64_t moduleBytes = b3GetByteCount();
    if (moduleBytes < 0) return AIR_B3_MEMORY_INCONSISTENT;
    wire[0] = AIR_B3_MEMORY_VERSION; wire[1] = AIR_B3_MEMORY_WORDS; wire[2] = AIR_B3_MEMORY_ROW_COUNT;
    wire[3] = world; split(wire + 4, step); split(wire + 6, total);
    wire[8] = counters.bodyCount; wire[9] = counters.shapeCount; wire[10] = counters.contactCount;
    wire[11] = counters.jointCount; wire[12] = counters.islandCount;
    wire[13] = max.staticShapeCount; wire[14] = max.dynamicShapeCount; wire[15] = max.staticBodyCount;
    wire[16] = max.dynamicBodyCount; wire[17] = max.contactCount;
    wire[18] = w->workerCount; wire[19] = counters.arenaCapacity; split(wire + 20, arenaBacking);
    split(wire + 22, (uint64_t)moduleBytes);
    CHECK(air_b3_bridge_memory(world, wire + 24));
    CHECK(air_b3_bridge_memory(0, wire + 30)); /* Actual native linked-list global, never JS world Map. */
    CHECK(air_b3_mesh_lifetime_counters(wire + 36));
    wire[40] = 1;
    for (int i = 0; i < AIR_B3_MEMORY_ROW_COUNT; ++i) {
        uint32_t* p = wire + AIR_B3_MEMORY_HEADER_WORDS + i * AIR_B3_MEMORY_ROW_WORDS;
        p[0] = (uint32_t)i + 1; p[1] = rows[i].known;
        split(p + 2, rows[i].count); split(p + 4, rows[i].capacity); split(p + 6, rows[i].bytes);
    }
    CHECK(air_b3_world_unlocked(world));
    if (w->activeTaskCount != 0 || w->stepIndex != step) return AIR_B3_MEMORY_INCONSISTENT;
    memcpy(out, wire, sizeof(wire)); /* Only caller-owned output changes, and only after complete success. */
    return AIR_B3_OK;
}
