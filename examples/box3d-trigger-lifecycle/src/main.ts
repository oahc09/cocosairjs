/** EX03 consumes real SDK223 events. No synthetic trigger producer or private ABI. */
import { createAirApp, AIR_BUILD_NUMBER, AIR_REVISION, Scene, Node, Camera, DirectionalLight,
    MeshRenderer, Material, Mesh, RigidBody, ERigidBodyType, BoxCollider, SphereCollider,
    Color, Vec3, Layers, primitives, utils, physics, director, Director,
    registerBox3DBeforeStep, readBox3DBodyMotion, queryBox3DCommittedColliders,
    createBox3DKinematicTarget } from 'cocosair';
import type { AirApp, Box3DKinematicTargetHandle, Box3DBeforeStepContext, Box3DCommittedQueryChild } from 'cocosair';
import { releaseOwned, attemptStops, CloseOnce, mountOwned } from './cleanup.mjs';
import { InZonePreset, sphereBoxOverlap } from './preset.mjs';
import { pathFor, qualifyThinTick, qualifyThinBefore } from './thin-path.mjs';
import { mountVisitor } from './mount.mjs';
import { PairLedger, IdleQueue, MODES, FIXED_DT, SUBSTEPS, clock, assertClock } from './protocol.mjs';
type Mode = keyof typeof MODES;
const movingSensor = (mode:Mode) => MODES[mode].mover==='sensor';
const fastSolid = (mode:Mode) => mode!=='lifecycle' && !movingSensor(mode);
type Actor = { id: string; node: Node; body: RigidBody; collider: BoxCollider | SphereCollider; alive: boolean };
type Row = Record<string, unknown>;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => element<HTMLButtonElement>(id);
const modeInput = element<HTMLSelectElement>('mode');
const log: Row[] = [], runs: Row[] = [], operations = new IdleQueue();
let app: AirApp | undefined, scene: Scene | undefined, system: physics.PhysicsSystem;
let hook: ReturnType<typeof registerBox3DBeforeStep> | undefined;
let doorTarget: Box3DKinematicTargetHandle | undefined, moverTarget: Box3DKinematicTargetHandle | undefined;
let unsubscribe: (() => void) | undefined;
let generation = 0, serial = 0, tick = -1, attempt = -1, observedTick = -1, steps = 0;
let ledger = new PairLedger(0), visitor: Actor, zones: Actor[] = [], door: Actor;
let actors = new Map<physics.Collider, Actor>();
const closeOnce = new CloseOnce();
let ownedNodes: Node[] = [];
let assets: Array<Material | ReturnType<typeof utils.createMesh>> = [];
let faulted = false, closed = false, closing = false, transitioning = false, running = false;
let selectedMode: Mode = 'lifecycle', run: Row | undefined;
let beforeRows: Row[] = [], qualificationRows: Row[] = [];
let geometryVerifiedTick=-1, unexpectedPeer=false, priorTicksQualified=true;
let beforeQualification: ReturnType<typeof qualifyThinBefore> | undefined;
let initialMasks: number[] = [];
type PresetKind = 'mask'|'enabled'|'trigger';
let preset: InZonePreset | undefined;
let frameRows: Row[] = [], queryRows: Row[] = [], clocks: Row[] = [], mutationRows: Row[] = [];
let spawnedActors: Array<{actor:Actor; expires:number}> = [];
let zoneState: Row = {};
let count = 0, doorOpen = false, destroyOnEnter = false;
const identityRotation = { x: 0, y: 0, z: 0, w: 1 };
function status(text: string) { element('status').textContent = text; }
function ui() {
    for (const id of ['start','trigger','mask','disable','destroy']) button(id).disabled = !app || faulted || closed || closing || transitioning || !!preset?.blocksManual || !running && id !== 'start';
    for(const id of ['preset-mask','preset-enabled','preset-trigger']) button(id).disabled=!app||faulted||closed||closing||transitioning||!!preset?.blocksManual;
    button('reset').disabled = !app || faulted || closed || closing || transitioning;
    button('close').disabled = !app || closed || closing || closeOnce.started;
    modeInput.disabled = running || transitioning || closing || closed || faulted;
    element('counts').textContent = `Generation ${generation} · count zone ${count} · door ${doorOpen ? 'target requested' : 'closed'}\n` +
        `Accepted native callbacks: enter ${ledger.counts.enter} / stay ${ledger.counts.stay} / exit ${ledger.counts.exit}\n` + JSON.stringify(zoneState);
    element('events').textContent = JSON.stringify(ledger.rows.slice(-16), null, 2);
    element('preset-status').textContent=JSON.stringify(preset ?? {state:'NONE'},null,2);
    element('qualification').textContent=JSON.stringify(qualificationRows.at(-1) ?? {status:'NOT_RUN'},null,2);
    element('queries').textContent = JSON.stringify(queryRows.slice(-2), null, 2);
}
function disposeHooks() {
    hook?.dispose(); hook = undefined;
    moverTarget?.dispose(); moverTarget = undefined;
    doorTarget?.dispose(); doorTarget = undefined;
}
function fault(error: unknown, source: string) {
    log.push({ kind: 'fault', source, error: String(error), generation, tick });
    preset?.cancel('fault',tick);
    faulted = true; running = false;
    // Hooks can fail while the world is stepping: cleanup must run after the synchronous engine stack.
    queueMicrotask(() => {
        try { if (system) system.enable = false; disposeHooks(); }
        catch (cleanupError) { log.push({kind:'cleanup-fault', error:String(cleanupError)}); }
        status(`BLOCKED: ${String(error)} · evidence retained; ${closeOnce.started?'SDK close is terminal; export and reload':'Close remains available'}`); ui();
    });
}
function idle(label: string, work: () => void, token = generation) {
    queueMicrotask(() => {
        if (token !== generation || faulted || closing || closed || transitioning) {
            mutationRows.push({label,status:'CANCELLED',generation:token}); return;
        }
        try { work(); mutationRows.push({label,status:'APPLIED_AT_IDLE',generation:token,afterHookTick:tick}); ui(); }
        catch(error) { fault(error,label); }
    });
}
function visual(n: Node, size: Vec3, rgb: number[], sphere = false) {
    const m = new Material(); assets.push(m); m.initialize({effectName:'builtin-standard'});
    m.setProperty('mainColor',new Color(rgb[0],rgb[1],rgb[2],255)); m.setProperty('roughness',.7);
    const mesh = new Mesh(); assets.push(mesh);
    utils.createMesh(sphere ? primitives.sphere(.15) : primitives.box({width:size.x,height:size.y,length:size.z}),mesh); const renderer = n.addComponent(MeshRenderer); renderer.mesh = mesh; renderer.setSharedMaterial(m,0);
}
function ownNode(name:string) {const node=new Node(name);ownedNodes.push(node);node.active=false;return node;}
function makeActor(name: string, position: Vec3, size: Vec3, type: ERigidBodyType, sensor: boolean, rgb: number[], sphere = false) {
    const n = ownNode(name); scene!.addChild(n); n.layer = Layers.Enum.DEFAULT; n.setPosition(position);
    visual(n,size,rgb,sphere);
    const body = n.addComponent(RigidBody); body.type = type; body.mass = 1; body.useGravity = false;
    body.allowSleep = false; body.linearDamping = 0; body.angularDamping = 0;
    const collider = sphere ? n.addComponent(SphereCollider) : n.addComponent(BoxCollider);
    if (collider instanceof SphereCollider) collider.radius = .15; else collider.size = size;
    collider.isTrigger = sensor;
    const actor: Actor = {id:`g${generation}:${name}#${++serial}`,node:n,body,collider,alive:true};
    actors.set(collider,actor); ledger.register(actor.id); n.active = true;
    return actor;
}
function retire(actor: Actor) {
    if (!actor.alive) return;
    if(actor===visitor || actor===zones[0]) preset?.cancel('actor-retired',tick);
    actor.alive = false; ledger.retire(actor.id); actor.node.destroy();
    // Keep object mapping until scene release: late callbacks retain OLD identity, never new identity.
}
const zoneListeners = new WeakMap<physics.Collider, (event:physics.ITriggerEvent)=>void>();
function bindZone(zone:Actor) {
    const previous = zoneListeners.get(zone.collider);
    const token=generation, registry=actors, channelEpoch=ledger.channelEpoch(zone.id);
    const listener=(event:physics.ITriggerEvent)=>onZone(zone,event,token,registry,channelEpoch);
    for(const type of ['onTriggerEnter','onTriggerStay','onTriggerExit'] as const) {
        if(previous) zone.collider.off(type,previous);
        zone.collider.on(type,listener);
    }
    zoneListeners.set(zone.collider,listener);
}
function onZone(zone: Actor, event: physics.ITriggerEvent, token: number, registry: ReadonlyMap<physics.Collider, Actor>, channelEpoch:number) {
    const other = registry.get(event.otherCollider);
    if(selectedMode!=='lifecycle' && token===generation && other!==visitor) unexpectedPeer=true;
    const kind = event.type === 'onTriggerEnter' ? 'enter' : event.type === 'onTriggerStay' ? 'stay' : 'exit';
    const raw = { kind, channelEpoch, self: zone.id, other: other?.id ?? 'unknown', generation: token,
        hookTick: tick, hookAttempt: attempt, identityVerified: event.selfCollider === zone.collider && !!other };
    if (!raw.identityVerified) { log.push({kind:'identity-mismatch', raw}); fault(Error('Unmapped callback object'),'trigger'); return; }
    const row = ledger.accept(raw);
    if (!row.accepted) {
        if (!['wrong-generation','retired-or-unknown-identity','stale-application-channel'].includes(row.reason)) fault(Error(row.reason),'trigger-policy');
        ui(); return;
    }
    if (kind === 'enter' && other === visitor) {
        if (zone === zones[0]) {count++; preset?.anchor(row);}
        if (zone === zones[1]) idle('open-door',() => {
            if (!doorTarget) throw Error('Door target lease unavailable');
            doorTarget.setTarget({position:{x:0,y:2,z:-1.3},rotation:identityRotation}); doorOpen = true;
        },token);
        if (zone === zones[2]) idle('spawn-and-destroy',() => {
            const spawned = makeActor('spawned',new Vec3(2,1,0),new Vec3(.25,.25,.25),ERigidBodyType.DYNAMIC,false,[230,140,80]);
            // Creation on active scene synchronously loads components before velocity is assigned.
            spawned.body.setLinearVelocity(new Vec3(0,0,0));
            mutationRows.push({label:'spawned',id:spawned.id,afterHookTick:tick});
            spawnedActors.push({actor:spawned,expires:steps+30});
        },token);
        if (destroyOnEnter) idle('callback-requested-visitor-destroy',() => retire(visitor),token);
    }
    ui();
}
function copyVector(v: Readonly<{x:number;y:number;z:number}>) { return {x:v.x,y:v.y,z:v.z}; }
function copyRotation(q: Readonly<{x:number;y:number;z:number;w:number}>) { return {x:q.x,y:q.y,z:q.z,w:q.w}; }
function snapshotActor(actor: Actor) {
    if (!actor.alive) return {id:actor.id,state:'retired'};
    const collider=actor.collider;
    return {id:actor.id,state:'live',componentType:actor.body.type,bodyType:actor.body.type===ERigidBodyType.DYNAMIC?'dynamic':actor.body.type===ERigidBodyType.STATIC?'static':actor.body.type===ERigidBodyType.KINEMATIC?'kinematic':'unknown',body:readBox3DBodyMotion(actor.body),ccdReadback:actor.body.useCCD,
        nodePosition:copyVector(actor.node.worldPosition),nodeRotation:copyRotation(actor.node.worldRotation),nodeScale:copyVector(actor.node.worldScale),
        geometry:{source:'PUBLIC_COMPONENT_GETTERS_NOT_NATIVE_SUBSTEP',kind:collider instanceof SphereCollider?'sphere':'box',
            center:copyVector(collider.center),radius:collider instanceof SphereCollider?collider.radius:null,
            size:collider instanceof BoxCollider?copyVector(collider.size):null},
        linearDamping:actor.body.linearDamping,angularDamping:actor.body.angularDamping,useGravity:actor.body.useGravity,allowSleep:actor.body.allowSleep,
        isTrigger:collider.isTrigger,enabled:collider.enabled,group:actor.body.getGroup(),mask:actor.body.getMask()};
}
function snapshotPair() { return {visitor:snapshotActor(visitor),countZone:snapshotActor(zones[0])}; }
function copyCommittedChild(child: Box3DCommittedQueryChild) {
    return {id:actors.get(child.collider)?.id ?? 'unknown',kind:child.kind,origin:child.origin,rotation:child.rotation,
        dimensions:child.dimensions,support:child.support};
}
function stampQuery(context: Readonly<Box3DBeforeStepContext>) {
    const mover = movingSensor(selectedMode) ? zones[0] : visitor;
    if (!mover.alive || !mover.collider.enabled) return;
    const translation = {x:MODES[selectedMode].speed * context.fixedDt,y:0,z:0};
    const q = queryBox3DCommittedColliders(context,[mover.collider],translation,{group:1,mask:0xffffffff,queryTrigger:true});
    const pairGeometry=selectedMode==='lifecycle' ? null : queryBox3DCommittedColliders(context,
        [visitor.collider,zones[0].collider],{x:0,y:0,z:0},{group:1,mask:0xffffffff,queryTrigger:true});
    queryRows.push({label:'COMMITTED_SWEEP_PREDICTION_NOT_NATIVE_TRIGGER',applicationGeneration:generation,
        worldGeneration:q.worldGeneration,tickIndex:q.tickIndex,attemptId:q.attemptId,nativeStepIndex:q.nativeStepIndex,
        nativeMutationRevision:q.nativeMutationRevision,complete:q.complete,source:mover.id,translation,
        children:q.children.map(copyCommittedChild),
        pairGeometry:pairGeometry?{label:'COMMITTED_PAIR_GEOMETRY_ZERO_TRANSLATION_NOT_EVENT',
            worldGeneration:pairGeometry.worldGeneration,tickIndex:pairGeometry.tickIndex,attemptId:pairGeometry.attemptId,
            nativeStepIndex:pairGeometry.nativeStepIndex,nativeMutationRevision:pairGeometry.nativeMutationRevision,
            complete:pairGeometry.complete,children:pairGeometry.children.map(copyCommittedChild)}:null,
        initialOverlap:q.initialOverlap,hits:q.hits.map(h => ({target:actors.get(h.collider)?.id ?? 'unknown',
            logicalId:h.logicalId,distance:h.distance,fraction:h.fraction,point:h.point,normal:h.normal,
            blockingGeometry:h.blockingGeometry?copyCommittedChild(h.blockingGeometry):null}))});
    if(q.hits.some(hit=>hit.collider!==(movingSensor(selectedMode)?visitor.collider:zones[0].collider))) unexpectedPeer=true;
    if(pairGeometry) {
        const sphere=pairGeometry.children.find(child=>child.collider===visitor.collider), box=pairGeometry.children.find(child=>child.collider===zones[0].collider);
        const valid=pairGeometry.children.length===2 && sphere?.kind==='sphere' && box?.kind==='box' &&
            sphere.dimensions[0]===Math.fround(.15) && box.dimensions[0]===Math.fround(.005) &&
            box.dimensions[1]===Math.fround(.5) && box.dimensions[2]===Math.fround(.4);
        geometryVerifiedTick=valid?context.tickIndex:-1;
    }
    if(pairGeometry && ['worldGeneration','tickIndex','attemptId','nativeStepIndex','nativeMutationRevision'].some(
        key=>pairGeometry[key as keyof typeof pairGeometry]!==q[key as keyof typeof q])) throw Error('Query geometry epoch mismatch');
}
function mount(mode: Mode, presetKind?: PresetKind) {
    selectedMode = mode; generation++; tick = attempt = observedTick = -1; steps = count = 0; doorOpen = false; destroyOnEnter = false;
    spawnedActors=[]; zoneState={trigger:true,mask:-1,enabled:true};
    button('destroy').textContent='Callback destroy: OFF';
    actors = new Map(); ledger = new PairLedger(generation); clocks=[]; queryRows=[]; frameRows=[]; beforeRows=[]; qualificationRows=[]; geometryVerifiedTick=-1; unexpectedPeer=false; priorTicksQualified=true; beforeQualification=undefined; mutationRows=[];
    scene = new Scene('box3d-trigger-lifecycle');
    const cameraNode = ownNode('Camera'); scene.addChild(cameraNode); cameraNode.active=true; cameraNode.setPosition(0,5,9); cameraNode.lookAt(new Vec3(0,0,0));
    const camera = cameraNode.addComponent(Camera); camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(12,22,32,255);
    camera.visibility = Layers.Enum.DEFAULT; camera.near = .01; camera.far = 100;
    const light = ownNode('Light'); scene.addChild(light); light.active=true; light.addComponent(DirectionalLight); light.setRotationFromEuler(-50,-20,0);
    const c = MODES[mode];
    zones = [-2,0,2].map((x,i) => {
        const position = new Vec3(movingSensor(mode) && i===0 ? c.start : mode !== 'lifecycle' && i===0 ? 0 : x,0,mode !== 'lifecycle' && i>0 ? -2 : 0);
        const z = makeActor(['count-zone','door-zone','spawn-zone'][i],position,new Vec3(c.thickness,1,.8),
            movingSensor(mode) && i===0 ? ERigidBodyType.KINEMATIC : ERigidBodyType.STATIC,true,
            [[65,140,155],[180,140,65],[145,95,165]][i]);
        bindZone(z);
        return z;
    });
    visitor = makeActor('visitor',new Vec3(movingSensor(mode) ? 0 : c.start,0,0),
        new Vec3(.3,.3,.3),movingSensor(mode) ? ERigidBodyType.STATIC : ERigidBodyType.DYNAMIC,false,[85,220,170],true);
    door = makeActor('door',new Vec3(0,0,-1.3),new Vec3(.5,1,.2),ERigidBodyType.KINEMATIC,false,[210,180,110]);
    const ccd = mountVisitor({app:app!,scene,system,body:visitor.body,ccd:fastSolid(mode),
        speed:c.speed,staticVisitor:movingSensor(mode),vector:(x:number,y:number,z:number)=>new Vec3(x,y,z),
        record:(row:Row)=>log.push({...row,generation,mode})});
    initialMasks=[visitor.body.getMask(),zones[0].body.getMask()];
    doorTarget = createBox3DKinematicTarget(door.body);
    if (movingSensor(mode)) {
        moverTarget = createBox3DKinematicTarget(zones[0].body);
        moverTarget.setTarget({position:{x:c.start+c.speed*Math.fround(FIXED_DT),y:0,z:0},rotation:identityRotation});
    }
    preset=presetKind?new InZonePreset({kind:presetKind,generation,self:zones[0].id,other:visitor.id,
        originalValue:readZoneControl(presetKind)}):undefined;
    run = {generation,mode,preset,config:c,predictedPath:mode==='lifecycle'?null:pathFor(c),acceptance:'NOT_RUN',ccdReadback:ccd,clocks,queries:queryRows,frames:frameRows,pairBeforeStep:beforeRows,qualification:qualificationRows,mutations:mutationRows,
        events:ledger.rows,counts:ledger.counts,identityKind:'application-labels; callback clock is hook association, not native event timestamp'};
    runs.push(run); running = true;
    const token = generation;
    hook = registerBox3DBeforeStep(context => {
        try {
            if (token !== generation || !running || faulted) throw Error('Stale before-step hook');
            const row = clock(context); clocks.push(row); assertClock(row);
            tick=context.tickIndex; attempt=context.attemptId;
            const observation={hookTick:tick,hookAttempt:attempt,generation,step:steps+1,pair:snapshotPair(),initialMasks:[...initialMasks]};
            beforeRows.push(observation); stampQuery(context);
            if(selectedMode!=='lifecycle') {
                beforeQualification=qualifyThinBefore({...observation,query:queryRows.at(-1)},MODES[selectedMode]);
                Object.assign(observation,{queryIndex:queryRows.length-1,qualification:beforeQualification});
            }
        } catch(error) { fault(error,'before-step'); throw error; }
    });
    status(`${mode} running · ${c.speed} m/s · thickness ${c.thickness} m · native acceptance NOT_RUN`); ui();
}
function readZoneControl(kind:PresetKind) {
    return kind==='mask'?zones[0].body.getMask():kind==='enabled'?zones[0].collider.enabled:zones[0].collider.isTrigger;
}
function changeZoneControl(kind:PresetKind,value:number|boolean) {
    if(kind==='mask') {if(typeof value!=='number')throw Error('Mask must be numeric');zones[0].body.setMask(value);zoneState.mask=zones[0].body.getMask();}
    else {if(typeof value!=='boolean')throw Error('Collider flag must be boolean');
        if(kind==='enabled'){
            const zone=zones[0];
            const invalidated=ledger.applyEnabled(zone.id,value,()=>zone.collider.enabled,
                (next:boolean)=>{zone.collider.enabled=next;},{generation,hookTick:tick,hookAttempt:attempt});
            zoneState.enabled=zone.collider.enabled;
            if(invalidated)bindZone(zone);
        }
        else {zones[0].collider.isTrigger=value;zoneState.trigger=zones[0].collider.isTrigger;}}
}
function manualControl(kind:PresetKind) {
    if(preset?.blocksManual)return;
    idle(`toggle-${kind}`,()=>{if(preset?.blocksManual)return;const current=readZoneControl(kind);
        changeZoneControl(kind,kind==='mask'?(current===0?-1:0):!current);});
}
function schedulePresetActions() {
    const active=preset;
    if(!active)return;
    for(const action of active.due(tick,generation,visitor.alive&&zones[0].alive)) idle(`preset-${active.kind}-${action.index}`,()=>{
        if(preset!==active || !active.canApply(action,tick,generation,visitor.alive&&zones[0].alive))return;
        const kind=active.kind as PresetKind, before=readZoneControl(kind), pair=snapshotPair();
        const visitorMotion=readBox3DBodyMotion(visitor.body),zoneMotion=readBox3DBodyMotion(zones[0].body);
        const size=(zones[0].collider as BoxCollider).size;
        const geometry=sphereBoxOverlap({spherePosition:visitorMotion.position,boxPosition:zoneMotion.position,
            radius:Math.fround((visitor.collider as SphereCollider).radius),
            halfSize:{x:Math.fround(size.x/2),y:Math.fround(size.y/2),z:Math.fround(size.z/2)}});
        changeZoneControl(kind,action.value);
        const after=readZoneControl(kind);
        active.applied(action,tick,before,after,{pair,intersectionAtApply:geometry});
        if(after!==action.value)throw Error('Preset public getter mismatch');
    });
}
function qualifyObservedThinTick() {
    const sphere=visitor.collider, box=zones[0].collider, sensor=zones[0];
    if(!visitor.alive || !sensor.alive) return {step:steps,status:'INCONCLUSIVE',failures:['retired-actor']};
    const v=readBox3DBodyMotion(visitor.body), z=readBox3DBodyMotion(sensor.body);
    const mover=movingSensor(selectedMode)?z:v, stationary=movingSensor(selectedMode)?v:z;
    const zero=(a:Readonly<{x:number;y:number;z:number}>)=>a.x===0&&a.y===0&&a.z===0;
    const aligned=(a:typeof v)=>a.position.y===0&&a.position.z===0&&zero(a.angularVelocity)&&zero(a.localCenter)&&
        a.linearVelocity.y===0&&a.linearVelocity.z===0&&a.rotation.x===0&&a.rotation.y===0&&a.rotation.z===0&&Math.abs(a.rotation.w)===1;
    const actorsAligned=[visitor,sensor].every(actor=>zero(actor.collider.center)&&actor.node.worldScale.x===1&&actor.node.worldScale.y===1&&actor.node.worldScale.z===1);
    const configs=[visitor,sensor].every((actor,i)=>actor.body.linearDamping===0&&actor.body.angularDamping===0&&!actor.body.useGravity&&
        !actor.body.allowSleep&&actor.collider.enabled&&actor.body.getGroup()===1&&actor.body.getMask()===initialMasks[i]&&(actor.body.getMask()&1)!==0);
    const configurationMatches=configs && sphere instanceof SphereCollider && sphere.radius===.15 && box instanceof BoxCollider &&
        box.size.x===.01&&box.size.y===1&&box.size.z===.8&&!sphere.isTrigger&&box.isTrigger&&
        visitor.body.useCCD===fastSolid(selectedMode)&&sensor.body.useCCD===false&&
        visitor.body.type===(movingSensor(selectedMode)?ERigidBodyType.STATIC:ERigidBodyType.DYNAMIC)&&
        sensor.body.type===(movingSensor(selectedMode)?ERigidBodyType.KINEMATIC:ERigidBodyType.STATIC);
    return qualifyThinTick({step:steps,generation,hookTick:tick,hookAttempt:attempt,beforeQualification,priorTicksQualified,movingX:mover.position.x,movingVelocityX:mover.linearVelocity.x,
        staticX:stationary.position.x,staticVelocityX:stationary.linearVelocity.x,
        axisAligned:aligned(v)&&aligned(z)&&actorsAligned,configurationMatches,
        nativeMotionMatches:v.enabled===true&&z.enabled===true&&v.massPending===false&&z.massPending===false&&
            v.type===(movingSensor(selectedMode)?0:2)&&z.type===(movingSensor(selectedMode)?1:0),
        committedGeometryMatches:geometryVerifiedTick===tick,unexpectedPeer},MODES[selectedMode]);
}
function afterPhysics() {
    if (!running || faulted || tick < 0 || observedTick === tick) return;
    try {
        observedTick=tick; steps++;
        for (const item of spawnedActors) if(item.actor.alive && steps>=item.expires) idle('spawn-lifetime-destroy',()=>retire(item.actor));
        frameRows.push({hookTick:tick,hookAttempt:attempt,generation,pair:snapshotPair(),
            visitor:visitor.alive ? readBox3DBodyMotion(visitor.body) : 'retired',
            movingSensor:movingSensor(selectedMode) ? readBox3DBodyMotion(zones[0].body) : null,
            door:readBox3DBodyMotion(door.body),count,doorOpen});
        schedulePresetActions();
        if(selectedMode!=='lifecycle') {
            const qualification=qualifyObservedThinTick(); qualificationRows.push(qualification);
            priorTicksQualified=priorTicksQualified&&qualification.status==='MATCHES_SOURCE_MODEL';
        }
        if (steps >= MODES[selectedMode].ticks) idle('finish-observation-window',() => {
            preset?.cancel('observation-window-ended',tick);
            running=false; system.enable=false; disposeHooks(); if(run) run.status='OBSERVATION_WINDOW_ENDED_NOT_ACCEPTANCE';
            status('Observation window ended · native results require review · NOT_RUN');
        });
        else if (moverTarget) idle('moving-sensor-target',() => moverTarget!.setTarget({
            position:{x:MODES[selectedMode].start+(steps+1)*MODES[selectedMode].speed*Math.fround(FIXED_DT),y:0,z:0},rotation:identityRotation}));
        ui();
    } catch(error) { fault(error,'after-physics'); }
}
async function release(forClose=false) {
    running=false;
    const stopErrors=attemptStops([()=>{if(system)system.enable=false;},()=>hook?.dispose(),()=>moverTarget?.dispose(),()=>doorTarget?.dispose()]);
    if(stopErrors.length)log.push({kind:'cleanup-stop-errors',errors:stopErrors});
    await releaseOwned({app,scene,nodes:ownedNodes,assets,record:(row:Row)=>log.push(row)});
    scene=undefined; hook=undefined; moverTarget=undefined; doorTarget=undefined;
    if(stopErrors.length&&!forClose)throw Error('Stop failed; public cleanup completed but run remains blocked');
}
function reset(start: boolean, presetKind?: PresetKind) {
    if(!app || faulted || closing || closed || transitioning) return;
    preset?.cancel('reset',tick);
    transitioning=true; running=false; ui();
    void operations.enqueue(async () => {
        await release();
        if(closing || closed || faulted) return;
        if(start) await mountOwned(()=>mount(presetKind?'lifecycle':modeInput.value as Mode,presetKind),()=>release(true),(row:Row)=>log.push(row)); else status('Scene released; Start creates a fresh generation · history retained');
    }).catch(error => fault(error,'reset')).finally(() => {transitioning=false;ui();});
}
function close() {
    if(!app || closed || closing || closeOnce.started) return;
    preset?.cancel('close',tick);
    closing=true; running=false; ui();
    void operations.enqueue(async () => {
        director.off(Director.EVENT_AFTER_PHYSICS,afterPhysics);
        await release(true); // scene, unowned nodes, assets, second PUBLIC flush, then SDK shutdown
        await closeOnce.invoke(app,(row:Row)=>log.push(row));
        closed=true;
        unsubscribe?.(); window.removeEventListener('error',windowError); window.removeEventListener('unhandledrejection',rejection);
        status('Closed with release and owned-allocation flush receipts · acceptance remains NOT_RUN');
    }).catch(error => {
        log.push({kind:closed?'post-close-cleanup-failed':'close-failed',sdkCloseStarted:closeOnce.started,error:String(error)});faulted=true;
        status(closed?`SDK close released; post-close listener cleanup failed: ${error}; export evidence and reload`:
            closeOnce.started?`Terminal SDK close failure: ${error}; export evidence and reload`:
            `Close preparation failed before SDK invocation: ${error}; owned identities retained, Close may retry preparation`);
    })
      .finally(() => {closing=false;ui();});
}
const windowError = (event: ErrorEvent) => fault(event.error ?? event.message,'window-error');
const rejection = (event: PromiseRejectionEvent) => fault(event.reason,'unhandled-rejection');
window.addEventListener('error',windowError); window.addEventListener('unhandledrejection',rejection);
button('start').onclick=()=>reset(true); button('reset').onclick=()=>reset(false); button('close').onclick=close;
button('trigger').onclick=()=>manualControl('trigger');
button('mask').onclick=()=>manualControl('mask');
button('disable').onclick=()=>manualControl('enabled');
for(const kind of ['mask','enabled','trigger'] as const) button(`preset-${kind}`).onclick=()=>{
    if(preset?.blocksManual)return;modeInput.value='lifecycle';reset(true,kind);
};
button('destroy').onclick=()=>{if(preset?.blocksManual)return;destroyOnEnter=!destroyOnEnter; mutationRows.push({label:'callback-destroy-armed',value:destroyOnEnter,afterHookTick:tick}); button('destroy').textContent=`Callback destroy: ${destroyOnEnter?'ON':'OFF'}`;};
button('export').onclick=()=>{
    const blob=new Blob([JSON.stringify({schema:'ex03-trigger-lifecycle-v2-transient-diagnostic',acceptance:'NOT_RUN',build:AIR_BUILD_NUMBER,revision:AIR_REVISION,identity,runs,log},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download='ex03-trigger-lifecycle.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};
let identity: unknown;
async function boot() {
    const response=await fetch('/identity.json'); if(!response.ok) throw Error('Missing identity'); identity=await response.json();
    app=await createAirApp({canvas:'#GameCanvas',screenMode:'container',container:'#scene-host',physics:'box3d',
        physicsOptions:{box3d:{assetBaseUrl:'/runtime/physics/box3d/st/',threading:'single',workerCount:1,solverSubSteps:SUBSTEPS}}});
    if(!app.diagnostics || !app.releaseScene || !app.close) throw Error('Required public diagnostics/release/close capability unavailable');
    unsubscribe=app.diagnostics.onMessage(message=>{log.push({kind:'diagnostic',message});if(message.severity==='error') fault(message.message,'engine-diagnostic');});
    system=physics.PhysicsSystem.instance; system.enable=false; system.autoSimulation=true; system.fixedTimeStep=FIXED_DT;
    system.maxSubSteps=1; system.gravity=new Vec3(0,0,0);
    director.on(Director.EVENT_AFTER_PHYSICS,afterPhysics);
    status('Ready · select mode and Start · native acceptance NOT_RUN'); ui();
}
ui(); void boot().catch(error=>fault(error,'boot'));
