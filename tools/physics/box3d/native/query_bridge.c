/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* One generic callback for all results, including the adapter's closest route.
   No convenience closest cast, native shape mutation, persistent allocation or token. */
#include "air_box3d.h"
#include <box3d/box3d.h>
#include <box3d/constants.h>
#include <limits.h>
#include <math.h>
#include <stddef.h>
#include <string.h>

_Static_assert(sizeof(float) == sizeof(uint32_t), "float32 query wire required");

typedef struct RayCollector {
    uint32_t* out;
    uint32_t count;
    uint32_t limit;
    int queryTrigger;
    int status;
} RayCollector;

static void write_float(uint32_t* out, float value) { memcpy(out, &value, sizeof(value)); }
static int finite3(float x, float y, float z) { return isfinite(x) && isfinite(y) && isfinite(z); }
static int valid_range(const void* pointer, size_t bytes) {
    return (uintptr_t)pointer <= UINTPTR_MAX - bytes;
}
static int overlaps(const void* a, size_t an, const void* b, size_t bn) {
    return an && bn && (uintptr_t)a < (uintptr_t)b + bn && (uintptr_t)b < (uintptr_t)a + an;
}

static float collect_ray(b3ShapeId shape, b3Pos point, b3Vec3 normal, float fraction,
    uint64_t material, int triangle, int child, void* context)
{
    (void)material;
    RayCollector* collector = context;
    if (!collector->queryTrigger && b3Shape_IsSensor(shape)) return 1.0f;
    if (!isfinite(fraction) || fraction < 0.0f || !finite3(point.x, point.y, point.z)
        || !finite3(normal.x, normal.y, normal.z)) {
        collector->status = AIR_B3_UNSUPPORTED;
        return 0.0f;
    }
    /* Half-open segment. Never clip: zero-fraction hits must not stop traversal. */
    if (fraction >= 1.0f) return 1.0f;
    if (collector->count >= collector->limit) {
        collector->status = AIR_B3_CAPACITY;
        return 0.0f;
    }
    if (collector->out) {
        uint32_t* hit = collector->out + collector->count * AIR_B3_RAY_HIT_WORDS;
        uint64_t id = b3StoreShapeId(shape);
        hit[0] = (uint32_t)id; hit[1] = (uint32_t)(id >> 32);
        write_float(hit + 2, point.x); write_float(hit + 3, point.y); write_float(hit + 4, point.z);
        write_float(hit + 5, normal.x); write_float(hit + 6, normal.y); write_float(hit + 7, normal.z);
        write_float(hit + 8, fraction);
        hit[9] = (uint32_t)triangle; hit[10] = (uint32_t)child;
    }
    ++collector->count;
    return 1.0f;
}

int air_b3_ray_query(uint32_t world, const float* input, uint32_t group, uint32_t mask,
    int queryTrigger, uint32_t* out, int capacityWords, uint32_t* countOut)
{
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!input || !countOut || capacityWords < 0 || (!out && capacityWords != 0)
        || (queryTrigger != 0 && queryTrigger != 1)) return AIR_B3_ARGUMENT;
    if (((uintptr_t)input | (uintptr_t)out | (uintptr_t)countOut) % sizeof(uint32_t))
        return AIR_B3_ARGUMENT;
    size_t outputBytes = (size_t)capacityWords * sizeof(uint32_t);
    if (outputBytes / sizeof(uint32_t) != (size_t)capacityWords
        || !valid_range(input, AIR_B3_RAY_INPUT_FLOATS * sizeof(float))
        || !valid_range(countOut, sizeof(uint32_t)) || !valid_range(out, outputBytes)) return AIR_B3_ARGUMENT;
    if (overlaps(input, AIR_B3_RAY_INPUT_FLOATS * sizeof(float), out, outputBytes)
        || overlaps(input, AIR_B3_RAY_INPUT_FLOATS * sizeof(float), countOut, sizeof(uint32_t))
        || overlaps(out, outputBytes, countOut, sizeof(uint32_t))) return AIR_B3_ARGUMENT;
    for (int i = 0; i < AIR_B3_RAY_INPUT_FLOATS; ++i)
        if (!isfinite(input[i])) return AIR_B3_ARGUMENT;
    for (int i = 0; i < 3; ++i)
        if (!isfinite(input[i] + input[i + 3])) return AIR_B3_ARGUMENT;
    if ((input[3] == 0 && input[4] == 0 && input[5] == 0) || group == 0 || mask == 0) {
        *countOut = 0; return AIR_B3_OK;
    }
    b3Pos origin = {input[0], input[1], input[2]};
    b3Vec3 translation = {input[3], input[4], input[5]};
    b3QueryFilter filter = b3DefaultQueryFilter();
    filter.categoryBits = (uint64_t)group; filter.maskBits = (uint64_t)mask;
    RayCollector collector = {NULL, 0, INT_MAX / AIR_B3_RAY_HIT_WORDS, queryTrigger, AIR_B3_OK};
    b3World_CastRay(b3LoadWorldId(world), origin, translation, filter, collect_ray, &collector);
    if (collector.status) return collector.status;
    uint32_t count = collector.count;
    if (out && (uint32_t)capacityWords < count * AIR_B3_RAY_HIT_WORDS) return AIR_B3_CAPACITY;
    if (out && count) {
        /* ST, no external callbacks/mutations: admission/count precedes every output write.
           Use the same callback and un-clipped traversal for the complete second pass. */
        collector = (RayCollector){out, 0, count, queryTrigger, AIR_B3_OK};
        b3World_CastRay(b3LoadWorldId(world), origin, translation, filter, collect_ray, &collector);
        if (collector.status) return collector.status;
        if (collector.count != count) return AIR_B3_UNSUPPORTED;
    }
    *countOut = count;
    return AIR_B3_OK;
}

_Static_assert(B3_MAX_SHAPE_CAST_POINTS == AIR_B3_QUERY_MAX_POINTS, "query point admission must track pinned core");

static bool collect_overlap(b3ShapeId shape, void* context)
{
    RayCollector* collector = context;
    if (!collector->queryTrigger && b3Shape_IsSensor(shape)) return true;
    if (collector->count >= collector->limit) {
        collector->status = AIR_B3_CAPACITY;
        return false;
    }
    if (collector->out) {
        uint64_t id = b3StoreShapeId(shape);
        uint32_t* hit = collector->out + collector->count * AIR_B3_OVERLAP_HIT_WORDS;
        hit[0] = (uint32_t)id; hit[1] = (uint32_t)(id >> 32);
    }
    ++collector->count;
    return true;
}

static int proxy_query(uint32_t world, const float* input, const float* xyz,
    int pointCount, float radius, uint32_t group, uint32_t mask, int queryTrigger,
    uint32_t* out, int capacityWords, uint32_t* countOut, int cast)
{
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!input || !xyz || !countOut || pointCount < 1 || pointCount > AIR_B3_QUERY_MAX_POINTS
        || !isfinite(radius) || radius < 0 || capacityWords < 0 || (!out && capacityWords != 0)
        || (queryTrigger != 0 && queryTrigger != 1)) return AIR_B3_ARGUMENT;
    if (((uintptr_t)input | (uintptr_t)xyz | (uintptr_t)out | (uintptr_t)countOut) % sizeof(uint32_t))
        return AIR_B3_ARGUMENT;
    size_t inputBytes = (cast ? 6u : 3u) * sizeof(float);
    size_t pointBytes = (size_t)pointCount * 3u * sizeof(float);
    size_t outputBytes = (size_t)capacityWords * sizeof(uint32_t);
    const void* ranges[4] = {input, xyz, out, countOut};
    size_t sizes[4] = {inputBytes, pointBytes, outputBytes, sizeof(uint32_t)};
    if (outputBytes / sizeof(uint32_t) != (size_t)capacityWords) return AIR_B3_ARGUMENT;
    for (int i = 0; i < 4; ++i) {
        if (!valid_range(ranges[i], sizes[i])) return AIR_B3_ARGUMENT;
        for (int j = 0; j < i; ++j)
            if (overlaps(ranges[i], sizes[i], ranges[j], sizes[j])) return AIR_B3_ARGUMENT;
    }
    for (size_t i = 0; i < inputBytes / sizeof(float); ++i)
        if (!isfinite(input[i])) return AIR_B3_ARGUMENT;
    b3Vec3 points[AIR_B3_QUERY_MAX_POINTS];
    for (int p = 0; p < pointCount; ++p) {
        for (int axis = 0; axis < 3; ++axis) {
            float value = xyz[3 * p + axis];
            float end = input[axis] + (cast ? input[axis + 3] : 0.0f);
            if (!isfinite(value) || !isfinite(end)
                || !isfinite(value + radius) || !isfinite(value - radius)
                || !isfinite(input[axis] + value + radius) || !isfinite(input[axis] + value - radius)
                || !isfinite(end + value + radius) || !isfinite(end + value - radius)) return AIR_B3_ARGUMENT;
        }
        points[p] = (b3Vec3){xyz[3 * p], xyz[3 * p + 1], xyz[3 * p + 2]};
    }
    if (group == 0 || mask == 0 || (cast && input[3] == 0 && input[4] == 0 && input[5] == 0)) {
        *countOut = 0; return AIR_B3_OK;
    }
    b3Pos origin = {input[0], input[1], input[2]};
    b3Vec3 translation = cast ? (b3Vec3){input[3], input[4], input[5]} : (b3Vec3){0};
    b3ShapeProxy proxy = {points, pointCount, radius};
    b3QueryFilter filter = b3DefaultQueryFilter();
    filter.categoryBits = (uint64_t)group; filter.maskBits = (uint64_t)mask;
    int stride = cast ? AIR_B3_RAY_HIT_WORDS : AIR_B3_OVERLAP_HIT_WORDS;
    RayCollector collector = {NULL, 0, INT_MAX / stride, queryTrigger, AIR_B3_OK};
    if (cast) b3World_CastShape(b3LoadWorldId(world), origin, &proxy, translation, filter, collect_ray, &collector);
    else b3World_OverlapShape(b3LoadWorldId(world), origin, &proxy, filter, collect_overlap, &collector);
    if (collector.status) return collector.status;
    uint32_t count = collector.count;
    if (out && (uint32_t)capacityWords < count * (uint32_t)stride) return AIR_B3_CAPACITY;
    if (out && count) {
        /* No external callbacks; the ST world remains unchanged between both passes. */
        collector = (RayCollector){out, 0, count, queryTrigger, AIR_B3_OK};
        if (cast) b3World_CastShape(b3LoadWorldId(world), origin, &proxy, translation, filter, collect_ray, &collector);
        else b3World_OverlapShape(b3LoadWorldId(world), origin, &proxy, filter, collect_overlap, &collector);
        if (collector.status) return collector.status;
        if (collector.count != count) return AIR_B3_UNSUPPORTED;
    }
    *countOut = count;
    return AIR_B3_OK;
}

int air_b3_shape_query(uint32_t world, const float* input6, const float* pointsXYZ,
    int pointCount, float radius, uint32_t group, uint32_t mask, int queryTrigger,
    uint32_t* out, int capacityWords, uint32_t* countOut)
{
    return proxy_query(world, input6, pointsXYZ, pointCount, radius, group, mask, queryTrigger,
        out, capacityWords, countOut, 1);
}
int air_b3_overlap_query(uint32_t world, const float* origin3, const float* pointsXYZ,
    int pointCount, float radius, uint32_t group, uint32_t mask, int queryTrigger,
    uint32_t* out, int capacityWords, uint32_t* countOut)
{
    return proxy_query(world, origin3, pointsXYZ, pointCount, radius, group, mask, queryTrigger,
        out, capacityWords, countOut, 0);
}
