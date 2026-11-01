/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
enum { AIR_B3_P2P_GEOMETRY_FLOATS = 6, AIR_B3_P2P_STATE_WORDS = 25 };
/* Body-origin local pivots in metres, copied before mutation. auto_pivot_b=1
   captures A's current world pivot in B. Both bodies retain their poses.
   collide and auto_pivot_b must be exact 0/1. Spherical spring, motor, cone
   and twist limit stay disabled; native default positional softness is kept. */
int air_b3_p2p_create(uint32_t world, uint32_t alo, uint32_t ahi,
    uint32_t blo, uint32_t bhi, const float* geometry, int geometry_count,
    int auto_pivot_b, int collide, uint32_t* out);
/* Collision-only update never recaptures frames or adds angular constraints. */
int air_b3_p2p_configure(uint32_t world, uint32_t lo, uint32_t hi, int collide);
/* Copied state: kind=3, bodyA[2],bodyB[2],collide,frameA[7],frameB[7],
   spring,motor,coneLimit,twistLimit (all bool), linearSeparation metres.
   No reaction force/torque or angular-error oracle is exposed by this slice. */
int air_b3_p2p_state(uint32_t world, uint32_t lo, uint32_t hi,
    uint32_t* out, int capacity);
