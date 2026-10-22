/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum { AIR_B3_ABI_VERSION = 1, AIR_B3_BODY_INPUT_FLOATS = 16, AIR_B3_BODY_SNAPSHOT_FLOATS = 29 };
enum { AIR_B3_OK = 0, AIR_B3_INVALID = 1, AIR_B3_ARGUMENT = 2, AIR_B3_CREATION = 3 };

const char* air_b3_core_sha(void);
const char* air_b3_schema_sha(void);
const char* air_b3_patch_chain_sha(void);
uint32_t air_b3_abi_version(void);
uint32_t air_b3_world_create(float gx, float gy, float gz);
int air_b3_world_valid(uint32_t world);
int air_b3_world_destroy(uint32_t world);
int air_b3_world_step(uint32_t world, float dt, int substeps);
int air_b3_world_counts(uint32_t world, uint32_t* out);
void air_b3_live_bytes(uint32_t* out);
int air_b3_body_create(uint32_t world, int type, const float* input, int enable_sleep, uint32_t* out);
int air_b3_body_valid(uint32_t lo, uint32_t hi);
int air_b3_body_destroy(uint32_t lo, uint32_t hi);
int air_b3_body_snapshot(uint32_t lo, uint32_t hi, float* out);
int air_b3_body_velocity(uint32_t lo, uint32_t hi, float x, float y, float z);
int air_b3_body_impulse(uint32_t lo, uint32_t hi, float x, float y, float z);
int air_b3_shape_sphere(uint32_t lo, uint32_t hi, float radius, float density, uint32_t* out);
int air_b3_shape_box(uint32_t lo, uint32_t hi, float hx, float hy, float hz, float density, uint32_t* out);
int air_b3_shape_valid(uint32_t lo, uint32_t hi);
int air_b3_shape_destroy(uint32_t lo, uint32_t hi);
int air_b3_ray_closest(uint32_t world, const float* input, float* out, uint32_t* shape);
#ifdef __cplusplus
}
#endif
