/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
#include "body_control.h"

#ifdef __cplusplus
extern "C" {
#endif

enum { AIR_B3_ABI_VERSION = 1, AIR_B3_BODY_INPUT_FLOATS = 16, AIR_B3_BODY_SNAPSHOT_FLOATS = 29 };
enum { AIR_B3_OK = 0, AIR_B3_INVALID = 1, AIR_B3_ARGUMENT = 2, AIR_B3_CREATION = 3, AIR_B3_CAPACITY = 4, AIR_B3_ALLOCATION = 5, AIR_B3_GEOMETRY_UNAVAILABLE = 6, AIR_B3_UNSUPPORTED_GEOMETRY = 7, AIR_B3_UNSUPPORTED = 8, AIR_B3_LOCKED = 9, AIR_B3_MASS_PENDING = 10 };

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

/* Additive ABI-1 copied snapshot functions; see the schema for word layouts. */
int air_b3_body_transforms(uint32_t world, const uint32_t* ids, int count, float* out);
int air_b3_world_event_size(uint32_t world, uint32_t* out);
int air_b3_world_events(uint32_t world, uint32_t* out, int capacity);
int air_b3_body_contact_size(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out);
int air_b3_body_contacts(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out, int capacity);
int air_b3_contact_valid(uint32_t world, const uint32_t* words);
int air_b3_shape_events(uint32_t lo, uint32_t hi, int flags);
int air_b3_shape_sphere_ex(uint32_t lo, uint32_t hi, float x, float y, float z, float radius, float density, int sensor, uint32_t* out);
int air_b3_contact_geometry(uint32_t world, const uint32_t* words, uint32_t* out, int capacity);
int air_b3_world_geometry_counters(uint32_t world, uint32_t* out);
/* Additive world/debug bridge; copied buffers only. */
int air_b3_world_gravity_get(uint32_t world, float* out);
int air_b3_world_gravity_set(uint32_t world, float x, float y, float z);
int air_b3_world_sleep_get(uint32_t world, uint32_t* out);
int air_b3_world_sleep_set(uint32_t world, int enabled);
int air_b3_shape_material_get(uint32_t world, uint32_t lo, uint32_t hi, float* out);
int air_b3_shape_material_set(uint32_t world, uint32_t lo, uint32_t hi, float friction, float restitution);
int air_b3_world_debug_capture(uint32_t world, uint32_t flags, float scale, uint32_t* size);
int air_b3_world_debug_copy(uint32_t world, uint32_t* out, int capacity);
int air_b3_world_debug_release(uint32_t world);
int air_b3_bridge_memory(uint32_t world, uint32_t* out);
#ifdef __cplusplus
}
#endif
