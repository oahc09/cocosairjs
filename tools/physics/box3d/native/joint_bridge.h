/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
enum { AIR_B3_FIXED_STATE_WORDS = 30 };
/* Full generation IDs, copied buffers only. Both bodies must already exist in world.
   Create captures their current origin transforms. No pose is written to either body. */
int air_b3_fixed_create(uint32_t world, uint32_t alo, uint32_t ahi,
    uint32_t blo, uint32_t bhi, int collide, float force, float torque, uint32_t* out);
int air_b3_fixed_configure(uint32_t world, uint32_t lo, uint32_t hi,
    int collide, float force, float torque);
int air_b3_fixed_state(uint32_t world, uint32_t lo, uint32_t hi,
    uint32_t* out, int capacity);
int air_b3_joint_destroy(uint32_t world, uint32_t lo, uint32_t hi);
int air_b3_joint_event_size(uint32_t world, uint32_t* out);
int air_b3_joint_events(uint32_t world, uint32_t* out, int capacity);
