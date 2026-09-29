/**
 * Smoke 31 — LV12-12 marionette pose-graph 单元级回归。
 *
 * 默认 bundle 里 marionette/pose-graph 的 runtime 导出被 src/cc.config.json 的
 * `!MARIONETTE` / `!PROCEDURAL_ANIMATION` 虚拟模块覆盖成了空模块，所以示例（浏览器）级取证不可达；
 * 依计划书 C3/R10 的既定口径降级为「闭包完整 + 单元级 pose node 求值正确」，理由与实测见
 * docs/notes/v12-pose-graph-notes.md。ts-jest 直接 import src/，绕开 esbuild 的虚拟模块覆盖，
 * 因此这里能真正把姿势图跑起来并断言数值。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Node, Quat, Scene, Vec3 } from '../../src';
import { AnimationController } from '../../src/cocos/animation/marionette/animation-controller';
import { AnimationGraph } from '../../src/cocos/animation/marionette/animation-graph';
import { AnimationGraphEval } from '../../src/cocos/animation/marionette/graph-eval';
import { PoseGraph } from '../../src/cocos/animation/marionette/pose-graph/pose-graph';
import { PoseNodeApplyTransform, TransformOperation } from '../../src/cocos/animation/marionette/pose-graph/pose-nodes/apply-transform';
import { TransformSpace } from '../../src/cocos/animation/marionette/pose-graph/pose-nodes/transform-space';
import { poseGraphOp } from '../../src/cocos/animation/marionette/pose-graph/op';

const ROOT = join(__dirname, '..', '..');
const POSE_GRAPH_DIR = join(ROOT, 'src', 'cocos', 'animation', 'marionette', 'pose-graph');

function listTsFiles (dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listTsFiles(abs));
        } else if (entry.name.endsWith('.ts')) {
            out.push(abs);
        }
    }
    return out;
}

type Wiring = {
    poseGraph: PoseGraph;
    add: (node: PoseNodeApplyTransform) => PoseNodeApplyTransform;
};

/**
 * 搭出 `root/target` + `root/untouched` 的骨架，把一批姿势结点连到图的输出上，
 * 用 ProceduralPoseState 走真实求值链路（instantiate → bind → settle → update → evaluate → apply）。
 */
function runPoseGraph (configure: (wiring: Wiring) => void): {
    target: Node;
    untouched: Node;
    eval_: AnimationGraphEval;
} {
    const scene = new Scene('pose-graph-scene');
    const root = new Node('root');
    scene.addChild(root);
    const target = new Node('target');
    root.addChild(target);
    target.setPosition(new Vec3(5, 0, 0));
    const untouched = new Node('untouched');
    root.addChild(untouched);

    const controller = root.addComponent(AnimationController) as AnimationController;

    const graph = new AnimationGraph();
    const stateMachine = graph.addLayer().stateMachine;
    const poseState = stateMachine.addProceduralPoseState();
    const poseGraph = poseState.graph;
    configure({ poseGraph, add: (node) => poseGraph.addNode(node) });
    const transition: any = stateMachine.connect(stateMachine.entryState, poseState);
    // 无时长：断言看到的就是纯姿势求值结果，而不是与空状态过渡混合后的中间权重。
    transition.duration = 0;

    const eval_ = new AnimationGraphEval(graph, root, controller, null);
    (controller as any)._graphEval = eval_;
    return { target, untouched, eval_ };
}

describe('smoke 31 — LV12-12 pose-graph', () => {
    describe('闭包完整（抽取子树 + 逐文件簿记 + 空替身）', () => {
        const map = JSON.parse(readFileSync(join(ROOT, 'docs', 'upstream-file-map.json'), 'utf8'));
        const registered = new Map<string, any>(map.mapping.map((r: any) => [String(r.airPath).replace(/\\/g, '/'), r]));

        test('pose-graph 子树每个 .ts 都在 upstream-file-map 登记且标记未修改', () => {
            const files = listTsFiles(POSE_GRAPH_DIR);
            expect(files.length).toBeGreaterThanOrEqual(52);
            const unregistered: string[] = [];
            const modified: string[] = [];
            for (const abs of files) {
                const rel = relative(ROOT, abs).replace(/\\/g, '/');
                const rec = registered.get(rel);
                if (!rec) {
                    unregistered.push(rel);
                } else if (rec.modified) {
                    modified.push(rel);
                }
            }
            expect({ unregistered, modified }).toEqual({ unregistered: [], modified: [] });
        });

        test('运行时导出面被构建期覆盖为 empty（示例级不可达的根因是配置而非缺文件）', () => {
            const config = readFileSync(join(ROOT, 'src', 'cc.config.json'), 'utf8');
            expect(config).toContain('!context.buildTimeConstants.MARIONETTE');
            expect(config).toContain('marionette/runtime-exports.ts');
            expect(config).toContain('index-empty.ts');
            expect(config).toContain('!context.buildTimeConstants.PROCEDURAL_ANIMATION');
            expect(config).toContain('runtime-exports-empty.ts');
            // 空替身本身也必须逐字节存在，否则「闭包完整」不成立。
            const stub = readFileSync(join(POSE_GRAPH_DIR, 'runtime-exports-empty.ts'), 'utf8');
            expect(stub.length).toBeGreaterThan(0);
            expect(stub).not.toContain('PoseGraph');
            expect(existsSync(join(ROOT, 'src', 'cocos', 'animation', 'marionette', 'index-empty.ts'))).toBe(true);
            // 真导出面在 src 里完整存在（jest 走的就是这条路）。
            const realExports = readFileSync(join(POSE_GRAPH_DIR, 'runtime-exports.ts'), 'utf8');
            expect(realExports).toContain('./pose-nodes/all');
            expect(realExports).toContain('./pure-value-nodes/all');
        });
    });

    describe('单元级 pose node 求值正确（PoseNodeApplyTransform）', () => {
        test('REPLACE + 满强度：目标结点局部位置被精确替换，未绑定名字影响的兄弟结点不动', () => {
            const { target, untouched, eval_ } = runPoseGraph(({ poseGraph, add }) => {
                const applyNode = add(new PoseNodeApplyTransform());
                applyNode.node = 'target';
                applyNode.positionOperation = TransformOperation.REPLACE;
                applyNode.position = new Vec3(1, 2, 3);
                applyNode.transformSpace = TransformSpace.COMPONENT;
                poseGraphOp.connectOutputNode(poseGraph, applyNode);
            });
            eval_.update(0.016);
            // 组件结点为单位变换 ⇒ COMPONENT 空间即 target 的局部空间，结果精确等于输入值。
            expect({ ...target.position }).toEqual({ x: 1, y: 2, z: 3 });
            expect({ ...untouched.position }).toEqual({ x: 0, y: 0, z: 0 });
            eval_.destroy();
        });

        test('REPLACE + 半强度：lerp(5, 1, 0.5) = 3 精确插值', () => {
            const { target, eval_ } = runPoseGraph(({ poseGraph, add }) => {
                const applyNode = add(new PoseNodeApplyTransform());
                applyNode.node = 'target';
                applyNode.positionOperation = TransformOperation.REPLACE;
                applyNode.position = new Vec3(1, 0, 0);
                applyNode.transformSpace = TransformSpace.COMPONENT;
                applyNode.intensity.value = 0.5;
                poseGraphOp.connectOutputNode(poseGraph, applyNode);
            });
            eval_.update(0.016);
            // 输入姿势是骨架默认姿势 (5,0,0)，半强度插值 ⇒ 5 + (1-5)·0.5 = 3。
            expect({ ...target.position }).toEqual({ x: 3, y: 0, z: 0 });
            eval_.destroy();
        });

        test('强度低于 epsilon：modifyPose 早退，姿势保持默认', () => {
            const { target, eval_ } = runPoseGraph(({ poseGraph, add }) => {
                const applyNode = add(new PoseNodeApplyTransform());
                applyNode.node = 'target';
                applyNode.positionOperation = TransformOperation.REPLACE;
                applyNode.position = new Vec3(1, 2, 3);
                applyNode.transformSpace = TransformSpace.COMPONENT;
                applyNode.intensity.value = 0;
                poseGraphOp.connectOutputNode(poseGraph, applyNode);
            });
            eval_.update(0.016);
            expect({ ...target.position }).toEqual({ x: 5, y: 0, z: 0 });
            eval_.destroy();
        });

        test('rotation ADD + 满强度：结果 = value · inputRotation，位置不受牵连', () => {
            const { target, eval_ } = runPoseGraph(({ poseGraph, add }) => {
                const applyNode = add(new PoseNodeApplyTransform());
                applyNode.node = 'target';
                applyNode.rotationOperation = TransformOperation.ADD;
                applyNode.rotation = new Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2);
                applyNode.transformSpace = TransformSpace.COMPONENT;
                poseGraphOp.connectOutputNode(poseGraph, applyNode);
            });
            eval_.update(0.016);
            // 默认旋转为单位四元数 ⇒ ADD(满强度) = value · identity = value（绕 Z 90°）。
            expect(target.rotation.equals(new Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2))).toBe(true);
            expect({ ...target.position }).toEqual({ x: 5, y: 0, z: 0 });
            eval_.destroy();
        });

        test('两个 ModifyPose 结点串联：链路遍历与求值顺序正确', () => {
            const { target, untouched, eval_ } = runPoseGraph(({ poseGraph, add }) => {
                const first = add(new PoseNodeApplyTransform());
                first.node = 'target';
                first.positionOperation = TransformOperation.REPLACE;
                first.position = new Vec3(1, 0, 0);
                first.transformSpace = TransformSpace.COMPONENT;

                const second = add(new PoseNodeApplyTransform());
                second.node = 'untouched';
                second.positionOperation = TransformOperation.REPLACE;
                second.position = new Vec3(0, 7, 0);
                second.transformSpace = TransformSpace.COMPONENT;
                // 输入键是 [propertyKey, elementIndex?] 元组；写错键名只会让 connectNode 静默 error()，
                // 所以先把键面本身钉住，避免串联退化成「两个独立结点」。
                expect(poseGraphOp.getInputKeys(second).map((k: readonly string[]) => k[0])).toContain('pose');
                // second 的上游是 first ⇒ 一条链上两个结点都要被实例化并求值。
                poseGraphOp.connectNode(poseGraph, second, ['pose'], first);
                poseGraphOp.connectOutputNode(poseGraph, second);
            });
            eval_.update(0.016);
            expect({ ...target.position }).toEqual({ x: 1, y: 0, z: 0 });
            expect({ ...untouched.position }).toEqual({ x: 0, y: 7, z: 0 });
            eval_.destroy();
        });

        test('每帧求值稳定：连续 5 帧结果不漂移（无姿势栈泄漏）', () => {
            const { target, eval_ } = runPoseGraph(({ poseGraph, add }) => {
                const applyNode = add(new PoseNodeApplyTransform());
                applyNode.node = 'target';
                applyNode.positionOperation = TransformOperation.REPLACE;
                applyNode.position = new Vec3(-2, 4, 0);
                applyNode.transformSpace = TransformSpace.COMPONENT;
                poseGraphOp.connectOutputNode(poseGraph, applyNode);
            });
            for (let i = 0; i < 5; ++i) {
                eval_.update(0.016);
                expect({ ...target.position }).toEqual({ x: -2, y: 4, z: 0 });
            }
            expect((eval_ as any)._evaluationContext.allocatedPoseCount).toBe(0);
            eval_.destroy();
        });
    });
});
