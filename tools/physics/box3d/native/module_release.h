/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
enum { AIR_B3_MODULE_RELEASE_VERSION = 1, AIR_B3_MODULE_RELEASE_FIELDS = 17,
    AIR_B3_MODULE_RELEASE_WORDS = 38 };
/* ST exclusive read, copied u64 low/high words. This observes registered global
 * chains and core tracked requested bytes, NOT all handles/malloc/heap/GC. */
int air_b3_module_release_snapshot_v1(uint32_t* out, int capacityWords);
