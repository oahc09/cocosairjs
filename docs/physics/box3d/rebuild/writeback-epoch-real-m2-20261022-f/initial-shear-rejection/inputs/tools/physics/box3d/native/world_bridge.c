/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* ST-only owned callback data; original core source and allocator are unchanged. */
#include "air_box3d.h"
#include "world_bridge.h"
#include <box3d/box3d.h>
#include <box3d/collision.h>
#include <float.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

enum { DEBUG_FLAGS = 5, DEBUG_WORDS = 8, DEBUG_MAX_PRIMITIVES = 65536, SPHERE_SEGMENTS = 24 };
typedef struct DebugShape { size_t bytes; int lineCount; b3Vec3 ends[]; } DebugShape;
typedef struct BridgeTemp { struct BridgeTemp* next; size_t bytes; } BridgeTemp;
typedef struct BridgeWorld {
    struct BridgeWorld* next;
    uint32_t id;
    uint64_t bytes;
    uint32_t allocations, shapes, capacity, count;
    uint32_t* wire;
    int error;
    bool captured;
    BridgeTemp* temporary;
} BridgeWorld;
static BridgeWorld* worlds;
#ifdef AIR_B3_BRIDGE_QUALIFICATION
/* Only present when this .c is compiled inside the independent C fixture. */
static int allocation_budget = -1;
#endif
static void* bridge_alloc(size_t bytes) {
#ifdef AIR_B3_BRIDGE_QUALIFICATION
    if (allocation_budget == 0) return NULL;
    if (allocation_budget > 0) --allocation_budget;
#endif
    return malloc(bytes);
}
static BridgeWorld* find_world(uint32_t id) {
    if (!b3World_IsValid(b3LoadWorldId(id))) return NULL;
    for (BridgeWorld* w = worlds; w; w = w->next) if (w->id == id) return w;
    return NULL;
}
static void* owned_alloc(BridgeWorld* w, size_t bytes) {
    void* p = bridge_alloc(bytes);
    if (p) { w->bytes += bytes; ++w->allocations; }
    return p;
}
static void owned_free(BridgeWorld* w, void* p, size_t bytes) {
    if (p) { free(p); w->bytes -= bytes; --w->allocations; }
}
void* air_b3_bridge_temp_alloc(uint32_t world, size_t bytes) {
    BridgeWorld* w=find_world(world);
    if(!w || !bytes || bytes>SIZE_MAX-sizeof(BridgeTemp) || w->bytes>UINT64_MAX-bytes-sizeof(BridgeTemp) || w->allocations==UINT32_MAX)return NULL;
    BridgeTemp* p=owned_alloc(w,sizeof(BridgeTemp)+bytes);if(!p)return NULL;
    p->bytes=bytes;p->next=w->temporary;w->temporary=p;return p+1;
}
void air_b3_bridge_temp_free(uint32_t world, void* pointer, size_t bytes) {
    BridgeWorld* w=find_world(world);
    B3_ASSERT(w && pointer && w->bytes>=bytes && w->allocations>0);
    BridgeTemp** link=&w->temporary;
    while(*link && (void*)(*link+1)!=pointer)link=&(*link)->next;
    B3_ASSERT(*link && (*link)->bytes==bytes);
    BridgeTemp* p=*link;*link=p->next;owned_free(w,p,sizeof(BridgeTemp)+bytes);
}
static void clear_temporary(BridgeWorld* w) {
    while(w->temporary){BridgeTemp* p=w->temporary;w->temporary=p->next;owned_free(w,p,sizeof(BridgeTemp)+p->bytes);}
}
static void clear_wire(BridgeWorld* w) {
    owned_free(w, w->wire, (size_t)w->capacity * DEBUG_WORDS * 4);
    w->wire = NULL; w->capacity = w->count = 0; w->captured = false;
}
static void* create_shape(const b3DebugShape* shape, void* context) {
    BridgeWorld* w = context;
    if (w->error) return NULL;
    int lines = 0;
    if (shape->type == b3_sphereShape) lines = 3 * SPHERE_SEGMENTS;
    else if (shape->type == b3_hullShape) {
        const b3HullData* h = shape->hull;
        if (h->edgeCount <= 0 || h->edgeCount > 254 || h->edgeCount % 2 || h->vertexCount <= 0 || h->vertexCount > 255) {
            w->error = AIR_B3_UNSUPPORTED; return NULL;
        }
        lines = h->edgeCount / 2;
    } else { w->error = AIR_B3_UNSUPPORTED; return NULL; }
    size_t bytes = sizeof(DebugShape) + (size_t)lines * 2 * sizeof(b3Vec3);
    DebugShape* result = owned_alloc(w, bytes);
    if (!result) { w->error = AIR_B3_ALLOCATION; return NULL; }
    result->bytes = bytes; result->lineCount = lines;
    if (shape->type == b3_sphereShape) {
        b3Sphere sphere = *shape->sphere;
        for (int axis = 0; axis < 3; ++axis) for (int i = 0; i < SPHERE_SEGMENTS; ++i) for (int end = 0; end < 2; ++end) {
            float a = (float)(i + end) * (6.2831853071795864769f / SPHERE_SEGMENTS);
            float p[3] = {sphere.center.x, sphere.center.y, sphere.center.z};
            p[(axis+1)%3] += sphere.radius * cosf(a); p[(axis+2)%3] += sphere.radius * sinf(a);
            result->ends[2*(axis*SPHERE_SEGMENTS+i)+end] = (b3Vec3){p[0],p[1],p[2]};
        }
    } else {
        const b3HullData* h = shape->hull;
        const b3Vec3* p = b3GetHullPoints(h);
        const b3HullHalfEdge* e = b3GetHullEdges(h);
        int n = 0;
        for (int i = 0; i < h->edgeCount; ++i) {
            if (e[i].twin >= h->edgeCount || e[i].origin >= h->vertexCount || e[e[i].twin].origin >= h->vertexCount) {
                w->error = AIR_B3_UNSUPPORTED; break;
            }
            if (i < e[i].twin) {
                if (n >= lines) { w->error = AIR_B3_UNSUPPORTED; break; }
                result->ends[2*n] = p[e[i].origin]; result->ends[2*n+1] = p[e[e[i].twin].origin]; ++n;
            }
        }
        if (n != lines || w->error) { owned_free(w, result, bytes); w->error = AIR_B3_UNSUPPORTED; return NULL; }
    }
    ++w->shapes;
    return result;
}
static void destroy_shape(void* userShape, void* context) {
    BridgeWorld* w = context; DebugShape* shape = userShape;
    size_t bytes = shape->bytes;
    --w->shapes; owned_free(w, shape, bytes);
}
static void put_float(uint32_t* p, float v) { memcpy(p, &v, 4); }
static void primitive(BridgeWorld* w, uint32_t kind, b3Pos a, b3Pos b, b3HexColor color) {
    if (w->error) return;
    if (!isfinite(a.x) || !isfinite(a.y) || !isfinite(a.z) || !isfinite(b.x) || !isfinite(b.y) || !isfinite(b.z)) {
        w->error = AIR_B3_ARGUMENT; return;
    }
    if (w->count == DEBUG_MAX_PRIMITIVES) { w->error = AIR_B3_CAPACITY; return; }
    if (w->count == w->capacity) {
        uint32_t cap = w->capacity ? w->capacity * 2 : 64;
        uint32_t* wire = owned_alloc(w, (size_t)cap * DEBUG_WORDS * 4);
        if (!wire) { w->error = AIR_B3_ALLOCATION; return; }
        if (w->count) memcpy(wire, w->wire, (size_t)w->count * DEBUG_WORDS * 4);
        owned_free(w, w->wire, (size_t)w->capacity * DEBUG_WORDS * 4);
        w->wire = wire; w->capacity = cap;
    }
    uint32_t* p = w->wire + DEBUG_WORDS * w->count++;
    p[0] = kind; p[1] = (uint32_t)color;
    put_float(p+2,a.x); put_float(p+3,a.y); put_float(p+4,a.z);
    put_float(p+5,b.x); put_float(p+6,b.y); put_float(p+7,b.z);
}
static void draw_shape(void* userShape, b3WorldTransform transform, b3HexColor color, void* context) {
    DebugShape* shape = userShape;
    for (int i=0; i<shape->lineCount; ++i)
        primitive(context,1,b3TransformWorldPoint(transform,shape->ends[2*i]),b3TransformWorldPoint(transform,shape->ends[2*i+1]),color);
}
static void draw_bounds(b3AABB aabb, b3HexColor color, void* context) {
    primitive(context,2,aabb.lowerBound,aabb.upperBound,color);
}
uint32_t air_b3_bridge_world_create(float gx, float gy, float gz) {
    BridgeWorld* w = bridge_alloc(sizeof(BridgeWorld));
    if (!w) return 0;
    memset(w,0,sizeof(*w)); w->bytes=sizeof(*w); w->allocations=1;
    b3WorldDef def=b3DefaultWorldDef(); def.gravity=(b3Vec3){gx,gy,gz}; def.workerCount=1;
    def.createDebugShape=create_shape; def.destroyDebugShape=destroy_shape; def.userDebugShapeContext=w;
    b3WorldId id=b3CreateWorld(&def);
    if (!b3World_IsValid(id)) { free(w); return 0; }
    w->id=b3StoreWorldId(id); w->next=worlds; worlds=w;
    return w->id;
}
int air_b3_bridge_world_destroy(uint32_t world) {
    BridgeWorld* w=find_world(world);
    if (!w) return AIR_B3_INVALID;
    b3DestroyWorld(b3LoadWorldId(world)); /* Calls destroy_shape for every remaining userShape. */
    clear_wire(w);
    clear_temporary(w); /* Unresolved temporary plans remain owned until world cleanup. */
    BridgeWorld** p=&worlds; while (*p != w) p=&(*p)->next; *p=w->next;
    int result=(w->shapes==0 && w->allocations==1 && w->bytes==sizeof(*w)) ? AIR_B3_OK : AIR_B3_ALLOCATION;
    free(w); return result;
}
int air_b3_world_gravity_get(uint32_t world,float* out) {
    if (!out) return AIR_B3_ARGUMENT;
    if (!find_world(world)) return AIR_B3_INVALID;
    b3Vec3 g=b3World_GetGravity(b3LoadWorldId(world)); out[0]=g.x;out[1]=g.y;out[2]=g.z;return AIR_B3_OK;
}
int air_b3_world_gravity_set(uint32_t world,float x,float y,float z) {
    if (!find_world(world)) return AIR_B3_INVALID;
    if (!isfinite(x)||!isfinite(y)||!isfinite(z)) return AIR_B3_ARGUMENT;
    b3World_SetGravity(b3LoadWorldId(world),(b3Vec3){x,y,z});return AIR_B3_OK;
}
int air_b3_world_sleep_get(uint32_t world,uint32_t* out) {
    if (!out) return AIR_B3_ARGUMENT;
    if (!find_world(world)) return AIR_B3_INVALID;
    *out=b3World_IsSleepingEnabled(b3LoadWorldId(world));return AIR_B3_OK;
}
int air_b3_world_sleep_set(uint32_t world,int enabled) {
    if (!find_world(world)) return AIR_B3_INVALID;
    if (enabled!=0 && enabled!=1) return AIR_B3_ARGUMENT;
    b3World_EnableSleeping(b3LoadWorldId(world),enabled!=0);return AIR_B3_OK;
}
static int owned_shape(uint32_t world,uint32_t lo,uint32_t hi,b3ShapeId* out) {
    if (!find_world(world)) return AIR_B3_INVALID;
    b3ShapeId shape=b3LoadShapeId(((uint64_t)hi<<32)|lo);
    if (!b3Shape_IsValid(shape)||b3StoreWorldId(b3Shape_GetWorld(shape))!=world) return AIR_B3_INVALID;
    if (b3Shape_GetType(shape)==b3_compoundShape) return AIR_B3_UNSUPPORTED;
    *out=shape;return AIR_B3_OK;
}
int air_b3_shape_material_get(uint32_t world,uint32_t lo,uint32_t hi,float* out) {
    if (!out) return AIR_B3_ARGUMENT;
    b3ShapeId shape;int status=owned_shape(world,lo,hi,&shape);if(status)return status;
    out[0]=b3Shape_GetFriction(shape);out[1]=b3Shape_GetRestitution(shape);return AIR_B3_OK;
}
int air_b3_shape_material_set(uint32_t world,uint32_t lo,uint32_t hi,float friction,float restitution) {
    b3ShapeId shape;int status=owned_shape(world,lo,hi,&shape);if(status)return status;
    if (!isfinite(friction)||!isfinite(restitution)||friction<0||restitution<0) return AIR_B3_ARGUMENT;
    b3Shape_SetFriction(shape,friction);b3Shape_SetRestitution(shape,restitution);return AIR_B3_OK;
}
int air_b3_world_debug_capture(uint32_t world,uint32_t flags,float scale,uint32_t* size) {
    if (!size||!isfinite(scale)||scale<0) return AIR_B3_ARGUMENT;
    BridgeWorld* w=find_world(world);if(!w)return AIR_B3_INVALID;
    if (flags & ~DEBUG_FLAGS) return AIR_B3_UNSUPPORTED;
    clear_wire(w);w->error=0;
    if (flags) {
        b3DebugDraw draw=b3DefaultDebugDraw();draw.DrawShapeFcn=draw_shape;draw.DrawBoundsFcn=draw_bounds;
        draw.drawShapes=(flags&1)!=0;draw.drawBounds=(flags&4)!=0;draw.jointScale=scale;draw.context=w;
        draw.drawingBounds=(b3AABB){{-FLT_MAX,-FLT_MAX,-FLT_MAX},{FLT_MAX,FLT_MAX,FLT_MAX}};
        b3World_Draw(b3LoadWorldId(world),&draw,UINT64_MAX);
    }
    if(w->error) { int status=w->error;clear_wire(w);return status; }
    w->captured=true;*size=1+w->count*DEBUG_WORDS;return AIR_B3_OK;
}
int air_b3_world_debug_copy(uint32_t world,uint32_t* out,int capacity) {
    BridgeWorld* w=find_world(world);if(!w)return AIR_B3_INVALID;
    if(!out||capacity<0)return AIR_B3_ARGUMENT;
    if(!w->captured)return AIR_B3_INVALID;
    if((uint32_t)capacity<1+w->count*DEBUG_WORDS)return AIR_B3_CAPACITY;
    out[0]=w->count;if(w->count)memcpy(out+1,w->wire,(size_t)w->count*DEBUG_WORDS*4);return AIR_B3_OK;
}
int air_b3_world_debug_release(uint32_t world) {
    BridgeWorld* w=find_world(world);if(!w)return AIR_B3_INVALID;clear_wire(w);return AIR_B3_OK;
}
int air_b3_bridge_memory(uint32_t world,uint32_t* out) {
    if(!out)return AIR_B3_ARGUMENT;
    BridgeWorld* w=world?find_world(world):worlds;if(world&&!w)return AIR_B3_INVALID;
    uint64_t bytes=0;uint32_t allocations=0,shapes=0,capacity=0,count=0;
    for(;w;w=world?NULL:w->next){bytes+=w->bytes;allocations+=w->allocations;shapes+=w->shapes;capacity+=w->capacity;count+=w->count;}
    out[0]=(uint32_t)bytes;out[1]=(uint32_t)(bytes>>32);out[2]=allocations;out[3]=shapes;out[4]=capacity;out[5]=count;
    return AIR_B3_OK;
}
