import { createAgentSession } from '../../../tools/debug/agent-session';
import { prepareEffectForRegistration } from '../../../tools/debug/effect-layout';
const { createAirApp } = await import('/build/bootstrap.js');
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings', designResolution: { width:480, height:360, policy:0 } });
const { Scene, Node, Camera, Color, Vec4, Texture2D, Material, EffectAsset, MeshRenderer, SkinnedMeshRenderer, Skeleton, Mat4, utils, gfx, director, game, builtinResMgr } = await import('/build/cocosair.module.js');
const scene = new Scene('EffectLayouts'), cameraNode = new Node('Camera'); scene.addChild(cameraNode); cameraNode.setPosition(0,0,10);
const camera = cameraNode.addComponent(Camera); camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 180;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0,0,0,255);
const vertices = [-48,-48,0,48,-48,0,48,48,0,-48,48,0];
const mesh = utils.createMesh({positions:vertices,uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3],
    customAttributes:[{attr:new gfx.Attribute(gfx.AttributeName.ATTR_JOINTS,gfx.Format.RGBA32F),values:Array(16).fill(0)},
        {attr:new gfx.Attribute(gfx.AttributeName.ATTR_WEIGHTS,gfx.Format.RGBA32F),values:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]}]});
const plainNode = new Node('MeshRenderer'); scene.addChild(plainNode); const plain = plainNode.addComponent(MeshRenderer); plain.mesh = mesh;
const root = new Node('Armature'), bone = new Node('Bone'), skinNode = new Node('SkinnedMeshRenderer'); scene.addChild(root); root.addChild(bone); root.addChild(skinNode);
const skeleton = new Skeleton(); skeleton.joints = ['Bone']; skeleton.bindposes = [new Mat4()];
const skin = skinNode.addComponent(SkinnedMeshRenderer); skin.enabled = false; skin.mesh = mesh; skin.skeleton = skeleton; skin.skinningRoot = root;
skin.setUseBakedAnimation(false,true);
const textures = [[255,0,0,255],[0,255,0,255]].map((bytes) => {
    const texture = new Texture2D(); texture.reset({width:1,height:1,format:Texture2D.PixelFormat.RGBA8888}); texture.uploadData(new Uint8Array(bytes)); return texture;
});
const json = await (await fetch('./effect.json')).json();
const prepared = prepareEffectForRegistration(json);
const effect = Object.assign(new EffectAsset(),prepared.effect); effect.onLoaded(); const effectName = effect.name;
const materials = [], effects = [effect];
const session = createAgentSession({app});
app.run(scene); game.pause();
function pixel(x=240,y=180) { const gl = app.canvas.getContext('webgl2'), bytes = new Uint8Array(4); gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes); return [...bytes]; }
function tick() { director.tick(0); director.tick(0); }
function run() {
    const results = [];
    for (const renderer of [plain,skin]) for (const mode of ['effectName','effectAsset']) {
        plain.enabled = renderer === plain; skin.enabled = renderer === skin;
        const material = new Material(); material.initialize(mode === 'effectName' ? {effectName:effect.name} : {effectAsset:effect}); materials.push(material);
        material.setProperty('mapA',textures[0]); material.setProperty('mapB',textures[1]); material.setProperty('tint',new Vec4(1,1,1,1)); material.setProperty('params',new Vec4(0,0,0,0));
        renderer.setSharedMaterial(material,0);
        // Native SMR creates a MaterialInstance for its model macros; use that live instance.
        const activeMaterial = renderer === skin ? renderer.getMaterialInstance(0) : material;
        tick(); const red = pixel();
        activeMaterial.setProperty('params',new Vec4(1,0,0,0)); tick(); const green = pixel();
        activeMaterial.setProperty('tint',new Vec4(1,0.5,1,1)); tick(); const dimGreen = pixel();
        activeMaterial.setProperty('tint',new Vec4(1,1,1,1)); activeMaterial.setProperty('params',new Vec4(0,0,80,0)); tick(); const oldLocation = pixel(), newLocation = pixel(320,180);
        results.push({renderer:renderer.constructor.name,model:renderer.model?.constructor.name,mode,materialInstance:activeMaterial!==material,red,green,dimGreen,oldLocation,newLocation,passes:material.passes.length});
    }
    const controls = [];
    for (const mode of ['effectName','effectAsset']) {
        plain.enabled = true; skin.enabled = false; const material = new Material(); materials.push(material);
        material.initialize({...mode === 'effectName' ? {effectName:'builtin-unlit'} : {effectAsset:EffectAsset.get('builtin-unlit')},defines:{USE_TEXTURE:true}});
        material.setProperty('mainTexture',textures[0]); plain.setSharedMaterial(material,0); tick();
        controls.push({mode,pixel:pixel(),passes:material.passes.length});
    }
    const existing = builtinResMgr.get('builtin-unlit-material'), existingControls = [];
    for(const renderer of [plain,skin]) {
        plain.enabled=renderer===plain; skin.enabled=renderer===skin; renderer.setSharedMaterial(existing,0); tick();
        existingControls.push({renderer:renderer.constructor.name,pixel:pixel(),same:renderer.sharedMaterial===existing});
    }
    plain.enabled=true;skin.enabled=false;
    const autoInput=JSON.parse(JSON.stringify(json));autoInput.name+='-automatic';autoInput.shaders[0].name+='-automatic';autoInput.shaders[0].hash+=31;
    autoInput.techniques[0].passes[0].program=autoInput.shaders[0].name;
    for(const sampler of autoInput.shaders[0].samplerTextures){delete sampler.binding;delete sampler.set;}
    const autoPrepared=prepareEffectForRegistration(autoInput), autoEffect=Object.assign(new EffectAsset(),autoPrepared.effect);effects.push(autoEffect);autoEffect.onLoaded();
    const autoMaterial=new Material();materials.push(autoMaterial);autoMaterial.initialize({effectAsset:autoEffect});autoMaterial.setProperty('mapA',textures[0]);autoMaterial.setProperty('mapB',textures[1]);autoMaterial.setProperty('params',new Vec4(1,0,0,0));plain.setSharedMaterial(autoMaterial,0);tick();
    const automatic={pixel:pixel(),bindings:autoPrepared.bindings};
    const layouts = [];
    for (const kind of ['explicit','automatic','duplicate','uboCollision','mismatch','count','type','stage']) {
        const input = JSON.parse(JSON.stringify(json)); input.name += '-layout-'+kind;
        const shader = input.shaders[0];
        if (kind === 'automatic') for (const sampler of shader.samplerTextures) { delete sampler.binding; delete sampler.set; }
        if (kind === 'duplicate') shader.samplerTextures[1].binding = 1;
        if (kind === 'uboCollision') shader.samplerTextures[0].binding = 0;
        if (kind === 'mismatch') shader.glsl4.frag = shader.glsl4.frag.replace('binding = 2','binding = 3');
        if (kind === 'count') shader.samplerTextures[0].count = 2;
        if (kind === 'type') shader.samplerTextures[0].type = 29;
        if (kind === 'stage') shader.blocks[0].stageFlags = 16;
        try { const result = prepareEffectForRegistration(input); layouts.push({kind,status:'PASS',bindings:result.bindings}); }
        catch (error) { layouts.push({kind,status:'REJECTED',code:error.code,issues:error.issues,registered:EffectAsset.get(input.name)!==null}); }
    }
    const macros = [];
    for (const [index,mode] of ['vertexOnly','sharedFalse','sharedTrue'].entries()) {
        const input = JSON.parse(JSON.stringify(json)), shader = input.shaders[0]; input.name += '-macro-'+mode; shader.name += '-macro-'+mode; shader.hash += 21+index;
        input.techniques[0].passes[0].program = shader.name; shader.defines = [{name:'PORT_SHARED',type:'boolean'}];
        for (const variant of ['glsl3','glsl4']) {
            shader[variant].vert = '#define PORT_VERTEX_ONLY 1\n'+shader[variant].vert;
            shader[variant].frag = shader[variant].frag.replace('void main() {', 'void main() {\n#if PORT_SHARED\ncc_FragColor = vec4(0,1,0,1);\n#elif defined(PORT_VERTEX_ONLY)\ncc_FragColor = vec4(1,1,0,1);\n#else\n')+'\n#endif\n';
            // Close the conditional before main's closing brace.
            shader[variant].frag = shader[variant].frag.replace(/\}\s*\n#endif\s*$/, '\n#endif\n}');
        }
        const macroEffect = Object.assign(new EffectAsset(),prepareEffectForRegistration(input).effect); effects.push(macroEffect); macroEffect.onLoaded();
        const material = new Material(); materials.push(material); material.initialize({effectAsset:macroEffect,defines:{PORT_SHARED:mode==='sharedTrue'}});
        material.setProperty('mapA',textures[0]); material.setProperty('mapB',textures[1]); plain.setSharedMaterial(material,0); tick();
        macros.push({mode,pixel:pixel()});
    }
    // Restore the known healthy texture while compiling isolated negative draws.
    plain.setSharedMaterial(materials[4],0); tick();
    const negatives = [];
    for (const stage of ['compile','link']) {
        const bad = JSON.parse(JSON.stringify(json)); bad.name += '-'+stage; bad.shaders[0].name += '-'+stage; bad.shaders[0].hash += stage === 'compile' ? 11 : 12;
        bad.techniques[0].passes[0].program = bad.shaders[0].name;
        delete bad.techniques[0].passes[0].shader; // registration mutated the original pass with its resolved template
        if (stage === 'compile') bad.shaders[0].glsl3.frag = bad.shaders[0].glsl3.frag.replace('cc_FragColor =','cc_FragColor = unknownPortSymbol +');
        else { bad.shaders[0].glsl3.frag = bad.shaders[0].glsl3.frag.replace('in highp vec2 v_uv;','in highp vec3 v_uv;').replace(/texture\((mapA|mapB),v_uv\)/g,'texture($1,v_uv.xy)'); }
        app.diagnostics.clear(); session.clearRuntimeErrors();
        const badEffect = Object.assign(new EffectAsset(),bad); effects.push(badEffect); let caught = null;
        const badNode = new Node('Negative-'+stage); scene.addChild(badNode); badNode.setPosition(150,0,0);
        const badRenderer = badNode.addComponent(MeshRenderer); badRenderer.mesh = mesh;
        try { badEffect.onLoaded(); const badMaterial = new Material(); materials.push(badMaterial); badMaterial.initialize({effectAsset:badEffect}); badRenderer.setSharedMaterial(badMaterial,0); }
        catch (error) { caught = String(error); }
        tick(); negatives.push({stage,program:bad.shaders[0].name,caught,diagnostics:app.diagnostics.snapshot(),tool:session.getRuntimeErrors(),healthyPixel:pixel()});
        badRenderer.enabled = false; badRenderer.mesh = null; badRenderer.setSharedMaterial(null,0); badNode.destroy(); tick();
    }
    return {results,controls,existingControls,automatic,layouts,macros,negatives,reflection:{blocks:json.shaders[0].blocks,samplers:json.shaders[0].samplerTextures},effectRegistered:EffectAsset.get(effect.name)===effect,limitations:['SMR uses a custom unskinned shader to isolate Material registration; skeletal deformation is covered separately']};
}
window.__effectLayout = {ready:true,run,release:async () => {
    plain.mesh = null; skin.mesh = null; plain.setSharedMaterial(null,0); skin.setSharedMaterial(null,0); session.close();
    const receipt = await app.releaseScene(); materials.forEach((m) => m.destroy()); effects.forEach((e) => e.destroy()); textures.forEach((t) => t.destroy()); mesh.destroy(); skeleton.destroy(); director.tick(0);
    return {receipt,valid:[...materials,...effects,...textures,mesh,skeleton].map((a) => a.isValid),registered:EffectAsset.get(effectName)!==null,builtinValid:builtinResMgr.get('builtin-unlit-material').isValid};
} };
