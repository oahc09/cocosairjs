/* Copyright (c) 2026-2027 oahc09@gmail.com. MIT. */
/* Pinned internal compatibility shim: upstream pre-solve supplies this exact member.
 * No vendor bytes are changed. Revalidate offsetof and physical effects on upgrades. */
#include "contact.h"
#include <stddef.h>
void airSetContactMaterial(b2Manifold* manifold, float friction, float restitution, float tangentSpeed)
{
    b2ContactSim* sim = (b2ContactSim*)((char*)manifold - offsetof(b2ContactSim, manifold));
    if (friction >= 0) sim->friction = friction;
    if (restitution >= 0) sim->restitution = restitution;
    sim->tangentSpeed = tangentSpeed;
}
