/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#include "contact.h"
#include <stddef.h>
#include <stdio.h>
int main(void)
{
    printf("{\"pointerBytes\":%zu,\"contactBytes\":%zu,\"manifoldBytes\":%zu,\"manifoldPointBytes\":%zu,\"contactGenerationOffset\":%zu,\"contactManifoldsOffset\":%zu",
        sizeof(void*),sizeof(b3Contact),sizeof(b3Manifold),sizeof(b3ManifoldPoint),offsetof(b3Contact,generation),offsetof(b3Contact,manifolds));
#ifdef AIR_GEOMETRY_EXTENSION
    printf(",\"basisBytes\":%zu,\"validOffset\":%zu,\"basisOffset\":%zu",sizeof(b3ContactGeometryBasis),offsetof(b3Contact,geometryValid),offsetof(b3Contact,geometryBasis));
#endif
    puts("}");return 0;
}
