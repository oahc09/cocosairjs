/* Compare transformed sampling with independently baked UVs, then load official test models. */
async (page) => {
    const webgl1 = page.url().includes('webgl=1');
        if (webgl1) throw new Error('WEBGL2_REQUIRED: WebGL 1 verification mode is retired; use the WebGL 2 mode.');
    await page.addInitScript((forceWebGL1) => {
        if (forceWebGL1) {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
        }
    }, webgl1);
    const errors = [];
    const onConsole = (message) => {
        if (message.type() === 'error' && message.text() !== 'This device does not support WebGL2') errors.push(message.text().slice(0, 500));
    };
    const onError = (error) => errors.push(String(error));
    page.on('console', onConsole); page.on('pageerror', onError);
    try {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(`http://127.0.0.1:7462/gltf-viewer/${webgl1 ? '?webgl=1' : ''}`);
        await page.waitForFunction(() => window.gltfViewer?.name === 'BoxTextured.glb');
        const synthetic = await page.evaluate(async () => {
            const { GLTFLoader, game, director, Vec3 } = await import('/build/cocosair.module.js');
            game.pause();
            const viewer = window.gltfViewer; viewer.instance.root.active = false;
            const scene = viewer.instance.root.parent;
            viewer.camera.node.setPosition(0, 0, 4); viewer.camera.node.lookAt(new Vec3());
            const data = await (await fetch('./assets/diagnostics.glb')).arrayBuffer();
            const header = new DataView(data); const jsonLength = header.getUint32(12, true);
            const fixtureDocument = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)));
            const bin = data.slice(28 + jsonLength);
            const dataURI = (buffer) => 'data:application/octet-stream;base64,' + btoa(String.fromCharCode(...new Uint8Array(buffer)));
            fixtureDocument.buffers[0].uri = dataURI(bin);
            fixtureDocument.meshes = [fixtureDocument.meshes[0]]; fixtureDocument.meshes[0].primitives[0].material = 0;
            fixtureDocument.nodes = [{ mesh:0 }]; fixtureDocument.scenes = [{ nodes:[0] }];
            const canvas = document.querySelector('canvas'); const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            const loader = new GLTFLoader();
            const render = async (json) => {
                const asset = await loader.parseAsync(JSON.stringify(json)); const instance = asset.instantiate(); scene.addChild(instance.root);
                try {
                    director.tick(0);
                    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                    const error = gl.getError(); if (error) throw new Error(`WebGL error ${error}`);
                    return pixels;
                } finally { instance.dispose(); asset.destroy(); director.tick(0); await Promise.resolve(); }
            };
            const results = [];
            for (const slot of ['baseColorTexture','metallicRoughnessTexture','normalTexture','occlusionTexture','emissiveTexture']) {
                for (const texCoord of [0,1]) {
                    const transformed = JSON.parse(JSON.stringify(fixtureDocument));
                    const transform = { offset:[0.22,0.1], rotation:0.31, scale:[0.63,0.78], texCoord };
                    const info = { index:slot==='normalTexture'?2:slot==='occlusionTexture'?1:0,
                        texCoord:1-texCoord, extensions:{KHR_texture_transform:transform} };
                    const material = { pbrMetallicRoughness:{baseColorFactor:[0.7,0.5,0.3,1],metallicFactor:0.3,roughnessFactor:0.8}, emissiveFactor:slot==='emissiveTexture'?[0.7,0.7,0.7]:[0,0,0] };
                    const parent = slot==='baseColorTexture'||slot==='metallicRoughnessTexture' ? material.pbrMetallicRoughness : material;
                    parent[slot] = info;
                    transformed.materials = [material]; transformed.extensionsRequired = ['KHR_texture_transform']; transformed.extensionsUsed = ['KHR_texture_transform'];
                    const reference = JSON.parse(JSON.stringify(transformed));
                    const referenceInfo = slot==='baseColorTexture'||slot==='metallicRoughnessTexture' ? reference.materials[0].pbrMetallicRoughness[slot] : reference.materials[0][slot];
                    delete referenceInfo.extensions; referenceInfo.texCoord = texCoord;
                    reference.extensionsRequired = []; reference.extensionsUsed = [];
                    const primitive = reference.meshes[0].primitives[0];
                    const accessor = reference.accessors[primitive.attributes[`TEXCOORD_${texCoord}`]];
                    const view = reference.bufferViews[accessor.bufferView];
                    const original = new Float32Array(bin, (view.byteOffset||0)+(accessor.byteOffset||0), accessor.count*2);
                    const baked = new Float32Array(original.length);
                    // Independent baked reference in glTF's top-left UV basis.
                    for (let i=0;i<original.length;i+=2) {
                        const x=original[i]*transform.scale[0], y=original[i+1]*transform.scale[1];
                        baked[i]=x*Math.cos(transform.rotation)+y*Math.sin(transform.rotation)+transform.offset[0];
                        baked[i+1]=-x*Math.sin(transform.rotation)+y*Math.cos(transform.rotation)+transform.offset[1];
                    }
                    const bufferIndex=reference.buffers.length; reference.buffers.push({uri:dataURI(baked.buffer),byteLength:baked.byteLength});
                    const viewIndex=reference.bufferViews.length; reference.bufferViews.push({buffer:bufferIndex,byteLength:baked.byteLength});
                    const accessorIndex=reference.accessors.length; reference.accessors.push({bufferView:viewIndex,componentType:5126,count:accessor.count,type:'VEC2'});
                    primitive.attributes[`TEXCOORD_${texCoord}`]=accessorIndex;
                    const actual=await render(transformed), expected=await render(reference);
                    const identity=JSON.parse(JSON.stringify(transformed)); identity.extensionsRequired=[]; identity.extensionsUsed=[];
                    const identityInfo=slot==='baseColorTexture'||slot==='metallicRoughnessTexture'?identity.materials[0].pbrMetallicRoughness[slot]:identity.materials[0][slot];
                    delete identityInfo.extensions; identityInfo.texCoord=texCoord;
                    const untransformed=await render(identity);
                    let changed=0,maxDifference=0,foreground=0,changedFromIdentity=0;
                    for(let i=0;i<actual.length;i+=4){let difference=0;for(let c=0;c<3;c++)difference=Math.max(difference,Math.abs(actual[i+c]-expected[i+c]));maxDifference=Math.max(maxDifference,difference);if(difference>3)changed++;}
                    for(let i=0;i<actual.length;i+=4){if(Math.abs(actual[i]-actual[0])+Math.abs(actual[i+1]-actual[1])+Math.abs(actual[i+2]-actual[2])>15)foreground++;
                        if(Math.abs(actual[i]-untransformed[i])+Math.abs(actual[i+1]-untransformed[i+1])+Math.abs(actual[i+2]-untransformed[i+2])>3)changedFromIdentity++;}
                    if(changed>actual.length/4*0.001)throw new Error(`${slot}/UV${texCoord} differs from baked UVs: ${changed} pixels`);
                    if(foreground<100||changedFromIdentity<50)throw new Error(`${slot}/UV${texCoord} has no meaningful visible transform: ${foreground}/${changedFromIdentity}`);
                    results.push({slot,texCoord,changed,maxDifference,foreground,changedFromIdentity});
                }
            }
            viewer.instance.root.active = true;
            return {api:gl.getParameter(gl.VERSION),results};
        });
        const official = [];
        for (const name of ['TextureTransformTest','TextureTransformMultiTest']) {
            await page.goto(`http://127.0.0.1:7462/gltf-catalog/?model=${name}`);
            await page.waitForFunction(() => ['READY','ERROR'].includes(document.querySelector('#air-state').textContent), null, {timeout:45000});
            const state = await page.locator('#air-state').textContent();
            const status = await page.locator('#load-status').textContent();
            if(state!=='READY')throw new Error(`${name}: ${status}`);
            official.push({name,state,status});
            await page.screenshot({path:`output/playwright/${name}-webgl${webgl1?1:2}.png`});
        }
        if(errors.length)throw new Error(errors.join('\n'));
        return {passed:true,webgl:webgl1?1:2,synthetic,official,errors};
    } finally {page.off('console',onConsole);page.off('pageerror',onError);}
}
