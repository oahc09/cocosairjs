/* A manual AFTER_DRAW is not a browser presentation boundary. Keep simulation
 * paused while two animation frames give the browser presentation opportunities.
 * This is a bounded barrier, not a pixel retry or a GPU completion guarantee. */
function waitForPresentation(timeoutMs) {
    return new Promise((resolve, reject) => {
        let frame;
        let timer;
        const readState = () => {
            const lab = window.box2d3Lab;
            const body = lab.drag.node.worldPosition;
            return {
                stepping: lab.clock.stepping,
                stepped: lab.clock.stepped,
                flags: lab.physics.debugDrawFlags,
                body: { x: body.x, y: body.y, z: body.z },
            };
        };
        const cleanup = () => {
            clearTimeout(timer);
            cancelAnimationFrame(frame);
        };
        const fail = (error) => {
            cleanup();
            reject(error);
        };
        let before;
        try {
            before = readState();
            if (!before.stepping) throw Error('Box2D presentation requires the paused manual clock');
        } catch (error) {
            fail(error);
            return;
        }
        timer = setTimeout(() => fail(Error('Box2D presentation frame budget exceeded')), timeoutMs);
        frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
                try {
                    const after = readState();
                    if (JSON.stringify(after) !== JSON.stringify(before)) {
                        throw Error('Box2D state changed while awaiting presentation');
                    }
                    cleanup();
                    resolve({ before, after, presentationFrames: 2 });
                } catch (error) {
                    fail(error);
                }
            });
        });
    });
}

async function capturePresentedFrame(page, options) {
    const observation = await page.evaluate(waitForPresentation, 2000);
    await page.screenshot(options);
    return observation;
}

module.exports = { waitForPresentation, capturePresentedFrame };
