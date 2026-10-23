/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
enum { AIR_B3_BODY_STATE_FLOATS = 49, AIR_B3_CAPSULE_INPUT_FLOATS = 7 };
enum { AIR_B3_CTL_TYPE=1, AIR_B3_CTL_ENABLED, AIR_B3_CTL_DAMPING, AIR_B3_CTL_GRAVITY,
 AIR_B3_CTL_SLEEP_ENABLED, AIR_B3_CTL_SLEEP_THRESHOLD, AIR_B3_CTL_AWAKE, AIR_B3_CTL_CCD,
 AIR_B3_CTL_FACTORS, AIR_B3_CTL_LINEAR_VELOCITY, AIR_B3_CTL_ANGULAR_VELOCITY,
 AIR_B3_CTL_CLEAR_FORCES, AIR_B3_CTL_CLEAR_VELOCITY, AIR_B3_CTL_CLEAR_STATE };
int air_b3_body_state(uint32_t world,uint32_t lo,uint32_t hi,float target,float* out);
int air_b3_body_control(uint32_t world,uint32_t lo,uint32_t hi,int op,const float* values,float target);
int air_b3_body_mass_set(uint32_t world,uint32_t lo,uint32_t hi,float target);
int air_b3_body_mass_ready(uint32_t world,uint32_t lo,uint32_t hi,float target);
int air_b3_body_apply(uint32_t world,uint32_t lo,uint32_t hi,int kind,int local,const float* values);
/* Internal C-only helper. hull must be a real, topology-checked b3CreateHull
   result from the pinned core, never an external serialized pointer. Caller
   retains ownership on every normal return and releases with b3DestroyHull.
   This symbol is intentionally absent from exports.json. */
struct b3HullData;
int air_b3_mass_cooked_hull_create(uint32_t world,uint32_t lo,uint32_t hi,
 const struct b3HullData* hull,float density,int sensor,float target,uint32_t* out);
/* kind 2: center.xyz, radius > 0, halfSegment >= 0, exact direction 0/1/2,
   density > 0. halfSegment is cylinderHeight / 2, not total capsule height.
   Zero segment explicitly creates a sphere. Positive float32 endpoint distance
   <= B3_LINEAR_SLOP returns AIR_B3_UNSUPPORTED, with no output or body mutation. */
int air_b3_mass_shape_create(uint32_t world,uint32_t lo,uint32_t hi,int kind,const float* p,int sensor,float target,uint32_t* out);
int air_b3_mass_shape_destroy(uint32_t world,uint32_t lo,uint32_t hi,uint32_t slo,uint32_t shi,float target);
int air_b3_world_unlocked(uint32_t world);
