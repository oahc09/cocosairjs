const started=performance.now(), identity=crypto.randomUUID();
const {createAirApp}=await import('/build/bootstrap.js'), imported=performance.now();
const app=await createAirApp({canvas:'#GameCanvas',diagnostics:'warnings',designResolution:{width:480,height:360,policy:0}}), initialized=performance.now();
const {Scene,Node,Camera,Color,MeshRenderer,Material,Texture2D,utils,primitives,Component,SceneStack,director,game,Input,input}=await import('/build/cocosair.module.js');
let runCalls=0,destroyed=0,cleanup=0;const originalRun=game.run.bind(game);game.run=(...args)=>{runCalls++;return originalRun(...args);};
class Tracked extends Component {onDestroy(){destroyed++;}}
const shared=new Texture2D();shared.reset({width:1,height:1,format:Texture2D.PixelFormat.RGBA8888});shared.uploadData(new Uint8Array([255,0,0,255]));shared.addRef();
function create(name) {
    const scene=new Scene(name), cameraNode=new Node('Camera');scene.addChild(cameraNode);cameraNode.setPosition(0,0,10);
    const camera=cameraNode.addComponent(Camera);camera.projection=Camera.ProjectionType.ORTHO;camera.orthoHeight=3;camera.clearFlags=Camera.ClearFlag.SOLID_COLOR;camera.clearColor=new Color(0,0,0,255);
    const node=new Node('Private');scene.addChild(node);node.addComponent(Tracked);const renderer=node.addComponent(MeshRenderer);
    const mesh=utils.createMesh(primitives.box()),material=new Material();material.initialize({effectName:'builtin-unlit',defines:{USE_TEXTURE:true}});material.setProperty('mainTexture',shared);
    renderer.mesh=mesh;renderer.setSharedMaterial(material,0);return {scene,node,mesh,material};
}
function draw(){game.pause();director.tick(0);const gl=app.canvas.getContext('webgl2'),bytes=new Uint8Array(4);gl.readPixels(240,180,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return [...bytes];}
const first=create('DirectA');app.run(first.scene);const firstPixel=draw(),firstDraw=performance.now();
const persistent=new Node('Persistent');persistent.counter=17;first.scene.addChild(persistent);director.addPersistRootNode(persistent);
async function runSuite(){
    const firstToken=app.session.token();let unownedHits=0;const leaked=()=>unownedHits++;window.addEventListener('fixture-business',leaked);
    const second=create('DirectB');app.run(second.scene);draw();window.dispatchEvent(new Event('fixture-business'));
    const direct={oldSceneValid:first.scene.isValid,oldNodeValid:first.node.isValid,oldAssetsValid:[first.mesh.isValid,first.material.isValid],tokenCurrent:firstToken.isCurrent(),persistentValid:persistent.isValid,persistentParent:persistent.parent===second.scene,unownedHits,runCalls};
    window.removeEventListener('fixture-business',leaked);first.mesh.destroy();first.material.destroy();
    app.session.own(()=>{second.mesh.destroy();second.material.destroy();},'direct-assets');
    const currentScope=app.session,currentToken=currentScope.token();app.run(second.scene);
    const sameScene={scopeSame:app.session===currentScope,tokenCurrent:currentToken.isCurrent(),runCalls};
    const rejected=new Scene('Rejected'),blocked={code:null};try{app.run(rejected);}catch(error){blocked.code=error.code;}rejected.destroy();
    const initialRelease=await app.releaseScene();
    const cycles=[];
    for(let i=0;i<100;i++){
        const item=create('Owned'+i);app.run(item.scene);const token=app.session.token();shared.addRef();
        let hits=0,timers=0;const onBusiness=()=>hits++;window.addEventListener('fixture-business',onBusiness);const timer=setInterval(()=>timers++,5);
        app.session.own(()=>{window.removeEventListener('fixture-business',onBusiness);clearInterval(timer);cleanup++;},'business');
        app.session.own(()=>{item.mesh.destroy();item.material.destroy();shared.decRef();},'assets');
        window.dispatchEvent(new Event('fixture-business'));const pixel=draw(),beforeRefs=shared.refCount;
        const firstRelease=app.releaseScene(),sameRelease=firstRelease===app.releaseScene();const receipt=await firstRelease;
        const afterTimer=timers;await new Promise((resolve)=>setTimeout(resolve,6));window.dispatchEvent(new Event('fixture-business'));
        cycles.push({index:i,pixel,beforeRefs,afterRefs:shared.refCount,sharedValid:shared.isValid,receiptStatus:receipt.status,pending:receipt.pending,
            sameRelease,sceneNull:app.getScene()===null,directorNull:director.getScene()===null,nodeValid:item.node.isValid,assetsValid:[item.mesh.isValid,item.material.isValid],tokenCurrent:token.isCurrent(),hits,timerStable:timers===afterTimer,persistentValid:persistent.isValid,persistentDetached:persistent.parent===null,persistentCounter:persistent.counter});
    }
    const pages=create('Pages');app.run(pages.scene);game.pause();app.session.own(()=>{pages.mesh.destroy();pages.material.destroy();},'page-assets');
    const stack=new SceneStack(pages.scene,{canvas:app.canvas,maxCachedPages:1});app.session.own(()=>stack.dispose(),'page-stack');
    const pageA=await stack.push(()=>{const node=new Node('PageA');node.score=9;return node;},'A');const pageB=await stack.push(()=>new Node('PageB'),'B');draw();
    const hidden={valid:pageA.node.isValid,active:pageA.node.active,visible:pageA.visible,score:pageA.node.score};await stack.pop();draw();
    const popped={oldValid:pageB.node.isValid,topIsA:stack.top===pageA,score:pageA.node.score,active:pageA.node.active};
    const c=await stack.push(()=>new Node('PageC'),'C'),d=await stack.push(()=>new Node('PageD'),'D');draw();
    const evicted={aValid:pageA.node.isValid,cValid:c.node.isValid,depth:stack.depth,cached:stack.cachedCount};await stack.pop();draw();
    const back={dValid:d.node.isValid,topIsC:stack.top===c};
    const loadSceneResult=director.loadScene('AIR_CODE_FIRST_NOT_IN_BUNDLE');
    const pageRelease=await app.releaseScene();director.removePersistRootNode(persistent);persistent.destroy();shared.decRef();await new Promise((resolve)=>setTimeout(resolve,30));director.tick(0);
    return {identity,direct,sameScene,blocked,initialRelease,cycles,cleanup,destroyed,runCalls,pages:{hidden,popped,evicted,back,loadSceneResult,pageRelease},final:{persistentValid:persistent.isValid,sharedValid:shared.isValid,sharedRefs:shared.refCount},timings:{importMs:imported-started,initializeMs:initialized-imported,firstDrawMs:firstDraw-initialized,totalToFirstDrawMs:firstDraw-started},errors:app.diagnostics.snapshot().filter((e)=>e.severity==='error')};
}
window.__sceneSwitchContract={ready:true,identity,firstPixel,runSuite,close:async()=>{
    const receipt=await app.close();first.mesh.destroy();first.material.destroy();director.removePersistRootNode(persistent);persistent.destroy();
    if(shared.refCount>0)shared.decRef();await new Promise((resolve)=>setTimeout(resolve,30));director.tick(0);
    return {receipt,valid:[first.mesh,first.material,persistent,shared].map((asset)=>asset.isValid)};
}};
