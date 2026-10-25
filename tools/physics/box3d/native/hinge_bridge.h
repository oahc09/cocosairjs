/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
enum { AIR_B3_HINGE_GEOMETRY_FLOATS = 9, AIR_B3_HINGE_CONFIG_WORDS = 7, AIR_B3_HINGE_STATE_WORDS = 36 };
/* geometry: pivotA.xyz, pivotB.xyz in body-origin local metres, axisA.xyz nonzero.
   axisA is normalized; native joint local +Z is aligned with it. Both world
   joint orientations initially coincide, so native B-minus-A twist starts at zero.
   auto_pivot_b=1 captures A's world anchor in B instead of using pivotB.
   config words: collide(bool), limit(bool), lower(float radians), upper(float radians),
   motor(bool), motorSpeed(float B-minus-A rad/s), maxMotorTorque(float N.m).
   Bounds are finite, ordered and within +/-0.99f*B3_PI even if disabled. No sorting/clamping.
   Creation/configuration never writes either body pose. All output data are copied. */
int air_b3_hinge_create(uint32_t world, uint32_t alo, uint32_t ahi,
    uint32_t blo, uint32_t bhi, const float* geometry, int geometry_count,
    int auto_pivot_b, const uint32_t* config, int config_count, uint32_t* out);
int air_b3_hinge_configure(uint32_t world, uint32_t lo, uint32_t hi,
    const uint32_t* config, int config_count);
/* state: kind=2, bodyA[2],bodyB[2],collide,frameA[7],frameB[7],
   limit(bool),lower,upper,motor(bool),speed,maxTorque,angle,motorTorque,
   constraintForce[3],constraintTorque[3],linearSeparation,axisAlignmentRadians.
   constraintTorque is the world-coordinate angular constraint couple on B in N.m,
   copied once from the pinned solver's current retained impulse/basis cache
   using the most recent world inv_h. Configuration can clear terms; sleeping
   cache can be rescaled by later world dt changes. Freshness is not tracked. It excludes r x F
   from linear constraint force about a body's COM and is not an outer-step average.
   No native state is modified by the read. */
int air_b3_hinge_state(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out, int capacity);
