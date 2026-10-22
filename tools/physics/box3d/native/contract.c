/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#include "air_box3d.h"
#include <box3d/box3d.h>
#include <box3d/constants.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(expr) do { if (!(expr)) { fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #expr); exit(1); } } while (0)
#define NEAR(a,b,t) CHECK(fabs((double)(a)-(double)(b)) <= (t))
static const float DEFAULT_INPUT[16] = {0,20,0, 0,0,0,1, 0,0,0, 0,0,0, 0,0,1};
static uint64_t bytes(void) { uint32_t b[2]; air_b3_live_bytes(b); return ((uint64_t)b[1] << 32) | b[0]; }

int main(void)
{
    CHECK(air_b3_abi_version() == 1);
    CHECK(strcmp(air_b3_core_sha(), "efca0c184d40fd6a82016983f1601c4d23965867") == 0);
    CHECK(!b3IsDoublePrecision());
    CHECK(b3GetMaxManifoldPoints() == 4);
    const uint64_t before = bytes();
    CHECK(air_b3_world_create(NAN, -10, 0) == 0);
    uint32_t world = air_b3_world_create(0, -10, 0), body[2], shape[2];
    CHECK(world && air_b3_world_valid(world));
    CHECK(air_b3_world_step(world, 1.0f/60, 0) == AIR_B3_ARGUMENT);
    CHECK(air_b3_world_step(world, NAN, 4) == AIR_B3_ARGUMENT);
    CHECK(air_b3_body_create(world, 2, DEFAULT_INPUT, 0, body) == 0);
    CHECK(air_b3_shape_sphere(body[0], body[1], 0.5f, 12.0f / 3.14159265358979323846f, shape) == 0);
    float snapshot[29];
    CHECK(air_b3_body_snapshot(body[0], body[1], snapshot) == 0);
    NEAR(snapshot[16], 2, 1e-4);
    CHECK(air_b3_body_impulse(body[0], body[1], 2, 0, 0) == 0);
    CHECK(air_b3_body_snapshot(body[0], body[1], snapshot) == 0);
    NEAR(snapshot[7], 1, 1e-4);
    CHECK(air_b3_body_velocity(body[0], body[1], NAN, 0, 0) == AIR_B3_ARGUMENT);
    CHECK(air_b3_body_snapshot(body[0], body[1], snapshot) == 0);
    NEAR(snapshot[7], 1, 1e-4);
    printf("{\"schemaVersion\":1,\"scope\":\"native-foundation-only\",\"coreSha\":\"%s\",\"schemaSha256\":\"%s\",\"freefallTicks\":[", air_b3_core_sha(), air_b3_schema_sha());
    for (int tick = 1; tick <= 60; ++tick) {
        CHECK(air_b3_world_step(world, 1.0f/60, 4) == 0);
        CHECK(air_b3_body_snapshot(body[0], body[1], snapshot) == 0);
        printf("%s[%d,%.9g,%.9g,%.9g]", tick == 1 ? "" : ",", tick, snapshot[0], snapshot[1], snapshot[8]);
    }
    NEAR(snapshot[0], 1, 1e-4); NEAR(snapshot[1], 15, 0.05); NEAR(snapshot[8], -10, 0.01);
    float ray[6] = {snapshot[0], snapshot[1] + 2, snapshot[2], 0, -4, 0}, hit[8];
    uint32_t hit_shape[2], counts[6];
    CHECK(air_b3_ray_closest(world, ray, hit, hit_shape) == 0);
    CHECK(hit[0] == 1 && hit_shape[0] == shape[0] && hit_shape[1] == shape[1]);
    NEAR(hit[7], 0.375, 1e-4);
    CHECK(air_b3_world_counts(world, counts) == 0 && counts[0] == 1 && counts[1] == 1);
    CHECK(air_b3_body_destroy(body[0], body[1]) == 0);
    CHECK(!air_b3_body_valid(body[0], body[1]) && !air_b3_shape_valid(shape[0], shape[1]));
    CHECK(air_b3_body_destroy(body[0], body[1]) == AIR_B3_INVALID);
    uint32_t replacement[2];
    CHECK(air_b3_body_create(world, 0, DEFAULT_INPUT, 0, replacement) == 0);
    CHECK(body[0] != replacement[0] || body[1] != replacement[1]);
    CHECK(!air_b3_body_valid(body[0], body[1]));
    CHECK(air_b3_world_destroy(world) == 0);
    CHECK(!air_b3_body_valid(replacement[0], replacement[1]) && !air_b3_world_valid(world));
    CHECK(air_b3_world_destroy(world) == AIR_B3_INVALID);
    CHECK(bytes() == before);
    printf("],\"rayFraction\":%.9g,\"mass\":%.9g,\"invalidSetterRollback\":true,\"staleIdsRejected\":true", hit[7], snapshot[16]);

    world = air_b3_world_create(0, 0, 0);
    float input[16]; memcpy(input, DEFAULT_INPUT, sizeof(input)); input[7] = 10; input[13] = 1;
    CHECK(air_b3_body_create(world, 2, input, 0, body) == 0);
    CHECK(air_b3_shape_box(body[0], body[1], 1, 2, 3, 0.25f, shape) == 0);
    CHECK(air_b3_body_snapshot(body[0], body[1], snapshot) == 0);
    NEAR(snapshot[16], 12, 1e-4); NEAR(snapshot[20], 52, 1e-4); NEAR(snapshot[24], 40, 1e-4); NEAR(snapshot[28], 20, 1e-4);
    for (int tick = 0; tick < 60; ++tick) CHECK(air_b3_world_step(world, 1.0f/60, 4) == 0);
    CHECK(air_b3_body_snapshot(body[0], body[1], snapshot) == 0);
    const double expected = 10 * pow(1 + 1.0/240, -240);
    NEAR(snapshot[7], expected, 0.001);
    printf(",\"dampingVelocity\":%.9g,\"dampingExpected\":%.12g,\"boxInertia\":[52,40,20]", snapshot[7], expected);
    CHECK(air_b3_world_destroy(world) == 0 && bytes() == before);

    world = air_b3_world_create(0, -10, 0);
    memcpy(input, DEFAULT_INPUT, sizeof(input)); input[1] = -0.5f;
    CHECK(air_b3_body_create(world, 0, input, 0, body) == 0);
    CHECK(air_b3_shape_box(body[0], body[1], 10, 0.5f, 10, 1, shape) == 0);
    memcpy(input, DEFAULT_INPUT, sizeof(input)); input[1] = 3;
    CHECK(air_b3_body_create(world, 2, input, 0, body) == 0);
    CHECK(air_b3_shape_sphere(body[0], body[1], 0.5f, 1, shape) == 0);
    for (int tick = 0; tick < 600; ++tick) CHECK(air_b3_world_step(world, 1.0f/60, 4) == 0);
    CHECK(air_b3_body_snapshot(body[0], body[1], snapshot) == 0);
    NEAR(snapshot[1], 0.5, 0.02); NEAR(snapshot[8], 0, 0.01);
    CHECK(air_b3_world_counts(world, counts) == 0 && counts[2] > 0);
    printf(",\"settledHeight\":%.9g,\"contactCount\":%u", snapshot[1], counts[2]);
    CHECK(air_b3_world_destroy(world) == 0 && bytes() == before);
    for (int cycle = 0; cycle < 16; ++cycle) {
        world = air_b3_world_create(0, -10, 0);
        CHECK(air_b3_body_create(world, 2, DEFAULT_INPUT, 0, body) == 0);
        CHECK(air_b3_shape_box(body[0], body[1], 1, 1, 1, 1, shape) == 0);
        CHECK(air_b3_world_step(world, 1.0f/60, 4) == 0);
        CHECK(air_b3_world_destroy(world) == 0 && bytes() == before);
    }
    printf(",\"lifecycleCycles\":16,\"nativeBytesBefore\":%llu,\"nativeBytesAfter\":%llu,\"status\":\"PASS\"}\n", (unsigned long long)before, (unsigned long long)bytes());
    return 0;
}
