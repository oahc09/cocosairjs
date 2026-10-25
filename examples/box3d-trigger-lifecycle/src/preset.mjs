/** Fixed diagnostic sequence only. No eval/script/physics stepping or synthetic native events. */
export class InZonePreset {
    constructor({kind,generation,self,other,originalValue}) {
        if(!['mask','enabled','trigger'].includes(kind)) throw Error('Unknown diagnostic preset');
        this.kind=kind;this.generation=generation;this.self=self;this.other=other;this.originalValue=originalValue;
        this.state='ARMED';this.anchorTick=null;this.actions=[];this.records=[];
    }
    get blocksManual() {return this.state==='ARMED'||this.state==='ANCHORED';}
    anchor(event) {
        if(this.state!=='ARMED'||event.accepted!==true||event.kind!=='enter'||event.generation!==this.generation||
           event.self!==this.self||event.other!==this.other||!Number.isInteger(event.hookTick)) return false;
        this.anchorTick=event.hookTick;this.state='ANCHORED';
        this.actions=[{index:0,requestTick:event.hookTick,dueTick:event.hookTick+2,value:this.kind==='mask'?0:false,status:'PENDING'},
            {index:1,requestTick:event.hookTick,dueTick:event.hookTick+4,value:this.originalValue,status:'PENDING'}];
        this.records.push({kind:'anchor',generation:this.generation,self:this.self,other:this.other,hookTick:event.hookTick});return true;
    }
    due(tick,generation,alive) {
        if(!this.blocksManual)return [];
        if(generation!==this.generation||!alive){this.cancel(!alive?'actor-retired':'wrong-generation',tick);return [];}
        if(this.state!=='ANCHORED')return [];
        if(this.actions.some(a=>a.status==='PENDING'&&a.dueTick<tick)){this.cancel('missed-due-tick',tick);return [];}
        return this.actions.filter(a=>a.status==='PENDING'&&a.dueTick===tick).map(a=>{a.status='QUEUED';return {...a};});
    }
    canApply(action,tick,generation,alive) {
        const current=this.actions[action.index];
        if(this.state!=='ANCHORED'||!current||current.status!=='QUEUED')return false;
        if(generation!==this.generation||!alive||tick!==current.dueTick){this.cancel('stale-idle-action',tick);return false;}
        return true;
    }
    applied(action,tick,before,after,visitorPose) {
        const current=this.actions[action.index];
        if(this.state!=='ANCHORED'||!current||current.status!=='QUEUED'||tick!==current.dueTick)throw Error('Invalid preset completion');
        current.status='APPLIED';
        this.records.push({kind:'action',control:this.kind,index:action.index,generation:this.generation,self:this.self,other:this.other,
            requestTick:current.requestTick,dueTick:current.dueTick,actualIdleHookTick:tick,value:current.value,before,after,visitorPose});
        if(this.actions.every(a=>a.status==='APPLIED'))this.state='COMPLETE';
    }
    cancel(reason,tick) {
        if(!this.blocksManual)return;
        this.state='CANCELLED';for(const action of this.actions)if(action.status!=='APPLIED')action.status='CANCELLED';
        this.records.push({kind:'cancelled',reason,hookTick:tick,generation:this.generation});
    }
}
export function sphereBoxOverlap({spherePosition,boxPosition,radius,halfSize}) {
    if(![spherePosition.x,spherePosition.y,spherePosition.z,boxPosition.x,boxPosition.y,boxPosition.z,radius,halfSize.x,halfSize.y,halfSize.z].every(Number.isFinite)||radius<=0)throw Error('Invalid overlap observation');
    const outside=['x','y','z'].map(axis=>Math.max(Math.abs(spherePosition[axis]-boxPosition[axis])-halfSize[axis],0));
    const distanceSquared=outside.reduce((sum,d)=>sum+d*d,0);
    return {kind:'PUBLIC_POSE_GEOMETRY_INTERSECTION_NOT_NATIVE_EVENT',distanceSquared,radiusSquared:radius*radius,intersects:distanceSquared<=radius*radius};
}
