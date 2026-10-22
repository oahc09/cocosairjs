/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Header-only host layout evidence. Must be repeated on WASM32, not reused. */
#include <box3d/types.h>
#include <box3d/constants.h>
#include <stddef.h>
#include <stdio.h>
#define SIZE(type) printf("\"" #type "\":%zu,", sizeof(type))
#define OFFSET(type,field) printf("\"" #type "." #field "\":%zu,", offsetof(type, field))
int main(void) {
    printf("{\"pointerBytes\":%zu,\"sizes\":{", sizeof(void*));
    SIZE(b3WorldDef); SIZE(b3BodyDef); SIZE(b3ShapeDef); SIZE(b3Counters);
    SIZE(b3HullData); SIZE(b3BoxHull); SIZE(b3MeshData); SIZE(b3MeshDef);
    SIZE(b3CompoundData); SIZE(b3ChildShape); SIZE(b3ManifoldPoint);
    SIZE(b3ContactId); SIZE(b3BodyId); SIZE(b3ShapeId); SIZE(b3PlaneResult);
    printf("\"b3WorldId\":%zu},\"offsets\":{", sizeof(b3WorldId));
    OFFSET(b3Counters,byteCount); OFFSET(b3ManifoldPoint,baseSeparation);
    OFFSET(b3ManifoldPoint,normalImpulse); OFFSET(b3ManifoldPoint,normalVelocity);
    OFFSET(b3HullData,hash); OFFSET(b3HullData,byteCount); OFFSET(b3BodyDef,internalValue);
    printf("\"b3ShapeDef.internalValue\":%zu},\"hashBytes\":{\"hull\":%zu,\"mesh\":%zu,\"heightField\":%zu},\"enumValues\":{\"staticBody\":%d,\"kinematicBody\":%d,\"dynamicBody\":%d,\"maxManifoldPoints\":%d}}\n", offsetof(b3ShapeDef,internalValue),sizeof(((b3HullData*)0)->hash),sizeof(((b3MeshData*)0)->hash),sizeof(((b3HeightFieldData*)0)->hash),b3_staticBody,b3_kinematicBody,b3_dynamicBody,B3_MAX_MANIFOLD_POINTS);
    return 0;
}
