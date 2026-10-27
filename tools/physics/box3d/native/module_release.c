/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#include "air_box3d.h"
#include "world_bridge.h"
#include "mesh_bridge.h"
#include <box3d/box3d.h>
#include <stddef.h>
#include <string.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/heap.h>
#endif
#ifdef __EMSCRIPTEN_PTHREADS__
#error "Module release snapshots require exclusive serialized ST use"
#endif
int air_b3_module_release_snapshot_v1(uint32_t* out, int capacityWords) {
    if (!out || (uintptr_t)out % sizeof(uint32_t)) return AIR_B3_ARGUMENT;
    if (capacityWords < AIR_B3_MODULE_RELEASE_WORDS) return AIR_B3_CAPACITY;
    const size_t bytes = AIR_B3_MODULE_RELEASE_WORDS * sizeof(uint32_t);
    if ((uintptr_t)out > UINTPTR_MAX - bytes) return AIR_B3_ARGUMENT;
#ifdef __EMSCRIPTEN__
    if ((uintptr_t)out + bytes > emscripten_get_heap_size()) return AIR_B3_ARGUMENT;
#endif
    uint64_t fields[AIR_B3_MODULE_RELEASE_FIELDS] = {0};
    int status = air_b3_bridge_global_snapshot(fields + 2); if (status) return status;
    status = air_b3_mesh_global_snapshot(fields + 12); if (status) return status;
    int worlds = b3GetWorldCount();
    int64_t coreBytes = b3GetByteCount();
    if (worlds < 0 || coreBytes < 0 || fields[2] > (uint64_t)worlds)
        return AIR_B3_MEMORY_INCONSISTENT;
    fields[0] = (uint64_t)worlds; fields[1] = (uint64_t)coreBytes;
    uint32_t staged[AIR_B3_MODULE_RELEASE_WORDS] = {AIR_B3_MODULE_RELEASE_VERSION,
        AIR_B3_MODULE_RELEASE_WORDS, AIR_B3_MODULE_RELEASE_FIELDS, 0};
    for (int i = 0; i < AIR_B3_MODULE_RELEASE_FIELDS; ++i) {
        staged[4 + 2*i] = (uint32_t)fields[i]; staged[5 + 2*i] = (uint32_t)(fields[i] >> 32);
    }
    /* Single commit only after every checked read. Caller retains no native view. */
    memcpy(out, staged, sizeof(staged)); return AIR_B3_OK;
}
