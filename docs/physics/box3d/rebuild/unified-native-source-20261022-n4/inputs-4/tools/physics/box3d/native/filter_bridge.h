/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#ifndef AIR_BOX3D_FILTER_BRIDGE_H
#define AIR_BOX3D_FILTER_BRIDGE_H
#include <stdint.h>
#include <box3d/types.h>
enum { AIR_B3_FILTER_MAX_SHAPES = 4096, AIR_B3_FILTER_WORDS = 2 };
static inline b3Filter air_b3_default_filter(void) {
    return (b3Filter){UINT64_C(1), UINT64_C(0xffffffff), 0};
}
int air_b3_shape_filter_get(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out);
/* All status failures occur before mutation/output writes. IDs and output must not overlap. */
int air_b3_shape_filters_set(uint32_t world, const uint32_t* ids, int count,
    uint32_t group, uint32_t mask, uint32_t* out, int capacityWords);
#endif
