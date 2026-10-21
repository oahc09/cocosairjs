/* Copyright (c) 2026-2027 oahc09@gmail.com. MIT. */
#include "sample.h"
#include "implot.h"
#include <emscripten/bind.h>
#include <GLFW/glfw3.h>
#include <cmath>
#include <cstdarg>
#include <cstdio>
#include <vector>
#include <string>
#include <stdexcept>
#include <algorithm>
#include "sample_replay.cpp"
using emscripten::val;
struct Draw {};
static SampleContext context;
static Sample* current=nullptr;
static size_t baselineBytes=0;
static bool capture=false;
static std::vector<float> geometry;
static std::vector<std::string> texts;
static unsigned primitiveCount=0, invalidCount=0;
static int heldKey=-1;
extern "C" int glfwGetKey(GLFWwindow*,int key){return key==heldKey?GLFW_PRESS:GLFW_RELEASE;}
extern "C" void glfwSetWindowShouldClose(GLFWwindow*,int){}
static void primitive(int kind,const std::vector<float>& p,b2HexColor color) {
    ++primitiveCount;for(float f:p)if(!std::isfinite(f))++invalidCount;
    if(!capture)return;
    geometry.push_back(kind);geometry.push_back((int)color);geometry.push_back(p.size());geometry.insert(geometry.end(),p.begin(),p.end());
}
extern "C" {
Camera GetDefaultCamera(){return {{0,20},25,1280,720};}
void ResetView(Camera* c){*c=GetDefaultCamera();}
b2Pos ConvertScreenToWorld(Camera* c,b2Vec2 p){return b2OffsetPos(c->center,{(p.x/c->width*2-1)*c->zoom*c->width/c->height,(1-p.y/c->height*2)*c->zoom});}
b2Vec2 ConvertViewToScreen(Camera* c,b2Vec2 p){return {(p.x/(c->zoom*c->width/c->height)+1)*c->width/2,(1-p.y/c->zoom)*c->height/2};}
b2Vec2 ConvertWorldToScreen(Camera* c,b2Pos p){return ConvertViewToScreen(c,b2SubPos(p,c->center));}
b2AABB GetViewBounds(Camera* c){float x=c->zoom*c->width/c->height;return {{c->center.x-x,c->center.y-c->zoom},{c->center.x+x,c->center.y+c->zoom}};}
void FocusOnBounds(Camera* c,b2AABB a){c->center={(a.lowerBound.x+a.upperBound.x)*0.5f,(a.lowerBound.y+a.upperBound.y)*0.5f};c->zoom=1.2f*std::max((a.upperBound.y-a.lowerBound.y)/2,(a.upperBound.x-a.lowerBound.x)*c->height/c->width/2);}
Draw* CreateDraw(){return new Draw();}void DestroyDraw(Draw* d){delete d;}
void DrawScreenString(Draw*,float,float,b2HexColor,const char* format,...){char text[2048];va_list a;va_start(a,format);vsnprintf(text,sizeof(text),format,a);va_end(a);if(capture)texts.push_back(text);}
void SetDrawOrigin(Draw*,b2Pos){}
void DrawPoint(Draw*,b2Pos p,float size,b2HexColor c){primitive(1,{p.x,p.y,size},c);}
void DrawLine(Draw*,b2Pos a,b2Pos b,b2HexColor c){primitive(2,{a.x,a.y,b.x,b.y},c);}
void DrawCircle(Draw*,b2Pos p,float radius,b2HexColor c){primitive(3,{p.x,p.y,radius},c);}
void DrawCapsule(Draw* d,b2Pos a,b2Pos b,float r,b2HexColor c){DrawCircle(d,a,r,c);DrawCircle(d,b,r,c);DrawLine(d,a,b,c);}
void DrawPolygon(Draw*,b2WorldTransform t,const b2Vec2* p,int n,b2HexColor c){std::vector<float> v;for(int i=0;i<n;++i){auto q=b2TransformPoint(t,p[i]);v.push_back(q.x);v.push_back(q.y);}primitive(4,v,c);}
void DrawSolidCircle(Draw* d,b2WorldTransform t,b2Vec2 p,float r,b2HexColor c){DrawCircle(d,b2TransformPoint(t,p),r,c);}
void DrawSolidPolygon(Draw* d,b2WorldTransform t,const b2Vec2* p,int n,float,b2HexColor c){DrawPolygon(d,t,p,n,c);}
void DrawTransform(Draw* d,b2WorldTransform t,float scale){DrawLine(d,t.p,b2TransformPoint(t,{scale,0}),b2_colorRed);DrawLine(d,t.p,b2TransformPoint(t,{0,scale}),b2_colorGreen);}
void DrawBounds(Draw* d,b2AABB a,b2HexColor c){b2Vec2 p[4]={{a.lowerBound.x,a.lowerBound.y},{a.upperBound.x,a.lowerBound.y},{a.upperBound.x,a.upperBound.y},{a.lowerBound.x,a.upperBound.y}};DrawPolygon(d,{b2Pos_zero,b2Rot_identity},p,4,c);}
void DrawString(Draw*,Camera*,b2Pos,b2HexColor,const char* format,...){char text[2048];va_list a;va_start(a,format);vsnprintf(text,sizeof(text),format,a);va_end(a);if(capture)texts.push_back(text);}
void FlushDraw(Draw*,Camera*){}void DrawBackground(Draw*,Camera*){}
}
// The original framework's draw callbacks are exported from sample.cpp.
extern void DrawPolygonFcn(b2WorldTransform,const b2Vec2*,int,b2HexColor,void*);
extern void DrawSolidPolygonFcn(b2WorldTransform,const b2Vec2*,int,float,b2HexColor,void*);
extern void DrawCircleFcn(b2Pos,float,b2HexColor,void*);
extern void DrawSolidCircleFcn(b2WorldTransform,b2Vec2,float,b2HexColor,void*);
extern void DrawSolidCapsuleFcn(b2Pos,b2Pos,float,b2HexColor,void*);
extern void DrawLineFcn(b2Pos,b2Pos,b2HexColor,void*);
extern void DrawTransformFcn(b2WorldTransform,void*);
extern void DrawPointFcn(b2Pos,float,b2HexColor,void*);
extern void DrawStringFcn(b2Pos,const char*,b2HexColor,void*);
static void initialize() {
    if(ImGui::GetCurrentContext())return;
    ImGui::CreateContext();ImPlot::CreateContext();auto& io=ImGui::GetIO();io.IniFilename=nullptr;io.LogFilename=nullptr;
    io.DisplaySize={1280,720};io.DeltaTime=1.0f/60;unsigned char* pixels;int width,height;io.Fonts->GetTexDataAsRGBA32(&pixels,&width,&height);
}
static val list() {
    val rows=val::array();for(int i=0;i<g_sampleCount;++i){val r=val::object();r.set("index",i);r.set("category",std::string(g_sampleEntries[i].category));r.set("name",std::string(g_sampleEntries[i].name));rows.call<void>("push",r);}return rows;
}
static void replayFixture() {
    b2WorldDef wd=b2DefaultWorldDef();wd.workerCount=0;auto w=b2CreateWorld(&wd);auto groundDef=b2DefaultBodyDef();groundDef.position={0,-1};auto ground=b2CreateBody(w,&groundDef);auto sd=b2DefaultShapeDef();auto floor=b2MakeBox(20,1);b2CreatePolygonShape(ground,&sd,&floor);auto d=b2DefaultBodyDef();d.type=b2_dynamicBody;d.position={0,10};auto b=b2CreateBody(w,&d);auto poly=b2MakeBox(1,1);b2CreatePolygonShape(b,&sd,&poly);
    auto rec=b2CreateRecording(0);b2World_StartRecording(w,rec);for(int i=0;i<180;++i)b2World_Step(w,1.0f/60,4);b2World_StopRecording(w);if(!b2Recording_SaveToFile(rec,"/fixture.b2rec"))throw std::runtime_error("fixture save failed");b2DestroyRecording(rec);b2DestroyWorld(w);
}
static val closeSample() {
    delete current;current=nullptr;val o=val::object();o.set("bytes",(double)b2GetByteCount());o.set("baselineBytes",(double)baselineBytes);o.set("released",b2GetByteCount()==baselineBytes);return o;
}
static void openSample(int index) {
    initialize();if(current)closeSample();if(index<0||index>=g_sampleCount)throw std::out_of_range("sample index");
    baselineBytes=b2GetByteCount();context=SampleContext{};context.camera=GetDefaultCamera();static Draw draw;context.draw=&draw;context.workerCount=0;context.showUI=false;context.showProfile=false;context.capacity=b2DefaultWorldDef().capacity;
    if(g_sampleEntries[index].capacityFcn)context.capacity=g_sampleEntries[index].capacityFcn();
    auto& dd=context.debugDraw;dd=b2DefaultDebugDraw();dd.context=&context;dd.drawShapes=true;dd.drawJoints=true;
    dd.DrawPolygonFcn=DrawPolygonFcn;dd.DrawSolidPolygonFcn=DrawSolidPolygonFcn;dd.DrawCircleFcn=DrawCircleFcn;dd.DrawSolidCircleFcn=DrawSolidCircleFcn;dd.DrawSolidCapsuleFcn=DrawSolidCapsuleFcn;dd.DrawLineFcn=DrawLineFcn;dd.DrawTransformFcn=DrawTransformFcn;dd.DrawPointFcn=DrawPointFcn;dd.DrawStringFcn=DrawStringFcn;
    if(index==g_replayIndex){replayFixture();snprintf(context.replayFile,sizeof(context.replayFile),"/fixture.b2rec");context.restart=true;}
    current=g_sampleEntries[index].createFcn(&context);context.sample=current;
    if(index==g_replayIndex)context.pause=false;
    primitiveCount=invalidCount=0;geometry.clear();texts.clear();
}
static val snapshot() {
    val o=val::object();o.set("step",current?current->m_stepCount:0);o.set("primitives",primitiveCount);o.set("invalid",invalidCount);o.set("bytes",(double)b2GetByteCount());
    val camera=val::object();camera.set("x",context.camera.center.x);camera.set("y",context.camera.center.y);camera.set("zoom",context.camera.zoom);o.set("camera",camera);
    val data=val::array();for(float f:geometry)data.call<void>("push",f);o.set("geometry",data);val lines=val::array();for(auto& t:texts)lines.call<void>("push",t);o.set("text",lines);
    if(current&&B2_IS_NON_NULL(current->m_worldId)){auto w=current->m_worldId;auto c=b2World_GetCounters(w);o.set("bodies",c.bodyCount);o.set("shapes",c.shapeCount);o.set("joints",c.jointCount);o.set("contacts",c.contactCount);auto b=b2World_GetBounds(w);val a=val::array();a.call<void>("push",b.lowerBound.x);a.call<void>("push",b.lowerBound.y);a.call<void>("push",b.upperBound.x);a.call<void>("push",b.upperBound.y);o.set("bounds",a);}
    return o;
}
static val tick(int frames,bool record) {
    if(!current)throw std::runtime_error("no sample");
    for(int i=0;i<frames;++i){capture=record&&i==frames-1;geometry.clear();texts.clear();ImGui::NewFrame();ImGui::Begin("Controls");current->ResetText();current->Step();ImGui::End();ImGui::EndFrame();}
    return snapshot();
}
static void key(int key,bool pressed){heldKey=pressed?key:-1;if(current)current->Keyboard(key,pressed?GLFW_PRESS:GLFW_RELEASE,0);}
static void pointer(float x,float y,int action){if(!current)return;b2Pos p={x,y};if(action==0)current->MouseDown(p,GLFW_MOUSE_BUTTON_LEFT,0);else if(action==1)current->MouseMove(p);else current->MouseUp(p,GLFW_MOUSE_BUTTON_LEFT);}
EMSCRIPTEN_BINDINGS(air_samples){emscripten::function("list",&list);emscripten::function("open",&openSample);emscripten::function("tick",&tick);emscripten::function("snapshot",&snapshot);emscripten::function("close",&closeSample);emscripten::function("key",&key);emscripten::function("pointer",&pointer);}
