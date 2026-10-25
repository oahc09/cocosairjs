/** EX03 consumes real SDK223 events. No synthetic trigger producer or private ABI. */
import { createAirApp, AIR_BUILD_NUMBER, AIR_REVISION, Scene, Node, Camera, DirectionalLight,
    MeshRenderer, Material, RigidBody, ERigidBodyType, BoxCollider, SphereCollider,
    Color, Vec3, Layers, primitives, utils, physics, director, Director,
    registerBox3DBeforeStep, readBox3DBodyMotion, queryBox3DCommittedColliders,
    createBox3DKinematicTarget } from 'cocosair';
import type { AirApp, Box3DKinematicTargetHandle, Box3DBeforeStepContext } from 'cocosair';
import { mountVisitor } from './mount.mjs';
import { PairLedger, IdleQueue, MODES, FIXED_DT, SUBSTEPS, clock, assertClock } from './protocol.mjs';
type Mode = keyof typeof MODES;
type Actor = { id: string; node: Node; body: RigidBody; collider: BoxCollider | SphereCollider; alive: boolean };
type Row = Record<string, unknown>;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => element<HTMLButtonElement>(id);
const modeInput = element<HTMLSelectElement>('mode');
const log: Row[] = [], runs: Row[] = [], operations = new IdleQueue();
let app: AirApp | undefined, scene: Scene, system: physics.PhysicsSystem;
let hook: ReturnType<typeof registerBox3DBeforeStep> | undefined;
let doorTarget: Box3DKinematicTargetHandle | undefined, moverTarget: Box3DKinematicTargetHandle | undefined;
let unsubscribe: (() => void) | undefined;
let generation = 0, serial = 0, tick = -1, attempt = -1, observedTick = -1, steps = 0;
let ledger = new PairLedger(0), visitor: Actor, zones: Actor[] = [], door: Actor;
let actors = new Map<physics.Collider, Actor>();
let assets: Array<Material | ReturnType<typeof utils.createMesh>> = [];
let faulted = false, closed = false, closing = false, transitioning = false, running = false;
let selectedMode: Mode = 'lifecycle', run: Row | undefined;
let frameRows: Row[] = [], queryRows: Row[] = [], clocks: Row[] = [], mutationRows: Row[] = [];
let spawnedActors: Array<{actor:Actor; expires:number}> = [];
let zoneState: Row = {};
let count = 0, doorOpen = false, destroyOnEnter = false;
const identityRotation = { x: 0, y: 0, z: 0, w: 1 };
function status(text: string) { element('status').textContent = text; }
function ui() {
    for (const id of ['start','trigger','mask','disable','destroy']) button(id).disabled = !app || faulted || closed || closing || transitioning || !running && id !== 'start';
    button('reset').disabled = !app || faulted || closed || closing || transitioning;
    button('close').disabled = !app || closed || closing;
    modeInput.disabled = running || transitioning || closing || closed || faulted;
    element('counts').textContent = `Generation ${generation} · count zone ${count} · door ${doorOpen ? 'target requested' : 'closed'}\n` +
        `Accepted native callbacks: enter ${ledger.counts.enter} / stay ${ledger.counts.stay} / exit ${ledger.counts.exit}\n` + JSON.stringify(zoneState);
    element('events').textContent = JSON.stringify(ledger.rows.slice(-16), null, 2);
    element('queries').textContent = JSON.stringify(queryRows.slice(-2), null, 2);
}
function disposeHooks() {
    hook?.dispose(); hook = undefined;
    moverTarget?.dispose(); moverTarget = undefined;
    doorTarget?.dispose(); doorTarget = undefined;
}
function fault(error: unknown, source: string) {
    log.push({ kind: 'fault', source, error: String(error), generation, tick });
    faulted = true; running = false;
    // Hooks can fail while the world is stepping: cleanup must run after the synchronous engine stack.
    queueMicrotask(() => {
        try { if (system) system.enable = false; disposeHooks(); }
        catch (cleanupError) { log.push({kind:'cleanup-fault', error:String(cleanupError)}); }
        status(`BLOCKED: ${String(error)} · evidence retained; Close remains available`); ui();
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
    const m = new Material(); m.initialize({effectName:'builtin-standard'});
    m.setProperty('mainColor',new Color(rgb[0],rgb[1],rgb[2],255)); m.setProperty('roughness',.7);
    const mesh = utils.createMesh(sphere ? primitives.sphere(.15) : primitives.box({width:size.x,height:size.y,length:size.z}));
    assets.push(m,mesh); const renderer = n.addComponent(MeshRenderer); renderer.mesh = mesh; renderer.setSharedMaterial(m,0);
}
function makeActor(name: string, position: Vec3, size: Vec3, type: ERigidBodyType, sensor: boolean, rgb: number[], sphere = false) {
    const n = new Node(name); n.active = false; n.layer = Layers.Enum.DEFAULT; n.setPosition(position);
    visual(n,size,rgb,sphere);
    const body = n.addComponent(RigidBody); body.type = type; body.mass = 1; body.useGravity = false;
    body.allowSleep = false; body.linearDamping = 0; body.angularDamping = 0;
    const collider = sphere ? n.addComponent(SphereCollider) : n.addComponent(BoxCollider);
    if (collider instanceof SphereCollider) collider.radius = .15; else collider.size = size;
    collider.isTrigger = sensor;
    const actor: Actor = {id:`g${generation}:${name}#${++serial}`,node:n,body,collider,alive:true};
    actors.set(collider,actor); ledger.register(actor.id); scene.addChild(n); n.active = true;
    return actor;
}
function retire(actor: Actor) {
    if (!actor.alive) return;
    actor.alive = false; ledger.retire(actor.id); actor.node.destroy();
    // Keep object mapping until scene release: late callbacks retain OLD identity, never new identity.
}
function onZone(zone: Actor, event: physics.ITriggerEvent, token: number, registry: ReadonlyMap<physics.Collider, Actor>) {
    const other = registry.get(event.otherCollider);
    const kind = event.type === 'onTriggerEnter' ? 'enter' : event.type === 'onTriggerStay' ? 'stay' : 'exit';
    const raw = { kind, self: zone.id, other: other?.id ?? 'unknown', generation: token,
        hookTick: tick, hookAttempt: attempt, identityVerified: event.selfCollider === zone.collider && !!other };
    if (!raw.identityVerified) { log.push({kind:'identity-mismatch', raw}); fault(Error('Unmapped callback object'),'trigger'); return; }
    const row = ledger.accept(raw);
    if (!row.accepted) {
        if (!['wrong-generation','retired-or-unknown-identity'].includes(row.reason)) fault(Error(row.reason),'trigger-policy');
        ui(); return;
    }
    if (kind === 'enter' && other === visitor) {
        if (zone === zones[0]) count++;
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
function stampQuery(context: Readonly<Box3DBeforeStepContext>) {
    const mover = selectedMode === 'moving-sensor' ? zones[0] : visitor;
    if (!mover.alive || !mover.collider.enabled) return;
    const translation = {x:MODES[selectedMode].speed * context.fixedDt,y:0,z:0};
    const q = queryBox3DCommittedColliders(context,[mover.collider],translation,{group:1,mask:0xffffffff,queryTrigger:true});
    queryRows.push({label:'COMMITTED_SWEEP_PREDICTION_NOT_NATIVE_TRIGGER',applicationGeneration:generation,
        worldGeneration:q.worldGeneration,tickIndex:q.tickIndex,attemptId:q.attemptId,nativeStepIndex:q.nativeStepIndex,
        nativeMutationRevision:q.nativeMutationRevision,complete:q.complete,source:mover.id,translation,
        initialOverlap:q.initialOverlap,hits:q.hits.map(h => ({target:actors.get(h.collider)?.id ?? 'unknown',
            logicalId:h.logicalId,distance:h.distance,fraction:h.fraction,point:h.point,normal:h.normal}))});
}
function mount(mode: Mode) {
    selectedMode = mode; generation++; tick = attempt = observedTick = -1; steps = count = 0; doorOpen = false; destroyOnEnter = false;
    spawnedActors=[]; zoneState={trigger:true,mask:-1,enabled:true};
    button('destroy').textContent='Callback destroy: OFF';
    actors = new Map(); ledger = new PairLedger(generation); clocks=[]; queryRows=[]; frameRows=[]; mutationRows=[];
    scene = new Scene('box3d-trigger-lifecycle');
    const cameraNode = new Node('Camera'); scene.addChild(cameraNode); cameraNode.setPosition(0,5,9); cameraNode.lookAt(new Vec3(0,0,0));
    const camera = cameraNode.addComponent(Camera); camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(12,22,32,255);
    camera.visibility = Layers.Enum.DEFAULT; camera.near = .01; camera.far = 100;
    const light = new Node('Light'); scene.addChild(light); light.addComponent(DirectionalLight); light.setRotationFromEuler(-50,-20,0);
    const c = MODES[mode];
    zones = [-2,0,2].map((x,i) => {
        const position = new Vec3(mode === 'moving-sensor' && i===0 ? -2 : mode !== 'lifecycle' && i===0 ? 0 : x,0,mode !== 'lifecycle' && i>0 ? -2 : 0);
        const z = makeActor(['count-zone','door-zone','spawn-zone'][i],position,new Vec3(c.thickness,1,.8),
            mode === 'moving-sensor' && i===0 ? ERigidBodyType.KINEMATIC : ERigidBodyType.STATIC,true,
            [[65,140,155],[180,140,65],[145,95,165]][i]);
        const token = generation, registry = actors;
        for (const type of ['onTriggerEnter','onTriggerStay','onTriggerExit'] as const) z.collider.on(type,(event: physics.ITriggerEvent) => onZone(z,event,token,registry));
        return z;
    });
    visitor = makeActor('visitor',new Vec3(mode === 'lifecycle' ? -4 : mode === 'fast-solid' ? -2 : 0,0,0),
        new Vec3(.3,.3,.3),mode === 'moving-sensor' ? ERigidBodyType.STATIC : ERigidBodyType.DYNAMIC,false,[85,220,170],true);
    door = makeActor('door',new Vec3(0,0,-1.3),new Vec3(.5,1,.2),ERigidBodyType.KINEMATIC,false,[210,180,110]);
    const ccd = mountVisitor({app:app!,scene,system,body:visitor.body,ccd:mode==='fast-solid',
        speed:c.speed,staticVisitor:mode==='moving-sensor',vector:(x:number,y:number,z:number)=>new Vec3(x,y,z),
        record:(row:Row)=>log.push({...row,generation,mode})});
    doorTarget = createBox3DKinematicTarget(door.body);
    if (mode === 'moving-sensor') {
        moverTarget = createBox3DKinematicTarget(zones[0].body);
        moverTarget.setTarget({position:{x:-2+c.speed*Math.fround(FIXED_DT),y:0,z:0},rotation:identityRotation});
    }
    run = {generation,mode,config:c,acceptance:'NOT_RUN',ccdReadback:ccd,clocks,queries:queryRows,frames:frameRows,mutations:mutationRows,
        events:ledger.rows,counts:ledger.counts,identityKind:'application-labels; callback clock is hook association, not native event timestamp'};
    runs.push(run); running = true;
    const token = generation;
    hook = registerBox3DBeforeStep(context => {
        try {
            if (token !== generation || !running || faulted) throw Error('Stale before-step hook');
            const row = clock(context); clocks.push(row); assertClock(row);
            tick=context.tickIndex; attempt=context.attemptId; stampQuery(context);
        } catch(error) { fault(error,'before-step'); throw error; }
    });
    status(`${mode} running · ${c.speed} m/s · thickness ${c.thickness} m · native acceptance NOT_RUN`); ui();
}
function afterPhysics() {
    if (!running || faulted || tick < 0 || observedTick === tick) return;
    try {
        observedTick=tick; steps++;
        for (const item of spawnedActors) if(item.actor.alive && steps>=item.expires) idle('spawn-lifetime-destroy',()=>retire(item.actor));
        frameRows.push({hookTick:tick,hookAttempt:attempt,generation,
            visitor:visitor.alive ? readBox3DBodyMotion(visitor.body) : 'retired',
            movingSensor:selectedMode==='moving-sensor' ? readBox3DBodyMotion(zones[0].body) : null,
            door:readBox3DBodyMotion(door.body),count,doorOpen});
        if (steps >= MODES[selectedMode].ticks) idle('finish-observation-window',() => {
            running=false; system.enable=false; disposeHooks(); if(run) run.status='OBSERVATION_WINDOW_ENDED_NOT_ACCEPTANCE';
            status('Observation window ended · native results require review · NOT_RUN');
        });
        else if (moverTarget) idle('moving-sensor-target',() => moverTarget!.setTarget({
            position:{x:-2+(steps+1)*MODES[selectedMode].speed*Math.fround(FIXED_DT),y:0,z:0},rotation:identityRotation}));
        ui();
    } catch(error) { fault(error,'after-physics'); }
}
async function release() {
    system.enable=false; running=false; disposeHooks();
    if(!app?.releaseScene) throw Error('Public releaseScene unavailable');
    const receipt=await app.releaseScene(); log.push({kind:'releaseScene',receipt});
    if(receipt.status!=='released') throw Error('Scene release not released');
    for(const asset of assets.reverse()) asset.destroy(); assets=[];
}
function reset(start: boolean) {
    if(!app || faulted || closing || closed || transitioning) return;
    transitioning=true; running=false; ui();
    void operations.enqueue(async () => {
        await release();
        if(closing || closed || faulted) return;
        if(start) mount(modeInput.value as Mode); else status('Scene released; Start creates a fresh generation · history retained');
    }).catch(error => fault(error,'reset')).finally(() => {transitioning=false;ui();});
}
function close() {
    if(!app || closed || closing) return;
    closing=true; running=false; ui();
    void operations.enqueue(async () => {
        for(const stop of [()=>{if(system) system.enable=false;},()=>hook?.dispose(),()=>moverTarget?.dispose(),()=>doorTarget?.dispose()]) {
            try {stop();} catch(error) {log.push({kind:'close-preparation-fault',error:String(error)});}
        }
        director.off(Director.EVENT_AFTER_PHYSICS,afterPhysics);
        if(!app?.close) throw Error('Public close unavailable');
        const receipt=await app.close(); log.push({kind:'close',receipt});
        if(receipt.status!=='released') throw Error('Close not released');
        for(const asset of assets.reverse()) asset.destroy(); assets=[];
        unsubscribe?.(); window.removeEventListener('error',windowError); window.removeEventListener('unhandledrejection',rejection);
        closed=true; status('Closed with release receipt · acceptance remains NOT_RUN');
    }).catch(error => { log.push({kind:'close-failed',error:String(error)}); faulted=true; status(`Close failed: ${error}; retry Close`); })
      .finally(() => {closing=false;ui();});
}
const windowError = (event: ErrorEvent) => fault(event.error ?? event.message,'window-error');
const rejection = (event: PromiseRejectionEvent) => fault(event.reason,'unhandled-rejection');
window.addEventListener('error',windowError); window.addEventListener('unhandledrejection',rejection);
button('start').onclick=()=>reset(true); button('reset').onclick=()=>reset(false); button('close').onclick=close;
button('trigger').onclick=()=>idle('toggle-trigger',()=>{zones[0].collider.isTrigger=!zones[0].collider.isTrigger; zoneState.trigger=zones[0].collider.isTrigger;});
button('mask').onclick=()=>idle('toggle-mask',()=>{const body=zones[0].body; body.setMask(body.getMask()===0 ? -1 : 0); zoneState.mask=body.getMask();});
button('disable').onclick=()=>idle('toggle-enabled',()=>{zones[0].collider.enabled=!zones[0].collider.enabled; zoneState.enabled=zones[0].collider.enabled;});
button('destroy').onclick=()=>{destroyOnEnter=!destroyOnEnter; mutationRows.push({label:'callback-destroy-armed',value:destroyOnEnter,afterHookTick:tick}); button('destroy').textContent=`Callback destroy: ${destroyOnEnter?'ON':'OFF'}`;};
button('export').onclick=()=>{
    const blob=new Blob([JSON.stringify({schema:'ex03-trigger-lifecycle-v1',acceptance:'NOT_RUN',build:AIR_BUILD_NUMBER,revision:AIR_REVISION,identity,runs,log},null,2)],{type:'application/json'});
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
