/* Copyright (c) 2026-2027 oahc09@gmail.com. MIT. */
#include <emscripten/bind.h>
#include <box2d/box2d.h>
#include <box2d/math_functions.h>
#include <map>
#include <vector>
#include <cmath>
#include <stdexcept>
#include <string>
using emscripten::val;
extern "C" void airSetContactMaterial(b2Manifold*, float, float, float);
static unsigned nextHandle = 1;
struct World { b2WorldId id; val pre; World(b2WorldId i, val p): id(i), pre(p) {} };
static std::map<unsigned, World> worlds;
struct Body { b2BodyId id; unsigned world; };
struct Shape { b2ShapeId id; unsigned body; };
struct Joint { b2JointId id; unsigned bodyA, bodyB; };
static std::map<unsigned, Body> bodies;
static std::map<unsigned, Shape> shapes;
static std::map<unsigned, Joint> joints;
static double number(val o, const char* k, double fallback=0) { return o[k].isUndefined() ? fallback : o[k].as<double>(); }
static bool flag(val o, const char* k, bool fallback=false) { return o[k].isUndefined() ? fallback : o[k].as<bool>(); }
static val vec(b2Vec2 v) { val o=val::object(); o.set("x",v.x); o.set("y",v.y); return o; }
static b2Vec2 readVec(val o) { return {(float)number(o,"x"),(float)number(o,"y")}; }
static unsigned shapeHandle(b2ShapeId id) { return b2Shape_IsValid(id) ? (uintptr_t)b2Shape_GetUserData(id) : 0; }
static val manifoldValue(b2ShapeId a, b2ShapeId b, const b2Manifold& m, bool localAnchors=false) {
    val o=val::object(), points=val::array(); o.set("a",shapeHandle(a)); o.set("b",shapeHandle(b)); o.set("normal",vec(m.normal));
    b2BodyId bodyA=b2Shape_GetBody(a), bodyB=b2Shape_GetBody(b);
    b2Pos center=b2Body_GetWorldCenter(bodyA);
    if(localAnchors) center=b2Body_GetPosition(bodyA);
    for(int i=0;i<m.pointCount;++i) { auto& p=m.points[i]; val q=val::object();
        b2Pos position=b2OffsetPos(center,p.anchorA); q.set("x",position.x); q.set("y",position.y);
        q.set("separation",p.separation); q.set("normalImpulse",p.totalNormalImpulse); q.set("tangentImpulse",p.tangentImpulse);
        q.set("localA",vec(b2Body_GetLocalPoint(bodyA,position))); q.set("localB",vec(b2Body_GetLocalPoint(bodyB,position)));
        points.call<void>("push",q);
    } o.set("points",points); return o;
}
static void preSolve(b2ShapeId a,b2ShapeId b,b2Manifold* m,void* context) {
    auto* w=(World*)context;
    if(w->pre.isUndefined() || w->pre.isNull()) return;
    val result=w->pre(manifoldValue(a,b,*m,true),false);
    if(!result.isUndefined() && !result.isNull()) {
        airSetContactMaterial(m,number(result,"friction",-1),number(result,"restitution",-1),number(result,"tangentSpeed"));
        if(flag(result,"disabled")) m->pointCount=0;
    }
}
static bool preContinuous(b2ShapeId a,b2ShapeId b,b2Pos point,b2Vec2 normal,void* context) {
    auto* w=(World*)context; if(w->pre.isUndefined() || w->pre.isNull()) return true;
    val o=val::object(); o.set("a",shapeHandle(a));o.set("b",shapeHandle(b));o.set("normal",vec(normal));o.set("points",val::array());
    val result=w->pre(o,true); return result.isUndefined() || result.isNull() || !flag(result,"disabled");
}
static unsigned createWorld(val options,val pre) {
    b2WorldDef def=b2DefaultWorldDef(); def.gravity=readVec(options); def.workerCount=0;
    unsigned h=nextHandle++; auto [it,ok]=worlds.emplace(h,World(b2CreateWorld(&def),pre));
    b2World_SetPreSolveCallback(it->second.id,preSolve,preContinuous,&it->second); return h;
}
static void destroyWorld(unsigned w) {
    auto it=worlds.find(w); if(it==worlds.end())return;
    b2DestroyWorld(it->second.id);
    for(auto s=shapes.begin();s!=shapes.end();) { if(bodies.at(s->second.body).world==w)s=shapes.erase(s);else ++s; }
    for(auto j=joints.begin();j!=joints.end();) { if(bodies.at(j->second.bodyA).world==w)j=joints.erase(j);else ++j; }
    for(auto b=bodies.begin();b!=bodies.end();) { if(b->second.world==w)b=bodies.erase(b);else ++b; }
    worlds.erase(it);
}
static unsigned createBody(unsigned w,val o) {
    b2BodyDef d=b2DefaultBodyDef(); d.type=(b2BodyType)(int)number(o,"type");d.position={(float)number(o,"x"),(float)number(o,"y")};
    d.rotation=b2MakeRot(number(o,"angle")); d.linearVelocity={(float)number(o,"vx"),(float)number(o,"vy")}; d.angularVelocity=number(o,"av");
    d.linearDamping=number(o,"linearDamping");d.angularDamping=number(o,"angularDamping");d.gravityScale=number(o,"gravityScale",1);
    d.motionLocks.angularZ=flag(o,"fixedRotation");d.enableSleep=flag(o,"allowSleep",true);d.isAwake=flag(o,"awake",true);d.isBullet=flag(o,"bullet");
    unsigned h=nextHandle++;d.userData=(void*)(uintptr_t)h;bodies[h]={b2CreateBody(worlds.at(w).id,&d),w};return h;
}
static void destroyBody(unsigned h) {
    auto it=bodies.find(h);if(it==bodies.end())return;
    b2DestroyBody(it->second.id);
    for(auto s=shapes.begin();s!=shapes.end();)if(s->second.body==h)s=shapes.erase(s);else ++s;
    for(auto j=joints.begin();j!=joints.end();)if(j->second.bodyA==h||j->second.bodyB==h)j=joints.erase(j);else ++j;
    bodies.erase(it);
}
static val bodyState(unsigned h) {
    auto b=bodies.at(h).id;val o=val::object();auto p=b2Body_GetPosition(b);auto v=b2Body_GetLinearVelocity(b);
    o.set("x",p.x);o.set("y",p.y);o.set("angle",b2Rot_GetAngle(b2Body_GetRotation(b)));o.set("vx",v.x);o.set("vy",v.y);o.set("av",b2Body_GetAngularVelocity(b));
    o.set("awake",b2Body_IsAwake(b));o.set("enabled",b2Body_IsEnabled(b));o.set("mass",b2Body_GetMass(b));o.set("inertia",b2Body_GetRotationalInertia(b));
    o.set("localCenter",vec(b2Body_GetLocalCenter(b)));o.set("worldCenter",vec(b2Body_GetWorldCenter(b)));return o;
}
static void bodyCommand(unsigned h,std::string op,val o) {
    auto b=bodies.at(h).id;float n=number(o,"value");bool wake=flag(o,"wake",true);auto v=readVec(o);
    if(op=="transform")b2Body_SetTransform(b,{v.x,v.y},b2MakeRot(number(o,"angle")));
    else if(op=="velocity")b2Body_SetLinearVelocity(b,v);
    else if(op=="angularVelocity")b2Body_SetAngularVelocity(b,n);
    else if(op=="linearDamping")b2Body_SetLinearDamping(b,n);
    else if(op=="angularDamping")b2Body_SetAngularDamping(b,n);
    else if(op=="gravityScale")b2Body_SetGravityScale(b,n);
    else if(op=="type")b2Body_SetType(b,(b2BodyType)(int)n);
    else if(op=="awake")b2Body_SetAwake(b,n!=0);
    else if(op=="allowSleep")b2Body_EnableSleeping(b,n!=0);
    else if(op=="active"){if(n)b2Body_Enable(b);else b2Body_Disable(b);}
    else if(op=="fixedRotation"){b2MotionLocks locks=b2Body_GetMotionLocks(b);locks.angularZ=n!=0;b2Body_SetMotionLocks(b,locks);}
    else if(op=="force")b2Body_ApplyForce(b,v,{(float)number(o,"px"),(float)number(o,"py")},wake);
    else if(op=="forceCenter")b2Body_ApplyForceToCenter(b,v,wake);
    else if(op=="impulse")b2Body_ApplyLinearImpulse(b,v,{(float)number(o,"px"),(float)number(o,"py")},wake);
    else if(op=="impulseCenter")b2Body_ApplyLinearImpulseToCenter(b,v,wake);
    else if(op=="torque")b2Body_ApplyTorque(b,n,wake);
    else if(op=="angularImpulse")b2Body_ApplyAngularImpulse(b,n,wake);
    else throw std::invalid_argument("unknown body command");
}
static unsigned createShape(unsigned b,std::string kind,val o) {
    b2ShapeDef d=b2DefaultShapeDef();d.density=number(o,"density",1);d.material.friction=number(o,"friction",0.2);d.material.restitution=number(o,"restitution");
    d.isSensor=flag(o,"sensor");d.enableSensorEvents=true;d.enableContactEvents=true;d.enablePreSolveEvents=true;d.enableHitEvents=true;
    d.filter.categoryBits=(uint32_t)number(o,"category",1);d.filter.maskBits=(uint32_t)number(o,"mask",4294967295.0);
    unsigned h=nextHandle++;d.userData=(void*)(uintptr_t)h;auto body=bodies.at(b).id;b2ShapeId s=b2_nullShapeId;
    if(kind=="circle"){b2Circle c={readVec(o),(float)number(o,"radius")};s=b2CreateCircleShape(body,&d,&c);}
    else if(kind=="polygon") { std::vector<b2Vec2> p;auto v=o["points"];for(unsigned i=0;i<v["length"].as<unsigned>();++i)p.push_back(readVec(v[i]));
        b2Hull hull=b2ComputeHull(p.data(),p.size());if(hull.count<3)throw std::invalid_argument("degenerate polygon");
        auto poly=b2MakePolygon(&hull,0);s=b2CreatePolygonShape(body,&d,&poly);
    } else throw std::invalid_argument("unknown shape kind");
    if(!b2Shape_IsValid(s))throw std::invalid_argument("invalid shape");shapes[h]={s,b};return h;
}
static void destroyShape(unsigned h) {auto it=shapes.find(h);if(it!=shapes.end()){b2DestroyShape(it->second.id,true);shapes.erase(it);}}
static void shapeFilter(unsigned h,unsigned category,unsigned mask) {auto s=shapes.at(h).id;auto f=b2Shape_GetFilter(s);f.categoryBits=category;f.maskBits=mask;b2Shape_SetFilter(s,f);}
static val shapeBounds(unsigned h) {auto a=b2Shape_GetBounds(shapes.at(h).id);val o=val::object();o.set("lower",vec(a.lowerBound));o.set("upper",vec(a.upperBound));return o;}
static val query(unsigned w,std::string kind,val o) {
    val result=val::array();auto world=worlds.at(w).id;
    if(kind=="ray") { b2QueryFilter f=b2DefaultQueryFilter();f.maskBits=(uint32_t)number(o,"mask",4294967295.0);
        b2World_CastRay(world,{(float)number(o,"x"),(float)number(o,"y")},{(float)number(o,"dx"),(float)number(o,"dy")},f,
            [](b2ShapeId s,b2Pos p,b2Vec2 n,float fraction,void* c)->float{val row=val::object();row.set("shape",shapeHandle(s));row.set("point",vec({p.x,p.y}));row.set("normal",vec(n));row.set("fraction",fraction);((val*)c)->call<void>("push",row);return 1;},&result);
    } else {struct Context{val* rows;bool point;b2Pos p;} c={&result,kind=="point",{(float)number(o,"x"),(float)number(o,"y")}};
        b2AABB bounds=kind=="point"?b2AABB{{c.p.x-0.0001f,c.p.y-0.0001f},{c.p.x+0.0001f,c.p.y+0.0001f}}:b2AABB{{(float)number(o,"x"),(float)number(o,"y")},{(float)number(o,"maxX"),(float)number(o,"maxY")}};
        b2World_OverlapAABB(world,b2Pos_zero,bounds,b2DefaultQueryFilter(),[](b2ShapeId s,void* ptr)->bool {auto* c=(Context*)ptr;if(!c->point||b2Shape_TestPoint(s,c->p))c->rows->call<void>("push",shapeHandle(s));return true;},&c);
    }return result;
}
static val contacts(unsigned w) {
    val rows=val::array();auto world=worlds.at(w).id;
    for(auto& [h,b]:bodies) { if(b.world!=w)continue;int capacity=b2Body_GetContactCapacity(b.id);std::vector<b2ContactData> data(capacity);int count=b2Body_GetContactData(b.id,data.data(),capacity);
        for(int i=0;i<count;++i){auto& c=data[i];if(!B2_ID_EQUALS(b2Shape_GetBody(c.shapeIdA),b.id))continue;val row=manifoldValue(c.shapeIdA,c.shapeIdB,c.manifold);uint32_t key[3];b2StoreContactId(c.contactId,key);row.set("id",std::to_string(key[0])+":"+std::to_string(key[1])+":"+std::to_string(key[2]));rows.call<void>("push",row);}}
    return rows;
}
static val events(unsigned w) {
    auto world=worlds.at(w).id;val o=val::object(),begin=val::array(),end=val::array();auto s=b2World_GetSensorEvents(world);
    for(int i=0;i<s.beginCount;++i){val r=val::object();r.set("a",shapeHandle(s.beginEvents[i].sensorShapeId));r.set("b",shapeHandle(s.beginEvents[i].visitorShapeId));begin.call<void>("push",r);}
    for(int i=0;i<s.endCount;++i){val r=val::object();r.set("a",shapeHandle(s.endEvents[i].sensorShapeId));r.set("b",shapeHandle(s.endEvents[i].visitorShapeId));end.call<void>("push",r);}
    o.set("begin",begin);o.set("end",end);return o;
}
static void step(unsigned w,float dt,int count) {if(!(dt>=0)||!std::isfinite(dt)||count<1||count>64)throw std::invalid_argument("invalid step");b2World_Step(worlds.at(w).id,dt,count);}
static void worldCommand(unsigned w,std::string op,val o) {auto id=worlds.at(w).id;if(op=="gravity")b2World_SetGravity(id,readVec(o));else if(op=="allowSleep")b2World_EnableSleeping(id,flag(o,"value"));else throw std::invalid_argument("unknown world command");}
static val stats(unsigned w) {val o=val::object();auto c=b2World_GetCounters(worlds.at(w).id);o.set("bodies",c.bodyCount);o.set("shapes",c.shapeCount);o.set("joints",c.jointCount);o.set("contacts",c.contactCount);o.set("worlds",worlds.size());return o;}
static unsigned createJoint(unsigned w,std::string kind,unsigned a,unsigned b,val o) {
    b2JointDef base={};base.bodyIdA=bodies.at(a).id;base.bodyIdB=bodies.at(b).id;
    base.localFrameA={{(float)number(o,"ax"),(float)number(o,"ay")},b2MakeRot(number(o,"angleA"))};base.localFrameB={{(float)number(o,"bx"),(float)number(o,"by")},b2MakeRot(number(o,"angleB"))};base.collideConnected=flag(o,"collideConnected");base.constraintHertz=60;base.constraintDampingRatio=2;
    b2JointId joint=b2_nullJointId;auto id=worlds.at(w).id;
    if(kind=="distance"||kind=="spring"){auto d=b2DefaultDistanceJointDef();d.base=base;d.length=std::max(0.005,number(o,"length",1));d.enableSpring=kind=="distance"||number(o,"frequency",5)>0;d.hertz=kind=="spring"?number(o,"frequency",5):0;d.dampingRatio=number(o,"dampingRatio",0.7);d.enableLimit=kind=="distance";d.minLength=0.005;d.maxLength=d.length;joint=b2CreateDistanceJoint(id,&d);}
    else if(kind=="fixed"){auto d=b2DefaultWeldJointDef();d.base=base;d.linearHertz=d.angularHertz=number(o,"frequency");d.linearDampingRatio=d.angularDampingRatio=number(o,"dampingRatio",0.7);joint=b2CreateWeldJoint(id,&d);}
    else if(kind=="hinge"){auto d=b2DefaultRevoluteJointDef();d.base=base;d.enableLimit=flag(o,"enableLimit");d.lowerAngle=number(o,"lower");d.upperAngle=number(o,"upper");d.enableMotor=flag(o,"enableMotor");d.maxMotorTorque=number(o,"maxMotorTorque");d.motorSpeed=number(o,"motorSpeed");joint=b2CreateRevoluteJoint(id,&d);}
    else if(kind=="slider"){auto d=b2DefaultPrismaticJointDef();d.base=base;d.enableLimit=flag(o,"enableLimit");d.lowerTranslation=number(o,"lower");d.upperTranslation=number(o,"upper");d.enableMotor=flag(o,"enableMotor");d.maxMotorForce=number(o,"maxMotorForce");d.motorSpeed=number(o,"motorSpeed");joint=b2CreatePrismaticJoint(id,&d);}
    else if(kind=="wheel"){auto d=b2DefaultWheelJointDef();d.base=base;d.enableSpring=number(o,"frequency",5)>0;d.hertz=number(o,"frequency",5);d.dampingRatio=number(o,"dampingRatio",0.7);d.enableMotor=flag(o,"enableMotor");d.maxMotorTorque=number(o,"maxMotorTorque");d.motorSpeed=number(o,"motorSpeed");joint=b2CreateWheelJoint(id,&d);}
    else if(kind=="relative"||kind=="mouse"){auto d=b2DefaultMotorJointDef();d.base=base;d.linearHertz=number(o,"frequency",8);d.linearDampingRatio=number(o,"dampingRatio",1);d.angularHertz=kind=="mouse"?0:d.linearHertz;d.angularDampingRatio=d.linearDampingRatio;d.maxSpringForce=number(o,"maxForce",1000);d.maxSpringTorque=kind=="mouse"?0:number(o,"maxTorque",1000);joint=b2CreateMotorJoint(id,&d);}
    else throw std::invalid_argument("unknown joint kind");
    if(!b2Joint_IsValid(joint))throw std::invalid_argument("invalid joint");unsigned h=nextHandle++;joints[h]={joint,a,b};return h;
}
static void destroyJoint(unsigned h) {auto it=joints.find(h);if(it!=joints.end()){if(b2Joint_IsValid(it->second.id))b2DestroyJoint(it->second.id);joints.erase(it);}}
static bool jointValid(unsigned h){auto it=joints.find(h);return it!=joints.end()&&b2Joint_IsValid(it->second.id);}
static void jointTarget(unsigned h,float x,float y){auto j=joints.at(h).id;auto frame=b2Joint_GetLocalFrameA(j);frame.p={x,y};b2Joint_SetLocalFrameA(j,frame);b2Body_SetAwake(b2Joint_GetBodyB(j),true);}
EMSCRIPTEN_BINDINGS(air_box2d) {
    emscripten::function("createWorld",&createWorld);emscripten::function("destroyWorld",&destroyWorld);
    emscripten::function("createBody",&createBody);emscripten::function("destroyBody",&destroyBody);emscripten::function("bodyState",&bodyState);emscripten::function("bodyCommand",&bodyCommand);
    emscripten::function("createShape",&createShape);emscripten::function("destroyShape",&destroyShape);emscripten::function("shapeFilter",&shapeFilter);emscripten::function("shapeBounds",&shapeBounds);
    emscripten::function("query",&query);emscripten::function("contacts",&contacts);emscripten::function("events",&events);emscripten::function("step",&step);emscripten::function("worldCommand",&worldCommand);emscripten::function("stats",&stats);
    emscripten::function("createJoint",&createJoint);emscripten::function("destroyJoint",&destroyJoint);emscripten::function("jointValid",&jointValid);emscripten::function("jointTarget",&jointTarget);
}
