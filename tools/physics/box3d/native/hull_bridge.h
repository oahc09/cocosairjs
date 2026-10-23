/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stddef.h>
#include <stdint.h>
/* C-only size planner: no fixed raw-point cap and no allocations. */
int air_b3_hull_scratch_size(int pointCount, size_t addressLimit, size_t* pointBytes,
    size_t* workspaceOffset, size_t* workspaceBytes, size_t* scratchBytes);
/* Variable-length ABI. Exactly 3*pointCount float32s; no native topology wire. */
int air_b3_mass_hull_create(uint32_t world,uint32_t bodyLo,uint32_t bodyHi,
    const float* positions,int pointCount,int positionFloatCount,
    float density,int sensor,float requestedMass,uint32_t* outId);
/* Geometry-only admission for disabled colliders. Real cook and release; never
   creates a body/shape. World is used only for lock and temporary ownership. */
int air_b3_hull_validate(uint32_t world,const float* positions,int pointCount,int positionFloatCount);
