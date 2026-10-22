/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
/* Internal lifecycle hooks. No pointers are exported to JavaScript. */
uint32_t air_b3_bridge_world_create(float gx, float gy, float gz);
int air_b3_bridge_world_destroy(uint32_t world);
