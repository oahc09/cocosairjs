/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
enum { AIR_B3_MOTION_MAX_BODIES = 4096, AIR_B3_MOTION_INPUT_WORDS = 18, AIR_B3_MOTION_OUTPUT_FLOATS = 61 };
enum { AIR_B3_MOTION_RESET = 1, AIR_B3_MOTION_PRESERVE = 2, AIR_B3_MOTION_WAKE = 4, AIR_B3_MOTION_SCENE = 8 };
enum { AIR_B3_MOTION_NONE = 0, AIR_B3_MOTION_TARGET = 1, AIR_B3_MOTION_CLEAR = 2 };
/* Records: full ID low/high, flags, intent, reset origin.xyz/rotation.xyzw, target pose.
   All known failures precede mutation/output writes. apply=0 only validates, never consumes intent.
   Input/output regions cannot overlap; no pointer or private plan escapes the facade. */
int air_b3_motion_batch(uint32_t world, const uint32_t* records, int count, int inputWords,
    float dt, int substeps, float* out, int capacityFloats, int apply);
