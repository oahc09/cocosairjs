/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Static-only cooked mesh ownership. See mesh_contract.c for lifecycle qualification. */
#include "mesh_bridge.h"
#include "air_box3d.h"
#include "world_bridge.h"
#include "shape.h"
#include <box3d/box3d.h>
#include <box3d/collision.h>
#include <box3d/constants.h>
#include <limits.h>
#include <math.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/heap.h>
#endif

_Static_assert(sizeof(float) == 4 && sizeof(b3Vec3) == 12, "mesh XYZ float32 wire");
_Static_assert(sizeof(int32_t) == sizeof(int), "pinned mesh index wire");

typedef struct MeshBorrow {
    uint64_t shape, body;
    struct MeshBorrow* next;
} MeshBorrow;
typedef struct MeshResource {
    uint64_t token;
    uint32_t world, leases, references;
    b3MeshData* mesh;
    size_t bytes;
    MeshBorrow* borrows;
    struct MeshResource* next;
    int sourceFaces[];
} MeshResource;
typedef struct FaceKey { int v[3], face; } FaceKey;
static MeshResource* resources;
static uint64_t sequence;
/* ST module-local diagnostics, not ownership, handles, or allocator-call counts.
 * No reset/tombstones/pointers escape. Includes successful temporary cooks that
 * subsequently roll back. Saturation never prevents required destruction. */
static uint64_t mesh_cooks, mesh_destroys;
static int mesh_counter_overflow;
static void destroy_mesh_counted(b3MeshData* mesh) {
    b3DestroyMesh(mesh);
    if (mesh_destroys == UINT64_MAX) mesh_counter_overflow = 1;
    else ++mesh_destroys;
}

static uint64_t join(uint32_t lo, uint32_t hi) { return ((uint64_t)hi << 32) | lo; }
static int region(const void* p, size_t bytes) {
    uintptr_t at = (uintptr_t)p;
    if (!p || at % 4 || at > UINTPTR_MAX - bytes) return 0;
#ifdef __EMSCRIPTEN__
    if (at + bytes > emscripten_get_heap_size()) return 0;
#endif
    return 1;
}
static int overlap(const void* a, size_t na, const void* b, size_t nb) {
    return (uintptr_t)a < (uintptr_t)b + nb && (uintptr_t)b < (uintptr_t)a + na;
}
static MeshResource* lookup(uint32_t world, uint64_t token) {
    for (MeshResource* p = resources; p; p = p->next)
        if (p->world == world && p->token == token) return p;
    return NULL;
}
static void unlink_and_free(MeshResource* resource) {
    MeshResource** at = &resources;
    while (*at != resource) at = &(*at)->next;
    *at = resource->next;
    destroy_mesh_counted(resource->mesh);
    air_b3_bridge_temp_free(resource->world, resource, resource->bytes);
}
static void collect(MeshResource* resource) {
    if (!resource->leases && !resource->references) unlink_and_free(resource);
}
static FaceKey face_key(int a, int b, int c, int face) {
    /* Cyclic orientation is preserved, not a position-based or unordered match. */
    if (b < a && b < c) return (FaceKey){{b,c,a},face};
    if (c < a && c < b) return (FaceKey){{c,a,b},face};
    return (FaceKey){{a,b,c},face};
}
static int compare_key(const void* va, const void* vb) {
    const FaceKey *a = va, *b = vb;
    for (int k = 0; k < 3; ++k) if (a->v[k] != b->v[k]) return a->v[k] < b->v[k] ? -1 : 1;
    return 0;
}

int air_b3_mesh_cook(uint32_t world, const float* positions, int vertexCount,
    int floatCount, const int32_t* indices, int triangleCount, int indexCount,
    uint32_t* out) {
    int status = air_b3_world_unlocked(world);
    if (status) return status;
    if (vertexCount < 3 || triangleCount < 1 || floatCount < 0 || indexCount < 0) return AIR_B3_ARGUMENT;
    if (vertexCount > INT_MAX / 3 || triangleCount > (INT_MAX - 1) / 3) return AIR_B3_CAPACITY;
    if (floatCount != vertexCount * 3 || indexCount != triangleCount * 3) return AIR_B3_ARGUMENT;
    /* Core stores allocation offsets and counts as signed int. Check the
       complete packed geometry bound, not only the incoming JS array lengths.
       This is an address bound, not a recoverable core-OOM guarantee. */
    uint64_t packed = sizeof(b3MeshData) + 64ull + (uint64_t)vertexCount * sizeof(b3Vec3)
        + (uint64_t)triangleCount * (2 * sizeof(b3MeshNode) + sizeof(b3MeshTriangle) + 16);
    if (packed > INT_MAX || sequence == UINT64_MAX || mesh_cooks == UINT64_MAX || mesh_counter_overflow) return AIR_B3_CAPACITY;
    size_t xyzBytes = (size_t)floatCount * sizeof(float), indexBytes = (size_t)indexCount * sizeof(int32_t);
    if (!region(positions, xyzBytes) || !region(indices, indexBytes) || !region(out, 8)
        || overlap(positions, xyzBytes, indices, indexBytes) || overlap(positions, xyzBytes, out, 8)
        || overlap(indices, indexBytes, out, 8)) return AIR_B3_ARGUMENT;
    for (int k = 0; k < floatCount; ++k) if (!isfinite(positions[k])) return AIR_B3_ARGUMENT;
    float totalArea = 0;
    const float minArea = 0.01f * B3_LINEAR_SLOP * B3_LINEAR_SLOP;
    for (int face = 0; face < triangleCount; ++face) {
        int a = indices[3*face], b = indices[3*face+1], c = indices[3*face+2];
        if (a < 0 || b < 0 || c < 0 || a >= vertexCount || b >= vertexCount || c >= vertexCount
            || a == b || b == c || c == a) return AIR_B3_ARGUMENT;
        b3Vec3 x = {positions[3*a],positions[3*a+1],positions[3*a+2]};
        b3Vec3 y = {positions[3*b],positions[3*b+1],positions[3*b+2]};
        b3Vec3 z = {positions[3*c],positions[3*c+1],positions[3*c+2]};
        float area = 0.5f * b3Length(b3Cross(b3Sub(y,x),b3Sub(z,x)));
        if (!isfinite(area) || area < minArea) return AIR_B3_ARGUMENT;
        totalArea += area;
        if (!isfinite(totalArea)) return AIR_B3_ARGUMENT;
    }
    size_t keysBytes = (size_t)triangleCount * sizeof(FaceKey);
    size_t resourceBytes = sizeof(MeshResource) + (size_t)triangleCount * sizeof(int);
    FaceKey* keys = air_b3_bridge_temp_alloc(world, keysBytes);
    if (!keys) return AIR_B3_ALLOCATION;
    MeshResource* resource = NULL;
    b3MeshData* mesh = NULL;
    for (int face = 0; face < triangleCount; ++face)
        keys[face] = face_key(indices[3*face],indices[3*face+1],indices[3*face+2],face);
    qsort(keys, (size_t)triangleCount, sizeof(FaceKey), compare_key);
    /* Duplicate oriented triples make original-face attribution ambiguous.
       Explicit refusal is safer than assigning the wrong public face ordinal.
       Coincident but differently indexed faces retain distinct source identity. */
    for (int k = 1; k < triangleCount; ++k) if (!compare_key(keys+k-1,keys+k)) {
        status = AIR_B3_UNSUPPORTED; goto done;
    }
    resource = air_b3_bridge_temp_alloc(world, resourceBytes);
    if (!resource) { status = AIR_B3_ALLOCATION; goto done; }
    memset(resource, 0, resourceBytes);
    b3MeshDef def = {0};
    def.vertices = (b3Vec3*)positions; def.vertexCount = vertexCount;
    def.indices = (int32_t*)indices; def.triangleCount = triangleCount;
    def.weldVertices = false; def.useMedianSplit = false;
    def.identifyEdges = true; def.clockWiseWinding = false;
    mesh = b3CreateMesh(&def, NULL, 0);
    if (!mesh) { status = AIR_B3_CREATION; goto done; }
    ++mesh_cooks;
    if (mesh->version != B3_MESH_VERSION || mesh->hash == 0 || mesh->triangleCount != triangleCount
        || mesh->vertexCount != vertexCount || mesh->degenerateCount != 0) {
        status = AIR_B3_UNSUPPORTED; goto done;
    }
    const b3MeshTriangle* triangles = b3GetMeshTriangles(mesh);
    for (int k = 0; k < triangleCount; ++k) {
        const b3MeshTriangle* t = triangles+k;
        FaceKey key = face_key(t->index1,t->index2,t->index3,0);
        const FaceKey* found = bsearch(&key, keys, (size_t)triangleCount, sizeof(FaceKey), compare_key);
        if (!found) { status = AIR_B3_UNSUPPORTED; goto done; }
        resource->sourceFaces[k] = found->face;
    }
    resource->token = ++sequence; resource->world = world; resource->leases = 1;
    resource->mesh = mesh; resource->bytes = resourceBytes;
    resource->next = resources; resources = resource;
    out[0] = (uint32_t)resource->token; out[1] = (uint32_t)(resource->token >> 32);
    resource = NULL; mesh = NULL;
done:
    if (mesh) destroy_mesh_counted(mesh);
    if (resource) air_b3_bridge_temp_free(world, resource, resourceBytes);
    air_b3_bridge_temp_free(world, keys, keysBytes);
    return status;
}
int air_b3_mesh_retain(uint32_t world, uint32_t lo, uint32_t hi) {
    int status = air_b3_world_unlocked(world); if (status) return status;
    MeshResource* resource = lookup(world, join(lo,hi));
    if (!resource || !resource->leases) return AIR_B3_INVALID;
    if (resource->leases == UINT32_MAX) return AIR_B3_CAPACITY;
    ++resource->leases; return AIR_B3_OK;
}
int air_b3_mesh_release(uint32_t world, uint32_t lo, uint32_t hi) {
    int status = air_b3_world_unlocked(world); if (status) return status;
    MeshResource* resource = lookup(world, join(lo,hi));
    if (!resource || !resource->leases) return AIR_B3_INVALID;
    --resource->leases; collect(resource); return AIR_B3_OK;
}
int air_b3_mesh_state(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out) {
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!region(out, 6*sizeof(uint32_t))) return AIR_B3_ARGUMENT;
    MeshResource* resource = lookup(world, join(lo,hi));
    if (!resource) return AIR_B3_INVALID;
    uint32_t copy[6] = {resource->leases,resource->references,(uint32_t)resource->mesh->vertexCount,
        (uint32_t)resource->mesh->triangleCount,(uint32_t)resource->mesh->byteCount,resource->world};
    memcpy(out,copy,sizeof(copy)); return AIR_B3_OK;
}
int air_b3_mesh_shape_create(uint32_t world, uint32_t blo, uint32_t bhi,
    uint32_t rlo, uint32_t rhi, uint32_t* out) {
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!region(out,8)) return AIR_B3_ARGUMENT;
    b3BodyId body = b3LoadBodyId(join(blo,bhi));
    if (!b3Body_IsValid(body) || b3StoreWorldId(b3Body_GetWorld(body)) != world) return AIR_B3_INVALID;
    /* This happens before any allocation, creation or SetType invocation. */
    if (b3Body_GetType(body) != b3_staticBody) return AIR_B3_UNSUPPORTED;
    MeshResource* resource = lookup(world,join(rlo,rhi));
    if (!resource || !resource->leases) return AIR_B3_INVALID;
    if (resource->references == UINT32_MAX) return AIR_B3_CAPACITY;
    b3Shape candidate = {0};
    candidate.type = b3_meshShape;
    candidate.mesh = (b3Mesh){resource->mesh,{1,1,1}};
    b3AABB bounds = b3ComputeFatShapeAABB(&candidate,b3Body_GetTransform(body),B3_SPECULATIVE_DISTANCE);
    if (!b3IsValidAABB(bounds) || !b3IsValidAABB(b3AABB_Inflate(bounds,B3_SPECULATIVE_DISTANCE)))
        return AIR_B3_ARGUMENT;
    MeshBorrow* borrow = air_b3_bridge_temp_alloc(world,sizeof(MeshBorrow));
    if (!borrow) return AIR_B3_ALLOCATION;
    b3ShapeDef def = b3DefaultShapeDef();
    def.filter = air_b3_default_filter(); def.density = 1;
    def.isSensor = false; def.enableSensorEvents = false; def.enableContactEvents = false;
    b3ShapeId shape = b3CreateMeshShape(body,&def,resource->mesh,(b3Vec3){1,1,1});
    if (!b3Shape_IsValid(shape)) {
        air_b3_bridge_temp_free(world,borrow,sizeof(MeshBorrow)); return AIR_B3_CREATION;
    }
    borrow->shape = b3StoreShapeId(shape); borrow->body = b3StoreBodyId(body);
    borrow->next = resource->borrows; resource->borrows = borrow; ++resource->references;
    out[0] = (uint32_t)borrow->shape; out[1] = (uint32_t)(borrow->shape>>32);
    return AIR_B3_OK;
}
static void release_borrows(uint32_t world, uint64_t identity, int body) {
    for (MeshResource* r = resources; r;) {
        MeshResource* next = r->next;
        if (r->world == world) {
            MeshBorrow** p = &r->borrows;
            while (*p) {
                MeshBorrow* b = *p;
                if ((body ? b->body : b->shape) == identity) {
                    *p = b->next; --r->references;
                    air_b3_bridge_temp_free(world,b,sizeof(MeshBorrow));
                } else p = &b->next;
            }
            collect(r);
        }
        r = next;
    }
}
void air_b3_mesh_shape_destroyed(uint32_t world, uint64_t id) { release_borrows(world,id,0); }
void air_b3_mesh_body_destroyed(uint32_t world, uint64_t id) { release_borrows(world,id,1); }
void air_b3_mesh_world_destroyed(uint32_t world) {
    MeshResource** at = &resources;
    while (*at) {
        MeshResource* r = *at;
        if (r->world == world) {
            *at = r->next;
            destroy_mesh_counted(r->mesh);
            r->mesh = NULL;
            r->references = r->leases = 0;
            /* Core world is already invalid, so public world-validated temp_free
               is not callable here. The immediately following clear_temporary(w)
               owns every resource/borrow allocation and frees those charged
               records using the still-live BridgeWorld, exactly once. */
        } else at = &r->next;
    }
}
/* Internal query-collector helper, not an exported wire entry. */
int air_b3_mesh_source_face(uint32_t world, uint64_t id, int cooked, int* out) {
    if (!out) return AIR_B3_ARGUMENT;
    b3ShapeId shape = b3LoadShapeId(id);
    if (!b3Shape_IsValid(shape) || b3StoreWorldId(b3Shape_GetWorld(shape)) != world) return AIR_B3_INVALID;
    if (b3Shape_GetType(shape) != b3_meshShape) { *out = cooked; return AIR_B3_OK; }
    for (MeshResource* r = resources; r; r = r->next) if (r->world == world)
        for (MeshBorrow* b = r->borrows; b; b = b->next) if (b->shape == id) {
            if (cooked < 0 || cooked >= r->mesh->triangleCount) return AIR_B3_ARGUMENT;
            *out = r->sourceFaces[cooked]; return AIR_B3_OK;
        }
    return AIR_B3_INVALID;
}

int air_b3_mesh_face_read(uint32_t world, uint32_t lo, uint32_t hi, int cooked, int32_t* out) {
    int status = air_b3_world_unlocked(world); if (status) return status;
    if (!region(out, sizeof(int32_t)) || cooked < 0) return AIR_B3_ARGUMENT;
    b3ShapeId shape = b3LoadShapeId(join(lo,hi));
    if (!b3Shape_IsValid(shape) || b3StoreWorldId(b3Shape_GetWorld(shape)) != world) return AIR_B3_INVALID;
    if (b3Shape_GetType(shape) != b3_meshShape) return AIR_B3_UNSUPPORTED;
    int value; status = air_b3_mesh_source_face(world,join(lo,hi),cooked,&value);
    if (!status) *out = value;
    return status;
}

/* Exact module-wide diagnostic snapshot. Caller must serialize ST module use.
 * Four copied uint32 words, independent of live resources/worlds; no tombstones.
 * Invalid output or saturated diagnostics leave caller storage unchanged. */
int air_b3_mesh_lifetime_counters(uint32_t* out) {
    if (!region(out, 4*sizeof(uint32_t))) return AIR_B3_ARGUMENT;
    if (mesh_counter_overflow) return AIR_B3_CAPACITY;
    uint32_t copy[4] = {(uint32_t)mesh_cooks, (uint32_t)(mesh_cooks >> 32),
        (uint32_t)mesh_destroys, (uint32_t)(mesh_destroys >> 32)};
    memcpy(out, copy, sizeof(copy));
    return AIR_B3_OK;
}

/* Counts only actual registered resources and the real native borrow list. */
static int mesh_global_add(uint64_t* total, uint64_t value) {
    if (*total > UINT64_MAX - value) return AIR_B3_CAPACITY;
    *total += value; return AIR_B3_OK;
}
int air_b3_mesh_global_snapshot(uint64_t out[5]) {
    if (!out) return AIR_B3_ARGUMENT;
    uint64_t staged[5] = {0};
#define MESH_GLOBAL_ADD(i, v) do { int rc_ = mesh_global_add(staged + (i), (uint64_t)(v)); if (rc_) return rc_; } while (0)
    for (const MeshResource* r = resources; r; r = r->next) {
        int status = air_b3_world_unlocked(r->world); if (status) return status;
        uint64_t borrows = 0;
        for (const MeshBorrow* b = r->borrows; b; b = b->next) {
            int status = mesh_global_add(&borrows, 1); if (status) return status;
        }
        if (!r->mesh || borrows != r->references) return AIR_B3_MEMORY_INCONSISTENT;
        MESH_GLOBAL_ADD(0, 1); MESH_GLOBAL_ADD(1, r->leases); MESH_GLOBAL_ADD(2, r->references);
        MESH_GLOBAL_ADD(3, borrows); MESH_GLOBAL_ADD(4, r->bytes);
    }
#undef MESH_GLOBAL_ADD
    memcpy(out, staged, sizeof(staged)); return AIR_B3_OK;
}
