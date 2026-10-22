/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Strict exact affected-member source slices plus complete transaction/observer/guard.
 * Declared engine surroundings are intentionally narrow, not full SDK qualification.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const tsPath=require.resolve('typescript',{paths:[path.join(__dirname,'../box3d-rebuild-20261022')]});
const ts=require(tsPath),root='/virtual-private-subscription';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const inputs={},slices=[];
function read(logical){const text=fs.readFileSync(path.join(__dirname,logical),'utf8');inputs[logical]={sha256:sha(text),bytes:Buffer.byteLength(text)};return text;}
function extract(logical,className,members,helpers=[]){
    const text=read(logical),file=ts.createSourceFile(logical,text,ts.ScriptTarget.ES2022,true);
    const cls=file.statements.find(x=>ts.isClassDeclaration(x)&&x.name.text===className);
    const selected=cls.members.filter(x=>x.name&&members.includes(x.name.getText(file)));
    const nodes=[...file.statements.filter(x=>helpers.includes(x.name?.getText(file))||ts.isVariableStatement(x)&&x.declarationList.declarations.some(d=>helpers.includes(d.name.getText(file)))),...selected];
    for(const node of nodes)slices.push({logical,start:node.getStart(file),end:node.end,sha256:sha(text.slice(node.getStart(file),node.end))});
    return {helpers:nodes.slice(0,nodes.length-selected.length).map(x=>x.getText(file)).join('\n'),members:selected.map(x=>x.getText(file)).join('\n')};
}
const TX='src/cocos/physics/framework/physics-material-transaction.ts';
const OBS='src/cocos/physics/framework/physics-state-observer.ts';
const GUARD='src/cocos/core/data/mutation-guard.ts';
const coll=extract('src/cocos/physics/framework/components/colliders/collider.ts','Collider',['material','onLoad','onDestroy','_materialIdentity','_updateMaterial'],['observedMaterialAssets','retainObservedMaterial']);
const sys=extract('src/cocos/physics/framework/physics-system.ts','PhysicsSystem',['setDefaultPhysicsMaterial']);
const files={
 [`${root}/physics-material-transaction.ts`]:read(TX),
 [`${root}/physics-state-observer.ts`]:read(`inputs/product/${OBS}`),
 [`${root}/mutation-guard.ts`]:read(`inputs/product/${GUARD}`),
 [`${root}/affected.ts`]:`
 import { beginPhysicsMaterialChange, capturePhysicsMaterialCleanup } from './physics-material-transaction';
 import type { PhysicsMaterialIdentity, PhysicsMaterialCleanupError, PhysicsMaterialCleanupStage } from './physics-material-transaction';
 import { assertMutationAllowed } from './mutation-guard';
 declare class PhysicsMaterial {
   static readonly EVENT_UPDATE: string; id: string;
   friction: number; restitution: number; rollingFriction: number; spinningFriction: number;
   on(event: string, callback: () => void, target: object): void;
   off(event: string, callback: () => void, target: object): void;
   clone(): PhysicsMaterial;
 }
 interface Shape {
   setMaterial(value: PhysicsMaterial | null): void;
   initialize(collider: Collider): void;
   onLoad?(): void;
   onDestroy?(): void;
   updateEventListener(): void;
 }
 declare const selector: { id: string; runInEditor: boolean };
 declare function createShape(type: number): Shape;
 ${coll.helpers}
 class Collider {
   protected _material: PhysicsMaterial | null = null;
   protected _isSharedMaterial = true;
   protected _shape: Shape | null = null;
   protected _needTriggerEvent = false;
   protected _needCollisionEvent = false;
   protected _boundingSphere: { destroy(): void } | null = null;
   public sharedMaterial: PhysicsMaterial | null = null;
   readonly type = 0;
   ${coll.members}
 }
 class PhysicsSystem {
   private _material!: PhysicsMaterial;
   physicsWorld!: { setDefaultMaterial(material: PhysicsMaterial): void };
   private _updateMaterial(): void {}
   ${sys.members}
 }
 `,
 [`${root}/contract-types.ts`]:`
 import { PhysicsMaterialTransactionRegistry, registerPhysicsMaterialDelegate } from './physics-material-transaction';
 import type { PhysicsMaterialDelegate, PhysicsMaterialCleanupObserver, PhysicsMaterialChange } from './physics-material-transaction';
 declare const target: object, delegate: PhysicsMaterialDelegate, cleanup: PhysicsMaterialCleanupObserver;
 const registry = new PhysicsMaterialTransactionRegistry();
 registry.register(target, delegate);
 registry.register(target, delegate, cleanup);
 registry.register(target, delegate, undefined, 'private');
 registerPhysicsMaterialDelegate(target, delegate, cleanup, 'legacy');
 // @ts-expect-error Fourth mode remains the exact trusted literal union.
 registry.register(target, delegate, cleanup, 'PRIVATE');
 // @ts-expect-error Cleanup remains third, not subscription mode.
 registry.register(target, delegate, 'private');
 declare const change: PhysicsMaterialChange;
 const capability: boolean = change.privateSubscriptions;
 // @ts-expect-error The copied capability is readonly.
 change.privateSubscriptions = false;
 `,
};
const options={strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,skipLibCheck:false,types:[],moduleResolution:ts.ModuleResolutionKind.Node10};
const host=ts.createCompilerHost(options),originalRead=host.readFile.bind(host),originalExists=host.fileExists.bind(host),compilerReads=new Map();
host.readFile=p=>{const text=files[p]===undefined?originalRead(p):files[p];if(text!==undefined)compilerReads.set(p,sha(text));return text;};
host.fileExists=p=>files[p]!==undefined||originalExists(p);
host.getSourceFile=(p,lang)=>{const text=host.readFile(p);return text===undefined?undefined:ts.createSourceFile(p,text,lang,true);};
host.resolveModuleNames=(names)=>names.map(name=>{const file=`${root}/${name.replace('./','')}.ts`;if(files[file]===undefined)throw Error(`Unexpected import ${name}`);return{resolvedFileName:file,extension:ts.Extension.Ts};});
const program=ts.createProgram(Object.keys(files),options,host),diagnostics=ts.getPreEmitDiagnostics(program);
const out=path.join(__dirname,process.argv[2]||'evidence/typecheck-a');fs.mkdirSync(out,{recursive:true});
for(const [file,text] of Object.entries(files))fs.writeFileSync(path.join(out,path.basename(file)),text);
const result={schema:'private-subscription-typecheck/1',scope:'strict=true on complete transaction/observer/guard and byte-exact affected Collider/System members against controlled declarations; not full SDK',options,typescript:ts.version,compiler:{path:tsPath,sha256:sha(fs.readFileSync(tsPath))},inputs,slices,compilerReads:[...compilerReads].map(([file,sha256])=>({file,sha256})),diagnostics:diagnostics.map(d=>({file:d.file?.fileName,start:d.start,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');fs.copyFileSync(__filename,path.join(out,'typecheck-used.cjs'));
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>__dirname,getCanonicalFileName:p=>p,getNewLine:()=>'\n'})||`Strict affected-source typecheck PASS (${slices.length} exact slices; ${compilerReads.size} compiler inputs).`);
process.exitCode=diagnostics.length?1:0;
