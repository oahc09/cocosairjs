/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
#include <stddef.h>
/* Internal lifecycle hooks. No pointers are exported to JavaScript. */
uint32_t air_b3_bridge_world_create(float gx, float gy, float gz);
int air_b3_bridge_world_destroy(uint32_t world);
/* Internal scoped scratch, charged to this world's bridgeMemory; never exported. */
void* air_b3_bridge_temp_alloc(uint32_t world, size_t bytes);
void air_b3_bridge_temp_free(uint32_t world, void* pointer, size_t bytes);

/* Internal copied global ledger. No export or external pointer layout. Fields:
 * worlds, allocations, bytes, debugShapeHandles, temporaryNodes/bytes (including
 * BridgeTemp header), wireBuffers/capacityRecords/lengthRecords, capturedWorlds.
 * Temporary/wire allocations are SUBSETS of bridge bytes, not additive totals. */
int air_b3_bridge_global_snapshot(uint64_t out[10]);
