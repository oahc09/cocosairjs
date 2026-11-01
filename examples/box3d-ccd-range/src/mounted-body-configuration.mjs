/** Mount/configure ordering only; uses the supplied real public app/body APIs in the live example. */
export function mountAndConfigureBodies({ app, scene, system, projectile, target, config, vector }) {
    // AirApp.run -> director.runSceneImmediate synchronously activates components/onLoad.
    // useCCD is NOT a cached pre-onLoad property. Neither are velocity methods.
    app.run(scene);
    system.enable = true;
    target.body.useCCD = config.target === 'bullet-target';
    projectile.body.useCCD = config.bullet;
    const targetBullet = target.body.useCCD;
    const projectileBullet = projectile.body.useCCD;
    if (targetBullet !== (config.target === 'bullet-target') || projectileBullet !== config.bullet)
        throw new Error('Mounted public useCCD readback does not match requested configuration');
    projectile.body.setLinearVelocity(vector(config.speed, 0, 0));
    if (config.target !== 'wall') target.body.setLinearVelocity(vector(-1, 0, 0));
    return Object.freeze({ targetBullet, projectileBullet });
}
