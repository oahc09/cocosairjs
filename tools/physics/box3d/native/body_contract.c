/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Real core qualification, no mock body state and no product fault injection. */
#include "air_box3d.h"
#include "body.h"
#include "physics_world.h"
#include <box3d/box3d.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stddef.h>
#define CHECK(x) do{if(!(x)){fprintf(stderr,"FAIL %s:%d %s\n",__FILE__,__LINE__,#x);exit(1);}}while(0)
static void create(uint32_t w,int type,uint32_t* id){float p[16]={0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0};CHECK(!air_b3_body_create(w,type,p,1,id));}
static int near(float a,float b){return fabsf(a-b)<1e-4f;}
int main(void){
 uint32_t baseline[2];air_b3_live_bytes(baseline);uint32_t w=air_b3_world_create(0,0,0),other=air_b3_world_create(0,0,0),id[2],shape[2];CHECK(w&&other);create(w,2,id);
 float state[49],before[49],p[11]={0};CHECK(!air_b3_body_mass_set(w,id[0],id[1],12));CHECK(air_b3_body_mass_ready(w,id[0],id[1],12)==AIR_B3_MASS_PENDING);
 p[3]=1;p[4]=2;p[5]=3;p[9]=1;p[10]=1;CHECK(!air_b3_mass_shape_create(w,id[0],id[1],1,p,0,12,shape));CHECK(!air_b3_body_state(w,id[0],id[1],12,state));
 CHECK(near(state[31],12)&&near(state[35],52)&&near(state[39],40)&&near(state[43],20));
 float impulse[6]={0,0,20,0,0,0};CHECK(!air_b3_body_apply(w,id[0],id[1],3,0,impulse));CHECK(!air_b3_body_state(w,id[0],id[1],12,state));CHECK(near(state[18],1));
 memcpy(before,state,sizeof(state));
 CHECK(air_b3_body_state(other,id[0],id[1],12,state)==AIR_B3_INVALID);CHECK(!memcmp(before,state,sizeof(state)));
 b3World* internal=b3GetWorldFromId(b3LoadWorldId(w));internal->locked=true;
 CHECK(air_b3_body_state(w,id[0],id[1],12,state)==AIR_B3_LOCKED);CHECK(!memcmp(before,state,sizeof(state)));
 CHECK(air_b3_body_control(w,id[0],id[1],AIR_B3_CTL_CLEAR_STATE,NULL,12)==AIR_B3_LOCKED);
 CHECK(air_b3_body_mass_set(w,id[0],id[1],1)==AIR_B3_LOCKED);CHECK(air_b3_world_step(w,1.0f/60,4)==AIR_B3_LOCKED);internal->locked=false;
 CHECK(!air_b3_body_state(w,id[0],id[1],12,state)&&!memcmp(before,state,sizeof(state)));
 float bad[6]={NAN,0,0,0,0,0};CHECK(air_b3_body_apply(w,id[0],id[1],0,0,bad)==AIR_B3_ARGUMENT);
 CHECK(air_b3_body_mass_set(w,id[0],id[1],INFINITY)==AIR_B3_ARGUMENT);
 CHECK(!air_b3_body_state(w,id[0],id[1],12,state)&&!memcmp(before,state,sizeof(state)));
 float force[6]={12,0,0,0,1,0};CHECK(!air_b3_body_apply(w,id[0],id[1],0,0,force));
 CHECK(!air_b3_body_state(w,id[0],id[1],12,state));CHECK(state[19]==12&&state[24]==-12);
 CHECK(!air_b3_body_control(w,id[0],id[1],AIR_B3_CTL_CLEAR_FORCES,NULL,12));CHECK(!air_b3_body_state(w,id[0],id[1],12,state));CHECK(state[19]==0&&state[24]==0&&near(state[18],1));
 CHECK(!air_b3_body_control(w,id[0],id[1],AIR_B3_CTL_CLEAR_STATE,NULL,12));CHECK(!air_b3_world_step(w,1.0f/60,4));
 CHECK(!air_b3_body_state(w,id[0],id[1],12,state));CHECK(state[4]==1&&state[7]>0&&state[18]==0);
 float threshold[1]={0};CHECK(!air_b3_body_control(w,id[0],id[1],AIR_B3_CTL_SLEEP_THRESHOLD,threshold,12));
 for(int i=0;i<60;++i)CHECK(!air_b3_world_step(w,1.0f/60,4));CHECK(!air_b3_body_state(w,id[0],id[1],12,state));CHECK(state[3]==1&&state[4]==0);
 float wake[1]={1};CHECK(!air_b3_body_control(w,id[0],id[1],AIR_B3_CTL_AWAKE,wake,12));CHECK(!air_b3_body_state(w,id[0],id[1],12,state));CHECK(state[2]==1&&state[7]==0);
 float factors[6]={0,1,1,0,1,1},offsetImpulse[6]={2,3,4,1,2,.5f};
 CHECK(!air_b3_body_control(w,id[0],id[1],AIR_B3_CTL_FACTORS,factors,12));
 CHECK(!air_b3_body_apply(w,id[0],id[1],1,0,offsetImpulse));
 CHECK(!air_b3_body_state(w,id[0],id[1],12,state));CHECK(state[13]==0&&state[16]==0);
 CHECK(!air_b3_body_apply(w,id[0],id[1],3,0,offsetImpulse));
 CHECK(!air_b3_body_state(w,id[0],id[1],12,state));CHECK(state[16]==0);
 uint32_t old[2]={id[0],id[1]};CHECK(!air_b3_body_destroy(id[0],id[1]));create(w,2,id);CHECK(id[1]==old[1]&&id[0]!=old[0]);
 CHECK(air_b3_body_state(w,old[0],old[1],0,state)==AIR_B3_INVALID);
 float sphere[5]={1,0,0,0.5f,1};CHECK(!air_b3_mass_shape_create(w,id[0],id[1],0,sphere,1,2,shape));CHECK(!air_b3_body_state(w,id[0],id[1],2,state));CHECK(state[48]==1&&state[32]==1);
 uint32_t solid[2];sphere[0]=-1;CHECK(!air_b3_mass_shape_create(w,id[0],id[1],0,sphere,0,2,solid));CHECK(!air_b3_body_state(w,id[0],id[1],2,state));CHECK(state[48]==0&&state[32]==-1);
 CHECK(!air_b3_mass_shape_destroy(w,id[0],id[1],solid[0],solid[1],2));CHECK(!air_b3_body_state(w,id[0],id[1],2,state));CHECK(state[48]==1&&state[32]==1);
 CHECK(!air_b3_mass_shape_destroy(w,id[0],id[1],shape[0],shape[1],2));CHECK(air_b3_body_mass_ready(w,id[0],id[1],2)==AIR_B3_MASS_PENDING);
 CHECK(!air_b3_world_destroy(w));CHECK(!air_b3_world_destroy(other));uint32_t after[2];air_b3_live_bytes(after);CHECK(!memcmp(after,baseline,sizeof(after)));
 printf("{\"status\":\"PASS\",\"pointerBytes\":%zu,\"privateLayout\":{\"bodyBytes\":%zu,\"simBytes\":%zu,\"sleepTimeOffset\":%zu,\"sleepVelocityOffset\":%zu,\"forceOffset\":%zu,\"torqueOffset\":%zu},\"lockedWorldNoWrite\":true,\"fullGenerationWorldNoWrite\":true,\"boxMassAndAngularImpulse\":true,\"clearActualForceNotImpulse\":true,\"actualSleepTimerAndZeroThreshold\":true,\"sensorFallbackAndMixedExclusion\":true,\"pendingGeometryLifecycle\":true,\"immediateImpulseLocks\":true,\"coreBytesRestored\":true}\n",sizeof(void*),sizeof(b3Body),sizeof(b3BodySim),offsetof(b3Body,sleepTime),offsetof(b3Body,sleepVelocity),offsetof(b3BodySim,force),offsetof(b3BodySim,torque));
}
