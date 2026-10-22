/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Additive geometry wire. Old g contact/event strides remain byte-for-byte unchanged. */
#include "air_box3d.h"
#include <box3d/box3d.h>
#include <string.h>

static void put_float(uint32_t* out, float value) { memcpy(out, &value, sizeof(value)); }
static void put_vec(uint32_t* out, b3Vec3 value) { put_float(out, value.x); put_float(out+1, value.y); put_float(out+2, value.z); }
static void put_pose(uint32_t* out, b3WorldTransform transform, b3Pos center)
{
    put_vec(out, transform.p); put_vec(out+3, transform.q.v); put_float(out+6, transform.q.s); put_vec(out+7, center);
}
int air_b3_contact_geometry(uint32_t world, const uint32_t* words, uint32_t* out, int capacity)
{
    if (!words || !out || capacity < 0) return AIR_B3_ARGUMENT;
    if (!air_b3_contact_valid(world, words)) return AIR_B3_INVALID;
    if (capacity < 25) return AIR_B3_CAPACITY;
    uint32_t copy[3]; memcpy(copy, words, sizeof(copy)); b3ContactId id = b3LoadContactId(copy);
    b3ContactData data = b3Contact_GetData(id);
    b3ShapeType a = b3Shape_GetType(data.shapeIdA), b = b3Shape_GetType(data.shapeIdB);
    /* Only these analytic-fixture geometry families are admitted in this increment. */
    if (!((a == b3_sphereShape && (b == b3_sphereShape || b == b3_hullShape)) ||
          (b == b3_sphereShape && a == b3_hullShape))) return AIR_B3_UNSUPPORTED_GEOMETRY;
    b3ContactGeometryBasis basis;
    if (!b3Contact_GetGeometryBasis(id, &basis)) return AIR_B3_GEOMETRY_UNAVAILABLE;
    uint32_t result[25] = {1, (uint32_t)basis.geometryRevision, (uint32_t)(basis.geometryRevision >> 32),
        (uint32_t)basis.generatedAfterStep, (uint32_t)(basis.generatedAfterStep >> 32)};
    put_pose(result+5, basis.generationTransformA, basis.generationCOMA);
    put_pose(result+15, basis.generationTransformB, basis.generationCOMB);
    memcpy(out, result, sizeof(result)); return AIR_B3_OK;
}
int air_b3_world_geometry_counters(uint32_t world, uint32_t* out)
{
    if (!out) return AIR_B3_ARGUMENT;
    b3WorldId id = b3LoadWorldId(world);
    if (!b3World_IsValid(id)) return AIR_B3_INVALID;
    b3Counters counters = b3World_GetCounters(id);
    uint32_t result[5] = {(uint32_t)counters.awakeContactCount, (uint32_t)counters.recycledContactCount,
        (uint32_t)counters.distanceIterations, (uint32_t)counters.pushBackIterations, (uint32_t)counters.rootIterations};
    memcpy(out, result, sizeof(result)); return AIR_B3_OK;
}
