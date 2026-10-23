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
