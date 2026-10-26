/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
/* Copied diagnostic ABI extension. Every nonzero status leaves caller output untouched. */
enum { AIR_B3_MEMORY_VERSION = 1, AIR_B3_MEMORY_HEADER_WORDS = 44,
    AIR_B3_MEMORY_ROW_WORDS = 8, AIR_B3_MEMORY_ROW_COUNT = 87,
    AIR_B3_MEMORY_WORDS = 740, AIR_B3_MEMORY_INCONSISTENT = 13 };
int air_b3_world_memory_diagnostics_v1(uint32_t world, uint32_t* out, int capacityWords);
