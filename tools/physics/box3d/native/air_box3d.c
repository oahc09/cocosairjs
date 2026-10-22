/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#include "air_box3d.h"
#include <box3d/box3d.h>
#include <box3d/collision.h>
#include <math.h>
#include <stddef.h>

#ifndef AIR_B3_SCHEMA_SHA
#error "Build must bind the schema SHA-256 to the compiled module"
#endif
#ifdef BOX3D_DOUBLE_PRECISION
#error "The initial AIR Box3D wire ABI requires float32"
#endif
#ifdef __EMSCRIPTEN_PTHREADS__
#error "The initial AIR Box3D wire ABI is single threaded"
#endif
#ifdef __FAST_MATH__
#error "Fast math is forbidden for AIR Box3D"
#endif

_Static_assert(sizeof(float) == 4, "float32 required");
_Static_assert(sizeof(b3Pos) == 12, "float32 position ABI required");
_Static_assert(sizeof(b3BodyId) == 8, "Review body ID ABI");
_Static_assert(sizeof(b3ShapeId) == 8, "Review shape ID ABI");
_Static_assert(sizeof(b3ContactId) == 12, "Review contact ID ABI");
_Static_assert(sizeof(((b3Counters*)0)->byteCount) == 8, "64-bit byte counts required");

static uint64_t join_id(uint32_t lo, uint32_t hi) { return ((uint64_t)hi << 32) | lo; }
static void split_u64(uint64_t id, uint32_t* out) { out[0] = (uint32_t)id; out[1] = (uint32_t)(id >> 32); }
static int finite3(float x, float y, float z) { return isfinite(x) && isfinite(y) && isfinite(z); }
static void write_vec(float* out, b3Vec3 v) { out[0] = v.x; out[1] = v.y; out[2] = v.z; }

const char* air_b3_core_sha(void) { return "efca0c184d40fd6a82016983f1601c4d23965867"; }
const char* air_b3_schema_sha(void) { return AIR_B3_SCHEMA_SHA; }
uint32_t air_b3_abi_version(void) { return AIR_B3_ABI_VERSION; }

uint32_t air_b3_world_create(float gx, float gy, float gz)
{
    if (!finite3(gx, gy, gz)) return 0;
    b3WorldDef def = b3DefaultWorldDef();
    def.gravity = (b3Vec3){gx, gy, gz};
    def.workerCount = 1;
    return b3StoreWorldId(b3CreateWorld(&def));
}
int air_b3_world_valid(uint32_t world) { return b3World_IsValid(b3LoadWorldId(world)); }
int air_b3_world_destroy(uint32_t world)
{
    if (!air_b3_world_valid(world)) return AIR_B3_INVALID;
    b3DestroyWorld(b3LoadWorldId(world));
    return AIR_B3_OK;
}
int air_b3_world_step(uint32_t world, float dt, int substeps)
{
    if (!air_b3_world_valid(world)) return AIR_B3_INVALID;
    if (!isfinite(dt) || dt <= 0 || substeps < 1) return AIR_B3_ARGUMENT;
    b3World_Step(b3LoadWorldId(world), dt, substeps);
    return AIR_B3_OK;
}
int air_b3_world_counts(uint32_t world, uint32_t* out)
{
    if (!out) return AIR_B3_ARGUMENT;
    if (!air_b3_world_valid(world)) return AIR_B3_INVALID;
    b3Counters c = b3World_GetCounters(b3LoadWorldId(world));
    out[0] = (uint32_t)c.bodyCount;
    out[1] = (uint32_t)c.shapeCount;
    out[2] = (uint32_t)c.contactCount;
    out[3] = (uint32_t)c.jointCount;
    split_u64((uint64_t)c.byteCount, out + 4);
    return AIR_B3_OK;
}
void air_b3_live_bytes(uint32_t* out) { if (out) split_u64((uint64_t)b3GetByteCount(), out); }

int air_b3_body_create(uint32_t world, int type, const float* p, int enable_sleep, uint32_t* out)
{
    if (!out || !p) return AIR_B3_ARGUMENT;
    if (!air_b3_world_valid(world)) return AIR_B3_INVALID;
    if (type < b3_staticBody || type > b3_dynamicBody || (enable_sleep != 0 && enable_sleep != 1)) return AIR_B3_ARGUMENT;
    for (int i = 0; i < AIR_B3_BODY_INPUT_FLOATS; ++i) if (!isfinite(p[i])) return AIR_B3_ARGUMENT;
    if (p[13] < 0 || p[13] > 1 || p[14] < 0 || p[14] > 1) return AIR_B3_ARGUMENT;
    float q2 = p[3]*p[3] + p[4]*p[4] + p[5]*p[5] + p[6]*p[6];
    if (!isfinite(q2) || fabsf(q2 - 1.0f) > 1e-4f) return AIR_B3_ARGUMENT;
    b3BodyDef def = b3DefaultBodyDef();
    def.type = (b3BodyType)type;
    def.position = (b3Pos){p[0], p[1], p[2]};
    def.rotation = (b3Quat){{p[3], p[4], p[5]}, p[6]};
    def.linearVelocity = (b3Vec3){p[7], p[8], p[9]};
    def.angularVelocity = (b3Vec3){p[10], p[11], p[12]};
    def.linearDamping = p[13];
    def.angularDamping = p[14];
    def.gravityScale = p[15];
    def.enableSleep = enable_sleep != 0;
    b3BodyId body = b3CreateBody(b3LoadWorldId(world), &def);
    if (!b3Body_IsValid(body)) return AIR_B3_CREATION;
    split_u64(b3StoreBodyId(body), out);
    return AIR_B3_OK;
}
int air_b3_body_valid(uint32_t lo, uint32_t hi) { return b3Body_IsValid(b3LoadBodyId(join_id(lo, hi))); }
int air_b3_body_destroy(uint32_t lo, uint32_t hi)
{
    if (!air_b3_body_valid(lo, hi)) return AIR_B3_INVALID;
    b3DestroyBody(b3LoadBodyId(join_id(lo, hi)));
    return AIR_B3_OK;
}
int air_b3_body_snapshot(uint32_t lo, uint32_t hi, float* out)
{
    if (!out) return AIR_B3_ARGUMENT;
    if (!air_b3_body_valid(lo, hi)) return AIR_B3_INVALID;
    b3BodyId body = b3LoadBodyId(join_id(lo, hi));
    write_vec(out, b3Body_GetPosition(body));
    b3Quat rotation = b3Body_GetRotation(body);
    write_vec(out + 3, rotation.v); out[6] = rotation.s;
    write_vec(out + 7, b3Body_GetLinearVelocity(body));
    write_vec(out + 10, b3Body_GetAngularVelocity(body));
    write_vec(out + 13, b3Body_GetWorldCenter(body));
    b3MassData mass = b3Body_GetMassData(body);
    out[16] = mass.mass;
    write_vec(out + 17, mass.center);
    write_vec(out + 20, mass.inertia.cx);
    write_vec(out + 23, mass.inertia.cy);
    write_vec(out + 26, mass.inertia.cz);
    return AIR_B3_OK;
}
int air_b3_body_velocity(uint32_t lo, uint32_t hi, float x, float y, float z)
{
    if (!air_b3_body_valid(lo, hi)) return AIR_B3_INVALID;
    if (!finite3(x, y, z)) return AIR_B3_ARGUMENT;
    b3Body_SetLinearVelocity(b3LoadBodyId(join_id(lo, hi)), (b3Vec3){x, y, z});
    return AIR_B3_OK;
}
int air_b3_body_impulse(uint32_t lo, uint32_t hi, float x, float y, float z)
{
    if (!air_b3_body_valid(lo, hi)) return AIR_B3_INVALID;
    if (!finite3(x, y, z)) return AIR_B3_ARGUMENT;
    b3Body_ApplyLinearImpulseToCenter(b3LoadBodyId(join_id(lo, hi)), (b3Vec3){x, y, z}, true);
    return AIR_B3_OK;
}
static int valid_shape_args(uint32_t lo, uint32_t hi, float density, uint32_t* out)
{
    if (!out || !isfinite(density) || density <= 0) return AIR_B3_ARGUMENT;
    if (!air_b3_body_valid(lo, hi)) return AIR_B3_INVALID;
    return AIR_B3_OK;
}
int air_b3_shape_sphere(uint32_t lo, uint32_t hi, float radius, float density, uint32_t* out)
{
    int status = valid_shape_args(lo, hi, density, out);
    if (status) return status;
    if (!isfinite(radius) || radius <= 0) return AIR_B3_ARGUMENT;
    b3ShapeDef def = b3DefaultShapeDef(); def.density = density;
    b3Sphere sphere = {{0, 0, 0}, radius};
    b3ShapeId shape = b3CreateSphereShape(b3LoadBodyId(join_id(lo, hi)), &def, &sphere);
    if (!b3Shape_IsValid(shape)) return AIR_B3_CREATION;
    split_u64(b3StoreShapeId(shape), out);
    return AIR_B3_OK;
}
int air_b3_shape_box(uint32_t lo, uint32_t hi, float hx, float hy, float hz, float density, uint32_t* out)
{
    int status = valid_shape_args(lo, hi, density, out);
    if (status) return status;
    if (!finite3(hx, hy, hz) || hx <= 0 || hy <= 0 || hz <= 0) return AIR_B3_ARGUMENT;
    b3ShapeDef def = b3DefaultShapeDef(); def.density = density;
    b3BoxHull hull = b3MakeBoxHull(hx, hy, hz);
    /* b3CreateHullShape copies hull data. The stack hull is not retained. */
    b3ShapeId shape = b3CreateHullShape(b3LoadBodyId(join_id(lo, hi)), &def, &hull.base);
    if (!b3Shape_IsValid(shape)) return AIR_B3_CREATION;
    split_u64(b3StoreShapeId(shape), out);
    return AIR_B3_OK;
}
int air_b3_shape_valid(uint32_t lo, uint32_t hi) { return b3Shape_IsValid(b3LoadShapeId(join_id(lo, hi))); }
int air_b3_shape_destroy(uint32_t lo, uint32_t hi)
{
    if (!air_b3_shape_valid(lo, hi)) return AIR_B3_INVALID;
    b3DestroyShape(b3LoadShapeId(join_id(lo, hi)), true);
    return AIR_B3_OK;
}
int air_b3_ray_closest(uint32_t world, const float* input, float* out, uint32_t* shape)
{
    if (!input || !out || !shape) return AIR_B3_ARGUMENT;
    if (!air_b3_world_valid(world)) return AIR_B3_INVALID;
    for (int i = 0; i < 6; ++i) if (!isfinite(input[i])) return AIR_B3_ARGUMENT;
    b3RayResult hit = b3World_CastRayClosest(b3LoadWorldId(world), (b3Pos){input[0], input[1], input[2]},
        (b3Vec3){input[3], input[4], input[5]}, b3DefaultQueryFilter());
    out[0] = hit.hit ? 1.0f : 0.0f;
    for (int i = 1; i < 8; ++i) out[i] = 0;
    shape[0] = shape[1] = 0;
    if (hit.hit) {
        write_vec(out + 1, hit.point); write_vec(out + 4, hit.normal); out[7] = hit.fraction;
        split_u64(b3StoreShapeId(hit.shapeId), shape);
    }
    return AIR_B3_OK;
}
