/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Public Box3D headers only. Every native pointer is consumed within this call. */
#include "air_box3d.h"
#include <box3d/box3d.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

static b3BodyId body_id(uint32_t lo, uint32_t hi) { return b3LoadBodyId(((uint64_t)hi << 32) | lo); }
static int valid_body(uint32_t world, b3BodyId body)
{
    return b3World_IsValid(b3LoadWorldId(world)) && b3Body_IsValid(body) && b3StoreWorldId(b3Body_GetWorld(body)) == world;
}
static void put_float(uint32_t* out, float value) { memcpy(out, &value, sizeof(value)); }
static void put_vec(uint32_t* out, b3Vec3 value) { put_float(out, value.x); put_float(out + 1, value.y); put_float(out + 2, value.z); }
static void put_id(uint32_t* out, uint64_t id) { out[0] = (uint32_t)id; out[1] = (uint32_t)(id >> 32); }
static void put_pose(uint32_t* out, b3BodyId body)
{
    b3WorldTransform xf = b3Body_GetTransform(body);
    put_vec(out, xf.p); put_vec(out + 3, xf.q.v); put_float(out + 6, xf.q.s);
    put_vec(out + 7, b3Body_GetWorldCenter(body));
}
int air_b3_body_transforms(uint32_t world, const uint32_t* ids, int count, float* out)
{
    if (count < 0 || count > INT_MAX / 10 || (count && (!ids || !out))) return AIR_B3_ARGUMENT;
    if (!b3World_IsValid(b3LoadWorldId(world))) return AIR_B3_INVALID;
    /* Validate the entire batch before touching output; no partial success. */
    for (int i = 0; i < count; ++i) if (!valid_body(world, body_id(ids[2*i], ids[2*i+1]))) return AIR_B3_INVALID;
    for (int i = 0; i < count; ++i) {
        uint32_t pose[10]; put_pose(pose, body_id(ids[2*i], ids[2*i+1]));
        memcpy(out + 10*i, pose, sizeof(pose));
    }
    return AIR_B3_OK;
}
static size_t event_words(b3BodyEvents b, b3ContactEvents c, b3SensorEvents s)
{
    return 6u + (size_t)b.moveCount * 11u + ((size_t)c.beginCount + (size_t)c.endCount) * 8u
        + (size_t)c.hitCount * 19u + ((size_t)s.beginCount + (size_t)s.endCount) * 5u;
}
int air_b3_world_event_size(uint32_t world, uint32_t* out)
{
    if (!out) return AIR_B3_ARGUMENT;
    if (!b3World_IsValid(b3LoadWorldId(world))) return AIR_B3_INVALID;
    b3WorldId w = b3LoadWorldId(world);
    size_t words = event_words(b3World_GetBodyEvents(w), b3World_GetContactEvents(w), b3World_GetSensorEvents(w));
    if (words > INT_MAX) return AIR_B3_CAPACITY;
    *out = (uint32_t)words; return AIR_B3_OK;
}
static void put_contact_identity(uint32_t* out, b3ShapeId a, b3ShapeId b, b3ContactId c)
{
    put_id(out, b3StoreShapeId(a)); put_id(out + 2, b3StoreShapeId(b)); b3StoreContactId(c, out + 4);
    out[7] = (b3Shape_IsValid(a) ? 1u : 0u) | (b3Shape_IsValid(b) ? 2u : 0u) | (b3Contact_IsValid(c) ? 4u : 0u);
}
int air_b3_world_events(uint32_t world, uint32_t* out, int capacity)
{
    if (!out || capacity < 0) return AIR_B3_ARGUMENT;
    if (!b3World_IsValid(b3LoadWorldId(world))) return AIR_B3_INVALID;
    b3WorldId w = b3LoadWorldId(world);
    b3BodyEvents b = b3World_GetBodyEvents(w); b3ContactEvents c = b3World_GetContactEvents(w); b3SensorEvents s = b3World_GetSensorEvents(w);
    if (event_words(b, c, s) > (size_t)capacity) return AIR_B3_CAPACITY;
    out[0] = (uint32_t)b.moveCount; out[1] = (uint32_t)c.beginCount; out[2] = (uint32_t)c.endCount;
    out[3] = (uint32_t)c.hitCount; out[4] = (uint32_t)s.beginCount; out[5] = (uint32_t)s.endCount;
    uint32_t* p = out + 6;
    for (int i = 0; i < b.moveCount; ++i, p += 11) {
        b3BodyMoveEvent e = b.moveEvents[i]; put_id(p, b3StoreBodyId(e.bodyId));
        p[2] = b3Body_IsValid(e.bodyId); p[3] = e.fellAsleep;
        put_vec(p + 4, e.transform.p); put_vec(p + 7, e.transform.q.v); put_float(p + 10, e.transform.q.s);
    }
    for (int i = 0; i < c.beginCount; ++i, p += 8) { b3ContactBeginTouchEvent e = c.beginEvents[i]; put_contact_identity(p, e.shapeIdA, e.shapeIdB, e.contactId); }
    for (int i = 0; i < c.endCount; ++i, p += 8) { b3ContactEndTouchEvent e = c.endEvents[i]; put_contact_identity(p, e.shapeIdA, e.shapeIdB, e.contactId); }
    for (int i = 0; i < c.hitCount; ++i, p += 19) {
        b3ContactHitEvent e = c.hitEvents[i]; put_contact_identity(p, e.shapeIdA, e.shapeIdB, e.contactId);
        put_vec(p + 8, e.point); put_vec(p + 11, e.normal); put_float(p + 14, e.approachSpeed);
        put_id(p + 15, e.userMaterialIdA); put_id(p + 17, e.userMaterialIdB);
    }
    for (int i = 0; i < s.beginCount; ++i, p += 5) {
        b3SensorBeginTouchEvent e = s.beginEvents[i]; put_id(p, b3StoreShapeId(e.sensorShapeId)); put_id(p + 2, b3StoreShapeId(e.visitorShapeId));
        p[4] = (b3Shape_IsValid(e.sensorShapeId) ? 1u : 0u) | (b3Shape_IsValid(e.visitorShapeId) ? 2u : 0u);
    }
    for (int i = 0; i < s.endCount; ++i, p += 5) {
        b3SensorEndTouchEvent e = s.endEvents[i]; put_id(p, b3StoreShapeId(e.sensorShapeId)); put_id(p + 2, b3StoreShapeId(e.visitorShapeId));
        p[4] = (b3Shape_IsValid(e.sensorShapeId) ? 1u : 0u) | (b3Shape_IsValid(e.visitorShapeId) ? 2u : 0u);
    }
    return AIR_B3_OK;
}
static int contacts(uint32_t world, uint32_t lo, uint32_t hi, b3ContactData** data, int* count, size_t* words)
{
    b3BodyId body = body_id(lo, hi);
    if (!valid_body(world, body)) return AIR_B3_INVALID;
    int capacity = b3Body_GetContactCapacity(body);
    if (capacity < 0 || (size_t)capacity > SIZE_MAX / sizeof(b3ContactData)) return AIR_B3_CAPACITY;
    *data = capacity ? malloc((size_t)capacity * sizeof(b3ContactData)) : NULL;
    if (capacity && !*data) return AIR_B3_ALLOCATION;
    *count = capacity ? b3Body_GetContactData(body, *data, capacity) : 0;
    *words = 1;
    for (int i = 0; i < *count; ++i) {
        const b3ContactData* c = *data + i;
        *words += 34u;
        for (int m = 0; m < c->manifoldCount; ++m) *words += 11u + (size_t)c->manifolds[m].pointCount * 14u;
        if (*words > INT_MAX) { free(*data); *data = NULL; return AIR_B3_CAPACITY; }
    }
    return AIR_B3_OK;
}
int air_b3_body_contact_size(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out)
{
    if (!out) return AIR_B3_ARGUMENT;
    b3ContactData* data = NULL; int count; size_t words;
    int status = contacts(world, lo, hi, &data, &count, &words);
    if (status) return status;
    *out = (uint32_t)words; free(data); return AIR_B3_OK;
}
int air_b3_body_contacts(uint32_t world, uint32_t lo, uint32_t hi, uint32_t* out, int capacity)
{
    if (!out || capacity < 0) return AIR_B3_ARGUMENT;
    b3ContactData* data = NULL; int count; size_t words;
    int status = contacts(world, lo, hi, &data, &count, &words);
    if (status) return status;
    if (words > (size_t)capacity) { free(data); return AIR_B3_CAPACITY; }
    *out = (uint32_t)count; uint32_t* p = out + 1;
    for (int i = 0; i < count; ++i) {
        b3ContactData* c = data + i; b3BodyId a = b3Shape_GetBody(c->shapeIdA); b3BodyId b = b3Shape_GetBody(c->shapeIdB);
        b3StoreContactId(c->contactId, p); put_id(p + 3, b3StoreShapeId(c->shapeIdA)); put_id(p + 5, b3StoreShapeId(c->shapeIdB));
        put_id(p + 7, b3StoreBodyId(a)); put_id(p + 9, b3StoreBodyId(b)); p[11] = (uint32_t)c->manifoldCount;
        p[12] = b3Body_IsAwake(a); p[13] = b3Body_IsAwake(b); put_pose(p + 14, a); put_pose(p + 24, b); p += 34;
        for (int m = 0; m < c->manifoldCount; ++m) {
            const b3Manifold* manifold = c->manifolds + m;
            p[0] = (uint32_t)manifold->pointCount; put_vec(p + 1, manifold->normal); put_float(p + 4, manifold->twistImpulse);
            put_vec(p + 5, manifold->frictionImpulse); put_vec(p + 8, manifold->rollingImpulse); p += 11;
            for (int k = 0; k < manifold->pointCount; ++k) {
                const b3ManifoldPoint* point = manifold->points + k;
                put_vec(p, point->anchorA); put_vec(p + 3, point->anchorB); put_float(p + 6, point->separation);
                put_float(p + 7, point->normalImpulse); put_float(p + 8, point->totalNormalImpulse);
                put_float(p + 9, point->normalVelocity); put_float(p + 10, point->baseSeparation);
                p[11] = point->featureId; p[12] = (uint32_t)point->triangleIndex; p[13] = point->persisted; p += 14;
            }
        }
    }
    free(data); return AIR_B3_OK;
}
int air_b3_contact_valid(uint32_t world, const uint32_t* words)
{
    if (!words || !b3World_IsValid(b3LoadWorldId(world))) return 0;
    uint32_t copy[3]; memcpy(copy, words, sizeof(copy)); b3ContactId id = b3LoadContactId(copy);
    if (!b3Contact_IsValid(id)) return 0;
    b3ContactData data = b3Contact_GetData(id);
    return b3Shape_IsValid(data.shapeIdA) && b3StoreWorldId(b3Shape_GetWorld(data.shapeIdA)) == world;
}
int air_b3_shape_events(uint32_t lo, uint32_t hi, int flags)
{
    if (flags < 0 || flags > 7) return AIR_B3_ARGUMENT;
    b3ShapeId id = b3LoadShapeId(((uint64_t)hi << 32) | lo);
    if (!b3Shape_IsValid(id)) return AIR_B3_INVALID;
    b3Shape_EnableSensorEvents(id, (flags & 1) != 0); b3Shape_EnableContactEvents(id, (flags & 2) != 0); b3Shape_EnableHitEvents(id, (flags & 4) != 0);
    return AIR_B3_OK;
}
