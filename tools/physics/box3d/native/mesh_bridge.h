/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Static cooked resources: cache leases and native shape borrows are separate. */
#pragma once
#include <stdint.h>

/* Input is already body-local, float32, CCW, no welding. It is copied by cook.
 * Resource IDs are monotonically allocated 64-bit bridge tokens, NOT pointers.
 * A successful cook owns one explicit cache lease. Each native mesh shape owns
 * a separate borrow. The allocation lives until both counts are zero. */
int air_b3_mesh_cook(uint32_t world, const float* positions, int vertexCount,
    int positionFloatCount, const int32_t* indices, int triangleCount,
    int indexCount, uint32_t* outResource);
int air_b3_mesh_retain(uint32_t world, uint32_t lo, uint32_t hi);
int air_b3_mesh_release(uint32_t world, uint32_t lo, uint32_t hi);
int air_b3_mesh_state(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* outSix);
int air_b3_mesh_shape_create(uint32_t world, uint32_t bodyLo, uint32_t bodyHi,
    uint32_t resourceLo, uint32_t resourceHi, uint32_t* outShape);

/* Internal hooks. Call only AFTER the corresponding native destroy returns.
 * World hook runs after core world destruction but before bridge temp cleanup.
 * These hooks never cause destruction of an extant native shape/body. */
void air_b3_mesh_shape_destroyed(uint32_t world, uint64_t fullShapeId);
void air_b3_mesh_body_destroyed(uint32_t world, uint64_t fullBodyId);
void air_b3_mesh_world_destroyed(uint32_t world);
/* INTERNAL ONLY: never add this helper to the wire/export list. The query
 * collector owns a trusted stack output; it may run while the world is locked.
 * Read-only original flattened source-face mapping. Non-mesh keeps input index.
 * Unknown/mismatched mesh ownership is an error, not a cooked-index fallback. */
int air_b3_mesh_source_face(uint32_t world, uint64_t fullShapeId,
    int cookedFace, int* sourceFace);

/* Checked wire read; copied original flattened face ordinal, no native pointer. */
int air_b3_mesh_face_read(uint32_t world, uint32_t shapeLo, uint32_t shapeHi,
    int cookedFace, int32_t* outSourceFace);
