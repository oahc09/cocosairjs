/** CPU geometry model, NOT native integration or an event producer.
 * Axis-aligned, centered sphere/box; translation along x, y=z=0, identity rotations.
 * All declared physical constants stay explicit. Predictions must be compared with actual public poses.
 */
export const THIN_GEOMETRY = Object.freeze({sphereRadius: .15, boxSize: Object.freeze({x:.01,y:1,z:.8})});
export const DT32 = Math.fround(1/60);
export const SUBSTEP_DT32 = Math.fround(DT32/4);
export function nativeExtent(geometry = THIN_GEOMETRY) {
    return Math.fround(geometry.sphereRadius) + Math.fround(geometry.boxSize.x/2);
}
export function predictEndpoints({speed,start,ticks=24,geometry=THIN_GEOMETRY}) {
    if(!Number.isFinite(speed) || speed<=0 || !Number.isFinite(start) || !Number.isInteger(ticks) || ticks<=0) throw Error('Invalid thin-path parameters');
    const extent=nativeExtent(geometry), displacement32=Math.fround(SUBSTEP_DT32*speed);
    const samples=[]; let x=Math.fround(start);
    const append=(substep,position)=>samples.push({substep,tick:substep/4,x:position,clearance:Math.abs(position)-extent,overlap:Math.abs(position)<=extent});
    append(0,x);
    // The core accumulates a local delta across four subdivisions, then commits once per tick.
    for(let tick=1;tick<=ticks;tick++) {
        let delta=0;
        for(let substep=1;substep<=4;substep++) {
            delta=Math.fround(delta+displacement32);
            append((tick-1)*4+substep,Math.fround(x+delta));
        }
        x=Math.fround(x+delta);
    }
    return {kind:'CPU_FLOAT32_FREE_MOTION_MODEL_NOT_NATIVE_TRACE',speed,start,ticks,dt:DT32,substepDt:SUBSTEP_DT32,
        extent,displacement32,samples,minimumClearance:Math.min(...samples.map(s=>s.clearance)),
        tickOverlaps:samples.filter(s=>s.substep%4===0 && s.overlap),substepOverlaps:samples.filter(s=>s.overlap),
        traverses:samples[0].x < -extent && samples.at(-1).x > extent};
}
/** Uniform endpoint lattice: an interval wider than the stride cannot be missed by all samples
 * during a complete crossing. This tests identifiability, not whether core samples sensors per substep.
 */
export function canAvoidAllSubstepEndpoints(speed,geometry=THIN_GEOMETRY) {
    return Math.fround(SUBSTEP_DT32*speed) > 2*nativeExtent(geometry);
}
/** Source-derived target model: float32 wire target, invDt multiplication, 4 local-delta updates.
 * No contacts/forces/rotation. This is still CPU prediction, not a measurement of hidden native substeps.
 */
export function predictTargetEndpoints({speed,start,ticks=24,geometry=THIN_GEOMETRY}) {
    const extent=nativeExtent(geometry), invDt=Math.fround(1/DT32), samples=[{substep:0,tick:0,x:Math.fround(start),velocity:0,target:null,clearance:Math.abs(start)-extent,overlap:Math.abs(start)<=extent}];
    let x=Math.fround(start);
    for(let tick=1;tick<=ticks;tick++) {
        const target=Math.fround(start+tick*speed*DT32), velocity=Math.fround(invDt*Math.fround(target-x));
        let delta=0;
        for(let substep=1;substep<=4;substep++) {
            delta=Math.fround(delta+Math.fround(SUBSTEP_DT32*velocity));
            const position=Math.fround(x+delta);
            samples.push({substep:(tick-1)*4+substep,tick:(tick-1)+substep/4,x:position,velocity,target,
                clearance:Math.abs(position)-extent,overlap:Math.abs(position)<=extent});
        }
        x=Math.fround(x+delta);
    }
    return {kind:'CPU_FLOAT32_KINEMATIC_TARGET_MODEL_NOT_NATIVE_TRACE',speed,start,ticks,dt:DT32,substepDt:SUBSTEP_DT32,
        extent,samples,minimumClearance:Math.min(...samples.map(s=>s.clearance)),
        tickOverlaps:samples.filter(s=>s.substep%4===0&&s.overlap),substepOverlaps:samples.filter(s=>s.overlap),
        traverses:samples[0].x < -extent && samples.at(-1).x > extent};
}
export function pathFor(config) {
    return config.mover==='sensor' ? predictTargetEndpoints(config) : predictEndpoints(config);
}
/** The before hook precedes this tick's native target application. Sensor velocity therefore
 * equals the PREVIOUS committed target velocity (zero on the very first tick), not the new target velocity.
 * Checks consume the copied raw observation, not a dimensions-only boolean.
 */
export function qualifyThinBefore(row,config) {
    const failures=[];
    const requireValue=(label,condition)=>{if(condition!==true)failures.push(label);};
    const finiteVector=v=>!!v&&['x','y','z'].every(k=>Number.isFinite(v[k]));
    const sameVector=(a,b)=>finiteVector(a)&&finiteVector(b)&&['x','y','z'].every(k=>a[k]===b[k]);
    const zero=v=>sameVector(v,{x:0,y:0,z:0});
    const identity=q=>!!q&&q.x===0&&q.y===0&&q.z===0&&Math.abs(q.w)===1;
    const sameRotation=(a,b)=>identity(a)&&identity(b)&&['x','y','z','w'].every(k=>a[k]===b[k]);
    const validStep=Number.isInteger(row?.step)&&row.step>=1&&row.step<=config.ticks;
    requireValue('before-step',validStep);
    requireValue('before-hook-clock',Number.isInteger(row?.generation)&&row.generation>0&&Number.isInteger(row?.hookTick)&&row.hookTick>=0&&Number.isInteger(row?.hookAttempt)&&row.hookAttempt>=0);
    const model=pathFor(config), previous=validStep?model.samples[(row.step-1)*4]:undefined;
    const expectedX=previous?.x, expectedVelocity=config.mover==='sensor'?previous?.velocity:config.speed;
    const pair=row?.pair, visitor=pair?.visitor, sensor=pair?.countZone;
    const mover=config.mover==='sensor'?sensor:visitor, stationary=config.mover==='sensor'?visitor:sensor;
    requireValue('before-moving-x',Number.isFinite(mover?.body?.position?.x)&&mover.body.position.x===expectedX);
    requireValue('before-moving-vx',Number.isFinite(mover?.body?.linearVelocity?.x)&&mover.body.linearVelocity.x===expectedVelocity);
    requireValue('before-static-x',stationary?.body?.position?.x===0);
    requireValue('before-static-vx',stationary?.body?.linearVelocity?.x===0);
    for(const [index,actor] of [visitor,sensor].entries()) {
        const label=index===0?'visitor':'sensor', body=actor?.body, g=actor?.geometry;
        requireValue(`before-${label}-identity`,actor?.state==='live'&&typeof actor.id==='string'&&actor.id.length>0&&visitor?.id!==sensor?.id);
        requireValue(`before-${label}-axes`,finiteVector(body?.position)&&body.position.y===0&&body.position.z===0&&
            finiteVector(body?.linearVelocity)&&body.linearVelocity.y===0&&body.linearVelocity.z===0&&
            zero(body?.angularVelocity)&&zero(body?.localCenter)&&sameVector(body?.worldCOM,body?.position)&&identity(body?.rotation));
        requireValue(`before-${label}-native-state`,body?.enabled===true&&body.massPending===false&&
            body.type===(index===0?(config.mover==='sensor'?0:2):(config.mover==='sensor'?1:0)));
        requireValue(`before-${label}-geometry`,zero(g?.center)&&sameVector(actor?.nodeScale,{x:1,y:1,z:1})&&
            (index===0?g?.kind==='sphere'&&g.radius===.15:g?.kind==='box'&&sameVector(g.size,{x:.01,y:1,z:.8})));
        requireValue(`before-${label}-configuration`,actor?.linearDamping===0&&actor.angularDamping===0&&actor.useGravity===false&&
            actor.allowSleep===false&&actor.enabled===true&&actor.group===1&&Number.isInteger(actor.mask)&&
            actor.mask===row?.initialMasks?.[index]&&(actor.mask&1)!==0&&actor.isTrigger===(index===1)&&
            actor.ccdReadback===(index===0&&config.mover!=='sensor')&&
            actor.bodyType===(index===0?(config.mover==='sensor'?'static':'dynamic'):(config.mover==='sensor'?'kinematic':'static')));
    }
    const query=row?.query, geometry=query?.pairGeometry;
    const stampKeys=['worldGeneration','tickIndex','attemptId','nativeStepIndex','nativeMutationRevision'];
    const validStamp=stamp=>!!stamp&&stampKeys.every(key=>Number.isInteger(stamp[key])&&stamp[key]>=0);
    requireValue('before-query-epoch',validStamp(query)&&validStamp(geometry)&&query.complete===true&&geometry.complete===true&&
        stampKeys.every(key=>query[key]===geometry[key])&&query.applicationGeneration===row?.generation&&
        query.tickIndex===row?.hookTick&&query.attemptId===row?.hookAttempt);
    const matchesChild=(child,actor,index)=>!!child&&!!actor&&child.id===actor.id&&
        child.kind===(index===0?'sphere':'box')&&sameVector(child.origin,actor.body?.position)&&sameRotation(child.rotation,actor.body?.rotation)&&
        Array.isArray(child.dimensions)&&child.dimensions.length===(index===0?1:3)&&
        (index===0?child.dimensions[0]===Math.fround(.15):child.dimensions[0]===Math.fround(.005)&&child.dimensions[1]===.5&&child.dimensions[2]===Math.fround(.4));
    const children=geometry?.children;
    requireValue('before-committed-pair-pose-geometry',Array.isArray(children)&&children.length===2&&
        children.filter(child=>matchesChild(child,visitor,0)).length===1&&children.filter(child=>matchesChild(child,sensor,1)).length===1);
    requireValue('before-committed-sweep-pose-geometry',Array.isArray(query?.children)&&query.children.length===1&&
        query.source===mover?.id&&matchesChild(query.children[0],mover,config.mover==='sensor'?1:0));
    return {kind:'BEFORE_STEP_SOURCE_MODEL_QUALIFICATION_NOT_CCD_PASS',step:row?.step,generation:row?.generation,
        hookTick:row?.hookTick,hookAttempt:row?.hookAttempt,status:failures.length?'INCONCLUSIVE':'MATCHES_SOURCE_MODEL',failures,
        expectedX,expectedVelocity,actualX:mover?.body?.position?.x,actualVelocity:mover?.body?.linearVelocity?.x,
        expectedVelocityPhase:'PREVIOUS_COMMITTED_TICK_BEFORE_CURRENT_TARGET_APPLY'};
}
/** Fail-closed diagnostic qualification: exact endpoint/velocity matching, not a hit oracle.
 * Missing/changed geometry, off-axis motion, pose drift, CCD/filter changes, incomplete query stamps,
 * or unexpected peers make the observation INCONCLUSIVE; no synthetic event is ever produced.
 */
export function qualifyThinTick(row,config) {
    const failures=[];
    if(!Number.isInteger(row.step)||row.step<1||row.step>config.ticks) failures.push('step');
    const model=pathFor(config), endpoint=model.samples[row.step*4];
    const expectedX=endpoint?.x, expectedVelocity=config.mover==='sensor'?endpoint?.velocity:config.speed;
    const requireValue=(label,actual,expected)=>{if(actual!==expected) failures.push(label);};
    const before=row.beforeQualification;
    requireValue('before-step-qualification',before?.status,'MATCHES_SOURCE_MODEL');
    requireValue('before-step-number',before?.step,row.step);
    requireValue('generation',Number.isInteger(row.generation)&&row.generation>0,true);
    requireValue('hook-clock',Number.isInteger(row.hookTick)&&row.hookTick>=0&&Number.isInteger(row.hookAttempt)&&row.hookAttempt>=0,true);
    requireValue('before-generation',before?.generation,row.generation);
    requireValue('before-hook-tick',before?.hookTick,row.hookTick);
    requireValue('before-hook-attempt',before?.hookAttempt,row.hookAttempt);
    requireValue('prior-ticks-qualified',row.priorTicksQualified,true);
    requireValue('moving-x',row.movingX,expectedX); requireValue('moving-vx',row.movingVelocityX,expectedVelocity);
    requireValue('static-x',row.staticX,0);requireValue('static-vx',row.staticVelocityX,0);
    requireValue('axes-rotation-centers',row.axisAligned,true);requireValue('public-configuration',row.configurationMatches,true);
    requireValue('native-enabled-mass-type',row.nativeMotionMatches,true);
    requireValue('geometry-and-query-epoch',row.committedGeometryMatches,true);requireValue('unexpected-peer',row.unexpectedPeer,false);
    const clearance=Number.isFinite(row.movingX)&&Number.isFinite(row.staticX)?Math.abs(row.movingX-row.staticX)-nativeExtent():null;
    return {kind:'OBSERVED_ENDPOINT_AND_SOURCE_MODEL_QUALIFICATION_NOT_CCD_PASS',step:row.step,
        status:failures.length?'INCONCLUSIVE':'MATCHES_SOURCE_MODEL',failures,beforeQualification:before,priorTicksQualified:row.priorTicksQualified,expectedX,expectedVelocity,
        actualX:row.movingX,actualVelocity:row.movingVelocityX,observedEndpointClearance:clearance,
        predictedSubstepsOverlap:model.substepOverlaps.length>0,
        hiddenNativeSubsteps:'NOT_DIRECTLY_OBSERVED',nativeEventRequirement:'REVIEW_RAW_EVENTS_SEPARATELY'};
}
