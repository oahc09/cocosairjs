import { createTestInput } from '../../../tools/debug/test-input';
const { createAirApp } = await import('/build/cocosair.module.js');
const app = await createAirApp({ canvas: '#GameCanvas', designResolution: { width: 480, height: 360, policy: 0 } });
const { Scene, Node, Component, UITransform, createUICanvas, Input, input, KeyCode, createActionState, createActionInput, createStepClock } = await import('/build/cocosair.module.js');
const scene = new Scene('Synthetic and real input'), ui = createUICanvas(scene, 'Canvas', { designWidth: 480, designHeight: 360 });
const node = new Node('PureUIHitRegion'); node.layer = ui.layer; ui.addChild(node); node.addComponent(UITransform).setContentSize(160,160);
const counts = { nodeStart:0,nodeEnd:0,nodeCancel:0,globalStart:0,globalEnd:0,globalCancel:0,keyDown:0,keyUp:0 };
for (const [kind,name] of [[Input.EventType.TOUCH_START,'nodeStart'],[Input.EventType.TOUCH_END,'nodeEnd'],[Input.EventType.TOUCH_CANCEL,'nodeCancel']]) node.on(kind,()=>counts[name]++);
for (const [kind,name] of [[Input.EventType.TOUCH_START,'globalStart'],[Input.EventType.TOUCH_END,'globalEnd'],[Input.EventType.TOUCH_CANCEL,'globalCancel'],[Input.EventType.KEY_DOWN,'keyDown'],[Input.EventType.KEY_UP,'keyUp']]) {
    const callback=()=>counts[name]++; input.on(kind,callback); app.session.own(()=>input.off(kind,callback),'test-global-input');
}
const action=createActionState({actions:{ fire:{sources:[{backend:'native',keyCode:KeyCode.KEY_A}]},pointer:{sources:[{backend:'native',pointerId:'*'}]} }});
const adapter=createActionInput({state:action,backend:'native',canvas:app.canvas,session:app.session}); adapter.attach(); app.session.own(()=>adapter.dispose(),'test-action');
let updates=0, moves=0;
class Driver extends Component { update(dt) { updates++; if(action.held('fire')) moves+=dt; } }
new Node('Driver').setParent(scene); scene.children.find((n)=>n.name==='Driver').addComponent(Driver);
app.run(scene); const clock=createStepClock(); clock.begin(); await clock.step(0);
const tool=createTestInput({canvas:app.canvas,session:app.session}); app.session.own(()=>tool.dispose(),'synthetic-input');
const raw=[];
for (const kind of ['keydown','keyup','touchstart','touchend','touchcancel']) {
    const callback=(event)=>raw.push({type:event.type,isTrusted:event.isTrusted}); app.canvas.addEventListener(kind,callback);
    app.session.own(()=>app.canvas.removeEventListener(kind,callback),'raw-observation');
}
const snapshot=()=>({counts:{...counts},held:action.held('fire'),pointers:action.heldSources('pointer'),activeIds:tool.activeIds,updates,moves,raw:[...raw],stepping:clock.stepping});
window.__testInputProbe={ready:true,snapshot,tick:()=>action.consumeTick(),step:()=>clock.step(1/60),
    key:(type,code)=>tool.key(type,code),touch:(type,points)=>tool.touch(type,points),dispose:()=>tool.dispose(),
    generationChange:()=>app.session.activate(),release:()=>app.releaseScene(),
    resetCounts:()=>{for(const name of Object.keys(counts)) counts[name]=0;raw.length=0;},
    focus:()=>app.canvas.focus()};
