/* Real Cocos GFX dispatch and GPU readback; the readback explicitly drives the displayed material. */
const VALUE_COUNT = 16;
const SENTINEL = 0xdeadbeef;
const INDIRECT_WORDS = [0, 12, 1, 1];

function requireCondition(condition, message) {
    if (!condition) throw new Error(message);
}

function expectedWords(seed, count) {
    const words = Array(VALUE_COUNT + 1).fill(SENTINEL);
    words[0] = seed;
    for (let index = 0; index < count; index++) words[index + 1] = (index + 3) * (index + 5) + seed;
    return words;
}

function requireWords(actual, expected, label) {
    requireCondition(
        actual.length === expected.length && actual.every((value, index) => value === expected[index]),
        `${label}: actual [${actual}] differs from expected [${expected}]`,
    );
}

async function bounded(promise, label) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} exceeded 10000ms`)), 10000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

export async function buildComputeScenario(air, { id, scene, camera, cameraNode }) {
    requireCondition(id === 'compute', 'Compute builder received another scene ID');
    const g = air.gfx;
    const device = air.director.root.device;
    const native = device.nativeDevice;
    requireCondition(device.gfxAPI === g.API.WEBGPU, 'Compute scenario requires the selected AIR WebGPU device');
    const owned = [];
    const own = (resource) => {
        owned.push(resource);
        return resource;
    };
    let mesh, material, values, argumentsBuffer, command, descriptor, pipeline;
    let directReceipt, indirectReceipt, materialColor;
    let disposed = false;

    async function readWords(buffer, count) {
        // Same retained readback path as webgpu-resource-contracts.cjs; dispatch itself uses Cocos GFX.
        const staging = native.createBuffer({
            size: count * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });
        try {
            const encoder = native.createCommandEncoder();
            encoder.copyBufferToBuffer(buffer.gpuBuffer.gpuBuffer, 0, staging, 0, count * 4);
            native.queue.submit([encoder.finish()]);
            await bounded(staging.mapAsync(GPUMapMode.READ), 'Compute readback mapping');
            return Array.from(new Uint32Array(staging.getMappedRange()).slice(0, count));
        } finally {
            staging.unmap();
            staging.destroy();
        }
    }

    async function dispatchAndRead(seed, indirect) {
        const initialized = new Uint32Array(VALUE_COUNT + 1).fill(SENTINEL);
        initialized[0] = seed;
        values.update(initialized);
        if (indirect) argumentsBuffer.update(new Uint32Array(INDIRECT_WORDS));
        command.begin();
        command.bindPipelineState(pipeline);
        command.bindDescriptorSet(0, descriptor);
        command.dispatch(
            indirect ? new g.DispatchInfo(0, 0, 0, argumentsBuffer, 4) : new g.DispatchInfo(VALUE_COUNT, 1, 1),
        );
        command.end();
        const actual = await readWords(values, VALUE_COUNT + 1);
        const expected = expectedWords(seed, indirect ? INDIRECT_WORDS[1] : VALUE_COUNT);
        requireWords(actual, expected, indirect ? 'Indirect compute output' : 'Direct compute output');
        const receipt = {
            mode: indirect ? 'indirect' : 'direct',
            seed,
            workgroups: indirect ? INDIRECT_WORDS.slice(1) : [VALUE_COUNT, 1, 1],
            actual,
            expected,
        };
        if (indirect) {
            const argumentReadback = await readWords(argumentsBuffer, INDIRECT_WORDS.length);
            requireWords(argumentReadback, INDIRECT_WORDS, 'Indirect argument buffer readback');
            Object.assign(receipt, {
                indirectOffsetBytes: 4,
                argumentReadback,
                untouchedTail: actual.slice(INDIRECT_WORDS[1] + 1),
                offsetGuard: 'The word at byte zero is zero; ignoring the four-byte offset dispatches no work.',
            });
        }
        await bounded(native.queue.onSubmittedWorkDone(), 'Compute queue completion');
        return receipt;
    }

    async function dispose() {
        if (disposed) return;
        const failures = [];
        try {
            await bounded(native.queue.onSubmittedWorkDone(), 'Compute disposal queue completion');
        } catch (error) {
            failures.push(String(error?.message || error));
        }
        for (const resource of [...owned].reverse()) {
            try {
                resource.destroy();
            } catch (error) {
                failures.push(String(error?.message || error));
            }
        }
        for (const resource of [material, mesh]) {
            try {
                resource?.destroy();
            } catch (error) {
                failures.push(String(error?.message || error));
            }
        }
        disposed = true;
        if (failures.length) throw new Error(`Compute resource disposal failed: ${failures.join('; ')}`);
    }

    try {
        const binding = new g.DescriptorSetLayoutBinding(
            0,
            g.DescriptorType.STORAGE_BUFFER,
            1,
            g.ShaderStageFlagBit.COMPUTE,
            g.MemoryAccessBit.READ_WRITE,
        );
        const setLayout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([binding])));
        const pipelineLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([setLayout])));
        const shader = own(
            device.createShader(
                new g.ShaderInfo('runtime-interop-compute-values', [
                    new g.ShaderStage(
                        g.ShaderStageFlagBit.COMPUTE,
                        `layout(local_size_x=1,local_size_y=1,local_size_z=1) in;
layout(set=0,binding=0,std430) buffer Values { uint data[]; } values;
void main() {
    uint index = gl_GlobalInvocationID.x;
    if (index < 16u) values.data[index + 1u] = (index + 3u) * (index + 5u) + values.data[0];
}`,
                    ),
                ]),
            ),
        );
        const info = new g.PipelineStateInfo();
        info.shader = shader;
        info.pipelineLayout = pipelineLayout;
        info.bindPoint = g.PipelineBindPoint.COMPUTE;
        pipeline = own(device.createPipelineState(info));
        values = own(
            device.createBuffer(
                new g.BufferInfo(
                    g.BufferUsageBit.STORAGE | g.BufferUsageBit.TRANSFER_SRC | g.BufferUsageBit.TRANSFER_DST,
                    g.MemoryUsageBit.DEVICE,
                    (VALUE_COUNT + 1) * 4,
                    4,
                ),
            ),
        );
        argumentsBuffer = own(
            device.createBuffer(
                new g.BufferInfo(
                    g.BufferUsageBit.INDIRECT | g.BufferUsageBit.TRANSFER_SRC | g.BufferUsageBit.TRANSFER_DST,
                    g.MemoryUsageBit.DEVICE,
                    INDIRECT_WORDS.length * 4,
                    4,
                ),
            ),
        );
        descriptor = own(device.createDescriptorSet(new g.DescriptorSetInfo(setLayout)));
        descriptor.bindBuffer(0, values);
        descriptor.update();
        command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        directReceipt = await dispatchAndRead(11, false);

        cameraNode.setPosition(0, 0, 4);
        cameraNode.lookAt(new air.Vec3(0, 0, 0));
        camera.projection = air.Camera.ProjectionType.PERSPECTIVE;
        camera.fov = 45;
        camera.near = 0.1;
        camera.far = 100;
        camera.clearFlags = air.Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new air.Color(20, 40, 80, 255);
        const cube = new air.Node('Computed value visualization');
        cube.layer = air.Layers.Enum.DEFAULT;
        cube.setRotationFromEuler(15, 25, 0);
        scene.addChild(cube);
        material = new air.Material();
        material.initialize({ effectName: 'builtin-unlit' });
        materialColor = [224 + (directReceipt.actual[1] % 32), 32, 32, 255];
        material.setProperty('mainColor', new air.Color(...materialColor));
        mesh = air.utils.createMesh(air.primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
        const renderer = cube.addComponent(air.MeshRenderer);
        renderer.mesh = mesh;
        renderer.material = material;

        return {
            initialSteps: 3,
            advanceSteps: 3,
            inspect() {
                return {
                    path: 'compute-readback-material',
                    visualization: 'Cocos GFX compute -> GPU readback -> CPU material color update',
                    direct: directReceipt,
                    indirect: indirectReceipt ?? null,
                    materialColor: materialColor.slice(),
                    disposed,
                };
            },
            async advance() {
                requireCondition(!indirectReceipt, 'Compute scenario advanced more than once');
                indirectReceipt = await dispatchAndRead(47, true);
                materialColor = [32, 224 + (indirectReceipt.actual[1] % 32), 32, 255];
                material.setProperty('mainColor', new air.Color(...materialColor));
            },
            verify(before, after) {
                requireWords(before.direct.actual, expectedWords(11, VALUE_COUNT), 'Before direct receipt');
                requireCondition(before.indirect === null, 'Indirect compute ran before the controlled advance');
                requireCondition(after.indirect?.mode === 'indirect', 'Controlled advance did not dispatch indirectly');
                requireWords(after.indirect.actual, expectedWords(47, INDIRECT_WORDS[1]), 'After indirect receipt');
                requireWords(after.indirect.argumentReadback, INDIRECT_WORDS, 'After indirect arguments');
                requireCondition(after.indirect.indirectOffsetBytes === 4, 'Indirect byte offset changed');
                requireCondition(
                    before.materialColor[0] > before.materialColor[1] + 100 &&
                        after.materialColor[1] > after.materialColor[0] + 100,
                    'GPU readback did not drive the red-to-green material transition',
                );
            },
            dispose,
            resources: () => [
                { name: 'compute-visualization-mesh', valid: mesh?.isValid ?? false },
                { name: 'compute-visualization-material', valid: material?.isValid ?? false },
            ],
        };
    } catch (error) {
        try {
            await dispose();
        } catch (cleanupError) {
            throw new Error(`${error?.message || error}; ${cleanupError?.message || cleanupError}`);
        }
        throw error;
    }
}
