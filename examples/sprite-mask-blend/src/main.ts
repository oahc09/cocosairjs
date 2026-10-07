import { bootCapabilityLab } from '../../shared/capability-lab.js';

const lab = await bootCapabilityLab('Sprite mask and blend');
const { createAirTextureSprite, attachAirSpriteMask, createAirUIBlendScope, Color, ParticleSystem2D } = lab.cc;
const white = lab.texture(1, 1, [255, 255, 255, 255]),
    maskTexture = lab.texture(4, 1, [255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 128, 255, 0, 0, 0]);
const display = createAirTextureSprite(lab.ui, white, { name: 'Masked sprite', size: [256, 256] });
let binding: ReturnType<typeof attachAirSpriteMask> | null = null;
async function mask(channel: 'red' | 'alpha', mode: 'soft' | 'threshold' = 'soft', inverted = false) {
    binding?.dispose();
    binding = attachAirSpriteMask(display.sprite, maskTexture, { channel, mode, inverted, threshold: 0.6 });
    await lab.clock.step();
}
lab.button('alpha', () => mask('alpha'));
lab.button('red', () => mask('red'));
lab.button('threshold', () => mask('alpha', 'threshold'));
lab.button('invert', () => mask('alpha', 'soft', true));
const particleNode = lab.node('Particles'),
    particles = particleNode.addComponent(ParticleSystem2D);
particles.spriteFrame = display.frame;
particles.totalParticles = 1;
particles.emissionRate = 60;
particles.life = 10;
particles.lifeVar = 0;
particles.startSize = particles.endSize = 160;
particles.startSizeVar = particles.endSizeVar = 0;
particles.speed = particles.speedVar = 0;
particles.gravity.set(0, 0);
particles.posVar.set(0, 0);
particles.tangentialAccel = particles.tangentialAccelVar = particles.radialAccel = particles.radialAccelVar = 0;
particles.startColor = particles.endColor = new Color(200, 0, 0, 128);
particles.startColorVar = particles.endColorVar = new Color(0, 0, 0, 0);
particleNode.active = false;
const blend = createAirUIBlendScope(particleNode, 'normal');
async function particleView(mode: 'normal' | 'add') {
    display.node.active = false;
    particleNode.active = true;
    lab.camera.clearColor = new Color(0, 0, 80, 255);
    particles.resetSystem();
    await lab.clock.step();
    blend.set(particleNode, mode);
    for (let i = 0; i < 3; i++) await lab.clock.step();
}
lab.button('normal', () => particleView('normal'));
lab.button('add', () => particleView('add'));
async function maskView() {
    particleNode.active = false;
    display.node.active = true;
    lab.camera.clearColor = new Color(0, 0, 0, 255);
    await mask('alpha');
}
for (const id of ['alpha', 'red', 'threshold', 'invert'])
    document.getElementById(id)!.addEventListener('click', () => {
        particleNode.active = false;
        display.node.active = true;
        lab.camera.clearColor = new Color(0, 0, 0, 255);
    });
await maskView();
let disposed = false;
lab.expose({
    async test() {
        if (disposed) throw new Error('example disposed');
        await maskView();
        lab.check(
            lab.pixel(0.125)[0] > 245 && Math.abs(lab.pixel(0.625)[0] - 128) < 6 && lab.pixel(0.875)[0] < 5,
            'alpha soft visibility',
        );
        await mask('red');
        lab.check(lab.pixel(0.375)[0] < 5 && lab.pixel(0.875)[0] > 245, 'red channel selects different region');
        await mask('alpha', 'threshold');
        lab.check(lab.pixel(0.625)[0] < 5, 'alpha threshold is binary');
        await mask('alpha', 'soft', true);
        lab.check(lab.pixel(0.125)[0] < 5 && lab.pixel(0.875)[0] > 245, 'inverted soft mask');
        await particleView('add');
        const add = lab.pixel(0.5);
        await particleView('normal');
        const normal = lab.pixel(0.5);
        lab.check(
            add[0] > 80 && Math.abs(add[2] - 80) < 6 && Math.abs(normal[2] - 40) < 6,
            'particle blend changes actual pixels',
            { add, normal },
        );
        await maskView();
        return { add, normal };
    },
    async dispose() {
        if (!disposed) {
            disposed = true;
            binding?.dispose();
            blend.dispose();
            particleNode.destroy();
            display.dispose();
            maskTexture.destroy();
            white.destroy();
            await lab.clock.step();
        }
        return { maskReleased: !maskTexture.isValid, textureReleased: !white.isValid };
    },
});
