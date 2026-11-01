/** Public SDK223 orchestration, never private flush. Owners register allocations immediately. */
export async function releaseOwned({app,scene,nodes,assets,record}) {
    if(!app?.releaseScene)throw Error('Public releaseScene unavailable');
    const current=app.getScene(),errors=[];
    const requestDestroy=(object,label)=>{
        if(!object?.isValid)return;
        try {object.destroy();record({kind:'destroy-request',label});}
        catch(error){errors.push({label,error:String(error)});}
    };
    if(scene?.isValid&&current!==scene)requestDestroy(scene,'unmounted-scene');
    for(const node of nodes) {
        if(!node.isValid)continue;
        let parent=node.parent,belongsToCurrent=false;
        while(parent){if(parent===current){belongsToCurrent=true;break;}parent=parent.parent;}
        if(!belongsToCurrent)requestDestroy(node,'unowned-node');
    }
    const first=await app.releaseScene();record({kind:'releaseScene',phase:'scene-and-unowned-nodes',receipt:first,destroyErrors:[...errors]});
    if(first.status!=='released'||scene?.isValid||nodes.some(node=>node.isValid)||errors.length)
        throw Error('Scene/node cleanup incomplete; owned identities and assets retained');
    nodes.length=0;
    for(const asset of [...assets].reverse())requestDestroy(asset,'owned-asset');
    // SDK223 clears its completed _release promise; empty-scene calls still perform its public final flush.
    const second=await app.releaseScene();record({kind:'releaseScene',phase:'owned-assets-flush',receipt:second,destroyErrors:[...errors]});
    for(let i=assets.length-1;i>=0;i--)if(!assets[i].isValid)assets.splice(i,1);
    record({kind:'owned-allocation-state',remainingNodes:nodes.length,remainingAssets:assets.length});
    if(second.status!=='released'||assets.length||errors.length)throw Error('Asset cleanup incomplete; valid identities retained');
}
export function attemptStops(stops) {
    const errors=[];for(const stop of stops)try{stop();}catch(error){errors.push(String(error));}return errors;
}
/** Once invoked, SDK223 caches success OR failure permanently. Preparation failures are different. */
export class CloseOnce {
    started=false;
    async invoke(app,record) {
        if(this.started)throw Error('SDK close already invoked; terminal handle requires reload');
        if(typeof app?.close!=='function')throw Error('Public close unavailable');
        this.started=true; // before invocation, including a synchronous exception
        const receipt=await app.close();record({kind:'close',receipt});
        if(receipt.status!=='released')throw Error('SDK close failed terminally; reload required');
        return receipt;
    }
}
/** A construction/onLoad failure immediately attempts public cleanup; preserves both errors if it fails. */
export async function mountOwned(mount,cleanup,record) {
    try{return mount();}
    catch(error){
        record({kind:'mount-failed',error:String(error)});
        try{await cleanup();}
        catch(cleanupError){record({kind:'mount-cleanup-failed',error:String(cleanupError)});throw new AggregateError([error,cleanupError],'Mount and owned cleanup failed');}
        throw error;
    }
}
