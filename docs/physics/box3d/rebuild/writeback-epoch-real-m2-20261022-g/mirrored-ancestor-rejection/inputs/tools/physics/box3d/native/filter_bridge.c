/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* ST-only exact-ID filter transaction; no persistent allocations, pointers or vendor edits. */
#include "air_box3d.h"
#include "filter_bridge.h"
#include <box3d/box3d.h>
#include <stddef.h>
static b3ShapeId load(const uint32_t* id) {
    return b3LoadShapeId(((uint64_t)id[1] << 32) | id[0]);
}
static int owned(uint32_t world, b3ShapeId shape) {
    if (!b3Shape_IsValid(shape) || b3StoreWorldId(b3Shape_GetWorld(shape)) != world) return AIR_B3_INVALID;
    b3Filter f = b3Shape_GetFilter(shape);
    if ((f.categoryBits >> 32) || (f.maskBits >> 32) || f.groupIndex != 0) return AIR_B3_UNSUPPORTED;
    return AIR_B3_OK;
}
int air_b3_shape_filter_get(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out) {
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!out) return AIR_B3_ARGUMENT;
    uint32_t id[2] = {lo, hi}; b3ShapeId shape = load(id);
    status = owned(world, shape); if (status) return status;
    b3Filter f = b3Shape_GetFilter(shape);
    out[0] = (uint32_t)f.categoryBits; out[1] = (uint32_t)f.maskBits; return AIR_B3_OK;
}
int air_b3_shape_filters_set(uint32_t world, const uint32_t* ids, int count,
    uint32_t group, uint32_t mask, uint32_t* out, int capacityWords) {
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (count < 0 || capacityWords < 0) return AIR_B3_ARGUMENT;
    if (count > AIR_B3_FILTER_MAX_SHAPES || capacityWords < 2 * count) return AIR_B3_CAPACITY;
    if (count == 0) return AIR_B3_OK;
    if (!ids || !out) return AIR_B3_ARGUMENT;
    uintptr_t a = (uintptr_t)ids, b = (uintptr_t)out, bytes = (uintptr_t)count * 2 * sizeof(uint32_t);
    if (a > UINTPTR_MAX - bytes || b > UINTPTR_MAX - bytes) return AIR_B3_ARGUMENT;
    if (a < b + bytes && b < a + bytes) return AIR_B3_ARGUMENT;
    for (int i = 0; i < count; ++i) {
        status = owned(world, load(ids + 2 * i)); if (status) return status;
        for (int j = 0; j < i; ++j)
            if (ids[2 * i] == ids[2 * j] && ids[2 * i + 1] == ids[2 * j + 1]) return AIR_B3_ARGUMENT;
    }
    /* Admission is complete. No recoverable failure branch exists after this point.
       A native trap/allocator failure is not reported as an unmutated transaction. */
    b3Filter f = {(uint64_t)group, (uint64_t)mask, 0};
    for (int i = 0; i < count; ++i) b3Shape_SetFilter(load(ids + 2 * i), f, true);
    for (int i = 0; i < count; ++i) {
        b3Filter actual = b3Shape_GetFilter(load(ids + 2 * i));
        out[2 * i] = (uint32_t)actual.categoryBits; out[2 * i + 1] = (uint32_t)actual.maskBits;
    }
    return AIR_B3_OK;
}
