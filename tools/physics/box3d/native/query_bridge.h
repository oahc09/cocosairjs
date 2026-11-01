/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>

enum { AIR_B3_RAY_INPUT_FLOATS = 6, AIR_B3_RAY_HIT_WORDS = 11 };
/* Additive ABI-1. Input is origin.xyz + translation.xyz, not direction + distance.
   Hit: shape lo/hi u32; point.xyz, normal.xyz, fraction f32; triangle/child i32.
   out == NULL, capacityWords == 0 sizes only. countOut reports hits, not words.
   Copy checks complete capacity before writing. No persistent buffer or handle.
   Native order is unspecified: the adapter maps stable logical IDs, deduplicates,
   sorts distance/ID and selects closest from these SAME generic-callback results. */
int air_b3_ray_query(uint32_t world, const float* input, uint32_t group, uint32_t mask,
    int queryTrigger, uint32_t* out, int capacityWords, uint32_t* countOut);

/* World-oriented convex point cloud relative to origin. 1..128 points, finite
   nonnegative radius. Inputs, points, output and count must not alias. Shape
   casts share the ray's 11-word copied record; overlaps copy shape lo/hi only.
   Count-only then complete-capacity copy. No clipping or hidden hit cap. */
enum { AIR_B3_OVERLAP_HIT_WORDS = 2, AIR_B3_QUERY_MAX_POINTS = 128 };
int air_b3_shape_query(uint32_t world, const float* input6, const float* pointsXYZ,
    int pointCount, float radius, uint32_t group, uint32_t mask, int queryTrigger,
    uint32_t* out, int capacityWords, uint32_t* countOut);
int air_b3_overlap_query(uint32_t world, const float* origin3, const float* pointsXYZ,
    int pointCount, float radius, uint32_t group, uint32_t mask, int queryTrigger,
    uint32_t* out, int capacityWords, uint32_t* countOut);
