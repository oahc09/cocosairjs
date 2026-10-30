/* Browser-only acceptance against real Cocos components and the pinned native module. */
export async function run(lab) {
    const { air, physics, clock, spawn, container } = lab;
    const rows = [];
    const check = (name, pass, data) => {
        rows.push({ name, pass: !!pass, data });
        if (!pass) throw Error(`${name}: ${JSON.stringify(data)}`);
    };
    clock.begin();
    physics.autoSimulation = true;
    const frames = async (count) => {
        for (let i = 0; i < count; i++) await clock.step(1 / 60);
    };
    const clear = async () => {
        lab.clear();
        await frames(2);
        physics.gravity = new air.Vec2(0, -320);
    };
    try {
        let lateRejected = false;
        try {
            air.selectPhysics2DBackend('box2d');
        } catch (error) {
            lateRejected = String(error).includes('LATE_SELECTION');
        }
        check('late backend selection is rejected', lateRejected, {});
        let conflictRejected = false;
        try {
            await air.loadBox2D3({ assetBaseUrl: '/conflicting-box2d/' });
        } catch (error) {
            conflictRejected = String(error).includes('CONFIG_CONFLICT');
        }
        check('conflicting module configuration is rejected', conflictRejected, {});
        await clear();
        const floor = spawn('floor', 640, 100, air.ERigidBody2DType.Static);
        const box = spawn('box', 500, 340);
        const circle = spawn('circle', 640, 340);
        const polygon = spawn('polygon', 780, 340);
        let worldManifold;
        let begin = 0,
            post = 0,
            impulse = 0,
            ended = 0;
        let callbackQueries = 0,
            finalSleepPosts = 0;
        const queryDuringContact = () => {
            const point = physics.testPoint(new air.Vec2(640, 100));
            const area = physics.testAABB(new air.Rect(630, 90, 20, 20));
            const ray = physics.raycast(new air.Vec2(640, 50), new air.Vec2(640, 150), air.ERaycast2DType.All, 1);
            if (
                !point.includes(floor.collider) ||
                !area.includes(floor.collider) ||
                !ray.some((hit) => hit.collider === floor.collider)
            )
                throw Error('query inside contact lost floor');
            callbackQueries++;
        };
        box.collider.on(air.Contact2DType.BEGIN_CONTACT, () => {
            begin++;
            queryDuringContact();
        });
        box.collider.on(air.Contact2DType.PRE_SOLVE, queryDuringContact);
        box.collider.on(air.Contact2DType.END_CONTACT, () => ended++);
        box.collider.on(air.Contact2DType.POST_SOLVE, (_a, _b, c) => {
            post++;
            if (box.body.impl.isSleeping) finalSleepPosts++;
            impulse = Math.max(impulse, ...(c.getImpulse()?.normalImpulses ?? [0]));
            worldManifold = c.getWorldManifold();
        });
        const initialY = box.node.worldPosition.y;
        await frames(180);
        check(
            'three collider types fall and settle on ground',
            [box, circle, polygon].every((b) => b.node.worldPosition.y > 120 && b.node.worldPosition.y < 155),
            [box, circle, polygon].map((b) => b.node.worldPosition.y),
        );
        check(
            'begin and post-solve expose physical impulses',
            begin > 0 && post > 0 && impulse > 0 && initialY - box.node.worldPosition.y > 150,
            { begin, post, impulse },
        );
        check('BEGIN/PRE spatial queries preserve the running world', callbackQueries > begin && begin > 0, {
            callbackQueries,
            begin,
        });
        check(
            'last solved tick is delivered even when body falls asleep',
            box.body.impl.isSleeping && finalSleepPosts === 1,
            { sleeping: box.body.impl.isSleeping, finalSleepPosts },
        );
        const sleepingPost = post,
            sleepingEnd = ended;
        const stable = box.node.worldPosition.y;
        check(
            'world manifold matches the actual ground surface',
            worldManifold?.points.length > 0 &&
                Math.abs(worldManifold.normal.y) > 0.9 &&
                worldManifold.points.every((p) => Math.abs(p.y - 112) < 3),
            worldManifold,
        );
        await frames(30);
        check(
            'sleeping contacts do not replay POST_SOLVE or synthesize END',
            post === sleepingPost && ended === sleepingEnd,
            {
                sleepingPost,
                post,
                ended,
            },
        );
        check('rest remains stable', Math.abs(stable - box.node.worldPosition.y) < 0.1, {
            stable,
            y: box.node.worldPosition.y,
        });
        check(
            'point query returns real collider',
            physics.testPoint(new air.Vec2(500, box.node.worldPosition.y)).includes(box.collider),
            {},
        );
        const ray = physics.raycast(new air.Vec2(500, 500), new air.Vec2(500, 50), air.ERaycast2DType.All, 0xffffffff);
        check(
            'raycast reports physical point/normal/fraction',
            ray.some(
                (r) => r.collider === box.collider && r.fraction > 0 && r.fraction < 1 && Math.abs(r.normal.y) > 0.9,
            ),
            ray.map((r) => ({ name: r.collider.node.name, point: r.point, fraction: r.fraction })),
        );
        const aabb = physics.testAABB(new air.Rect(470, 110, 60, 60));
        check(
            'AABB query returns real collider',
            aabb.includes(box.collider),
            aabb.map((c) => c.node.name),
        );
        box.body.wakeUp();
        await frames(1);
        check('waking a retained contact resumes POST_SOLVE', post > sleepingPost, { sleepingPost, post });
        box.node.setWorldPosition(500, 420, 0);
        await frames(2);
        check(
            'Node transform updates physics and ends old contact',
            box.node.worldPosition.y > 410 && ended > sleepingEnd,
            {
                y: box.node.worldPosition.y,
                ended,
            },
        );
        box.body.gravityScale = 0;
        box.body.linearVelocity = new air.Vec2(2, 0);
        const x = box.node.worldPosition.x;
        await frames(30);
        check('velocity units remain meters per second', Math.abs(box.node.worldPosition.x - x - 32) < 2, {
            x,
            after: box.node.worldPosition.x,
        });
        box.body.linearVelocity = new air.Vec2();
        box.body.fixedRotation = true;
        box.body.applyAngularImpulse(5, true);
        await frames(15);
        check('motion lock preserves fixedRotation', Math.abs(box.node.eulerAngles.z) < 0.01, box.node.eulerAngles.z);
        box.body.fixedRotation = false;
        box.body.angularVelocity = 1;
        await frames(15);
        check('angular velocity rotates the Cocos Node', Math.abs(box.node.eulerAngles.z) > 10, box.node.eulerAngles.z);
        const local = new air.Vec2(12, 7),
            point = box.body.getWorldPoint(local, new air.Vec2()),
            back = box.body.getLocalPoint(point, new air.Vec2());
        check('local/world coordinate conversion roundtrip', air.Vec2.distance(local, back) < 0.001, {
            local,
            point,
            back,
        });
        box.body.angularVelocity = 0;
        box.body.linearVelocity = new air.Vec2();
        const before = box.body.getMass();
        box.body.applyLinearImpulseToCenter(new air.Vec2(1, 0), true);
        await frames(2);
        check('impulse uses real mass', before > 0 && box.body.linearVelocity.x > 0, {
            mass: before,
            velocity: box.body.linearVelocity.x,
        });
        const width = box.collider.worldAABB.width;
        box.node.setScale(-2, 1, 1);
        await frames(2);
        const scaledPoints = box.collider.worldPoints;
        const expectedWidth = Math.max(...scaledPoints.map((p) => p.x)) - Math.min(...scaledPoints.map((p) => p.x));
        const expandedPoint = box.body.getWorldPoint(new air.Vec2(35, 0), new air.Vec2());
        check(
            'negative scale rebuilds collider geometry',
            box.collider.worldAABB.width > width + 25 &&
                Math.abs(box.collider.worldAABB.width - expectedWidth) < 0.1 &&
                physics.testPoint(expandedPoint).includes(box.collider),
            {
                width,
                expectedWidth,
                after: box.collider.worldAABB.width,
            },
        );
        box.node.active = false;
        await frames(2);
        check(
            'disabled body removed from queries',
            !physics.testPoint(new air.Vec2(box.node.worldPosition.x, box.node.worldPosition.y)).includes(box.collider),
            {},
        );
        box.node.active = true;
        await frames(2);
        box.body.sleep();
        await frames(2);
        check('sleep/wake maps to native state', box.body.impl.isSleeping, { sleeping: box.body.impl.isSleeping });
        box.body.wakeUp();
        check('wake is effective', box.body.impl.isAwake, {});

        await clear();
        const sensor = spawn('box', 640, 250, air.ERigidBody2DType.Static);
        sensor.collider.sensor = true;
        sensor.collider.apply();
        const ball = spawn('circle', 640, 420);
        let entered = 0,
            left = 0;
        sensor.collider.on(air.Contact2DType.BEGIN_CONTACT, () => entered++);
        sensor.collider.on(air.Contact2DType.END_CONTACT, () => left++);
        await frames(100);
        check(
            'sensor begins and ends without blocking motion',
            entered > 0 && left > 0 && ball.node.worldPosition.y < 180,
            { entered, left, y: ball.node.worldPosition.y },
        );

        await clear();
        const queryOnly = spawn('polygon', 640, 250, air.ERigidBody2DType.Static);
        queryOnly.collider.group = 2;
        queryOnly.collider.sensor = true;
        queryOnly.collider.apply();
        for (const mask of [2, 0]) {
            physics.collisionMatrix[2] = mask;
            await frames(2);
            const p = new air.Vec2(630, 240);
            const area = physics.testAABB(new air.Rect(610, 220, 60, 60));
            const start = new air.Vec2(600, 240),
                end = new air.Vec2(680, 240);
            const all = physics.raycast(start, end, air.ERaycast2DType.All, 2);
            const closest = physics.raycast(start, end, air.ERaycast2DType.AllClosest, 2);
            check(
                `query ignores collider collision mask ${mask}, including sensors`,
                physics.testPoint(p).includes(queryOnly.collider) &&
                    area.filter((c) => c === queryOnly.collider).length === 1 &&
                    all.length > 1 &&
                    all.every((r) => r.collider === queryOnly.collider && r.fixtureIndex >= 0) &&
                    new Set(all.map((r) => r.fixtureIndex)).size === all.length &&
                    closest.length === 1 &&
                    closest[0].fraction === Math.min(...all.map((r) => r.fraction)) &&
                    physics.raycast(start, end, air.ERaycast2DType.All, 1).length === 0 &&
                    physics.raycast(start, end, air.ERaycast2DType.All, 0).length === 0,
                {
                    mask,
                    all: all.map((r) => ({ fixtureIndex: r.fixtureIndex, fraction: r.fraction })),
                    closest: closest.map((r) => ({ fixtureIndex: r.fixtureIndex, fraction: r.fraction })),
                },
            );
        }
        queryOnly.node.active = false;
        await frames(2);
        check(
            'mask-independent queries still exclude disabled bodies',
            physics.testPoint(new air.Vec2(630, 240)).length === 0 &&
                physics.testAABB(new air.Rect(610, 220, 60, 60)).length === 0 &&
                physics.raycast(new air.Vec2(600, 240), new air.Vec2(680, 240), air.ERaycast2DType.All, 2).length === 0,
            {},
        );
        physics.collisionMatrix[2] = 0xffffffff;

        await clear();
        const filteredFloor = spawn('floor', 640, 100, air.ERigidBody2DType.Static),
            filtered = spawn('box', 640, 250);
        physics.collisionMatrix[2] = 0;
        filtered.collider.group = 2;
        await frames(90);
        check('collision matrix changes physical filtering', filtered.node.worldPosition.y < 80, {
            y: filtered.node.worldPosition.y,
        });
        physics.collisionMatrix[2] = 0xffffffff;

        await clear();
        spawn('floor', 640, 100, air.ERigidBody2DType.Static);
        const once = spawn('box', 500, 250);
        let skippedOnce = 0,
            solvedLater = 0;
        once.collider.on(air.Contact2DType.PRE_SOLVE, (_a, _b, c) => {
            if (skippedOnce === 0) {
                c.disabledOnce = true;
                skippedOnce++;
            }
        });
        once.collider.on(air.Contact2DType.POST_SOLVE, () => solvedLater++);
        await frames(120);
        check(
            'disabledOnce affects one tick and allows later solving',
            skippedOnce === 1 && solvedLater > 0 && once.node.worldPosition.y > 120,
            { skippedOnce, solvedLater, y: once.node.worldPosition.y },
        );
        const passThrough = spawn('box', 640, 250);
        let disabled = 0;
        passThrough.collider.on(air.Contact2DType.BEGIN_CONTACT, (_a, _b, c) => {
            c.disabled = true;
            disabled++;
        });
        await frames(100);
        check('disabled contact skips the solver', disabled > 0 && passThrough.node.worldPosition.y < 80, {
            disabled,
            y: passThrough.node.worldPosition.y,
        });

        await clear();
        spawn('floor', 640, 100, air.ERigidBody2DType.Static);
        const belt = spawn('box', 640, 250);
        let material = 0;
        belt.collider.on(air.Contact2DType.PRE_SOLVE, (_a, _b, c) => {
            c.setFriction(1);
            c.setRestitution(0);
            c.setTangentSpeed(3);
            material++;
        });
        await frames(140);
        check(
            'per-contact material shim moves body on conveyor',
            material > 0 && Math.abs(belt.node.worldPosition.x - 640) > 35,
            { material, x: belt.node.worldPosition.x, y: belt.node.worldPosition.y },
        );

        await clear();
        spawn('floor', 640, 100, air.ERigidBody2DType.Static);
        const bounce = spawn('circle', 640, 280);
        let hit = false,
            maxAfter = 0;
        bounce.collider.on(air.Contact2DType.PRE_SOLVE, (_a, _b, c) => {
            c.setRestitution(1);
            hit = true;
        });
        for (let i = 0; i < 110; i++) {
            await frames(1);
            if (hit) maxAfter = Math.max(maxAfter, bounce.node.worldPosition.y);
        }
        check('per-contact restitution changes bounce height', hit && maxAfter > 210, { hit, maxAfter });

        await clear();
        physics.gravity = new air.Vec2();
        const parent = new air.Node('Transformed parent');
        parent.setPosition(300, 200);
        parent.angle = 25;
        container.addChild(parent);
        const child = spawn('box', 60, 70, air.ERigidBody2DType.Dynamic, parent);
        await frames(2);
        child.body.linearVelocity = new air.Vec2(1, 0);
        const start = child.node.worldPosition.x;
        await frames(30);
        check('parented Node synchronizes in world space', Math.abs(child.node.worldPosition.x - start - 16) < 1, {
            start,
            x: child.node.worldPosition.x,
        });
        const animated = spawn('box', 850, 450, air.ERigidBody2DType.Animated);
        await frames(2);
        animated.node.setPosition(900, 450);
        await frames(2);
        check(
            'Animated body reaches scene target through velocity',
            Math.abs(animated.node.worldPosition.x - 900) < 0.01 &&
                physics.testPoint(new air.Vec2(900, 450)).includes(animated.collider),
            { x: animated.node.worldPosition.x },
        );
        animated.body.type = air.ERigidBody2DType.Dynamic;
        animated.body.gravityScale = 0;
        animated.body.linearVelocity = new air.Vec2(1, 0);
        await frames(30);
        check('Animated to Dynamic transition releases its former target', animated.node.worldPosition.x > 914, {
            x: animated.node.worldPosition.x,
        });

        await clear();
        spawn('floor', 640, 100, air.ERigidBody2DType.Static);
        const changed = spawn('box', 640, 250);
        let created;
        changed.collider.on(air.Contact2DType.PRE_SOLVE, () => {
            if (created) return;
            changed.body.enabled = false;
            physics.collisionMatrix[4] = 0;
            changed.collider.group = 4;
            created = spawn('circle', 800, 400);
            created.body.gravityScale = 0;
        });
        await frames(100);
        check(
            'contact callback mutations flush once after native unlock',
            created &&
                !changed.body.impl.isActive() &&
                physics.testPoint(new air.Vec2(800, 400)).includes(created.collider),
            { created: !!created, active: changed.body.impl.isActive(), stats: lab.stats() },
        );
        changed.body.enabled = true;
        await frames(2);
        check('body can reactivate after callback disable', changed.body.impl.isActive(), {});
        await frames(70);
        check('contact callback filter changes take physical effect', changed.node.worldPosition.y < 50, {
            y: changed.node.worldPosition.y,
        });
        physics.collisionMatrix[4] = 0xffffffff;

        await clear();
        const baseline = lab.stats();
        const zeroNode = new air.Node('Bodyless zero-scale collider');
        zeroNode.setPosition(640, 360, 0);
        zeroNode.setScale(0, 0, 1);
        container.addChild(zeroNode);
        const zeroCollider = zeroNode.addComponent(air.BoxCollider2D);
        const scaleShapes = [];
        for (const scale of [0, 1, 0, 1]) {
            zeroNode.setScale(scale, scale, 1);
            await frames(2);
            scaleShapes.push(lab.stats().shapes - baseline.shapes);
        }
        check(
            'bodyless collider restores native shape and queries after zero scale',
            scaleShapes.join(',') === '0,1,0,1' && physics.testPoint(new air.Vec2(640, 360)).includes(zeroCollider),
            { scaleShapes },
        );
        zeroCollider.enabled = false;
        await frames(2);
        check(
            'disabling a recovered collider releases its private body and shape',
            lab.stats().bodies === baseline.bodies && lab.stats().shapes === baseline.shapes,
            { baseline, after: lab.stats() },
        );

        await clear();
        physics.gravity = new air.Vec2();
        spawn('floor', 640, 100, air.ERigidBody2DType.Static);
        const rebuilt = spawn('box', 640, 132);
        let rebuildBegins = 0,
            rebuildEnds = 0;
        rebuilt.collider.on(air.Contact2DType.BEGIN_CONTACT, () => rebuildBegins++);
        rebuilt.collider.on(air.Contact2DType.END_CONTACT, () => {
            if (rebuildEnds++ === 0) rebuilt.collider.apply();
        });
        await frames(2);
        check('reentrant rebuild fixture has a real contact', rebuildBegins > 0, { rebuildBegins });
        rebuilt.collider.apply();
        check(
            'END callback can rebuild its collider without adding native shapes',
            rebuildEnds === 1 && lab.stats().shapes === 2,
            { rebuildEnds, stats: lab.stats() },
        );
        rebuilt.collider.enabled = false;
        await frames(2);
        check(
            'disabling a reentrantly rebuilt collider leaves only the floor',
            lab.stats().shapes === 1 && !physics.testPoint(new air.Vec2(640, 132)).includes(rebuilt.collider),
            { stats: lab.stats() },
        );

        await clear();
        const kinds = [
            ['DistanceJoint2D', 'maxLength', 100],
            ['SpringJoint2D', 'distance', 100],
            ['FixedJoint2D', 'frequency', 0],
            ['RelativeJoint2D', 'maxForce', 10000],
            ['SliderJoint2D', 'enableLimit', true],
            ['WheelJoint2D', 'frequency', 5],
            ['HingeJoint2D', 'enableLimit', true],
        ];
        for (const [name, property, value] of kinds) {
            await clear();
            physics.gravity = new air.Vec2(0, -320);
            const anchor = spawn('box', 640, 430, air.ERigidBody2DType.Static),
                body = spawn('box', 640, 330);
            const j = body.node.addComponent(air[name]);
            j.connectedBody = anchor.body;
            j[property] = value;
            if (name === 'SpringJoint2D') j.frequency = 0;
            if (name === 'SliderJoint2D') {
                j.angle = 90;
                j.lowerLimit = -100;
                j.upperLimit = 100;
            }
            if (name === 'WheelJoint2D') j.angle = 90;
            if (name === 'HingeJoint2D') {
                j.lowerAngle = -20;
                j.upperAngle = 20;
            }
            if (name === 'RelativeJoint2D') j.linearOffset = new air.Vec2(0, 100);
            await frames(120);
            const state = lab.stats();
            if (name === 'SpringJoint2D')
                check(
                    'zero-frequency spring retains a rigid distance constraint',
                    Math.abs(body.node.worldPosition.y - anchor.node.worldPosition.y + 100) < 1,
                    { y: body.node.worldPosition.y, anchor: anchor.node.worldPosition.y },
                );
            check(
                `${name} constrains real body`,
                !!j.impl.impl &&
                    state.joints === 1 &&
                    Number.isFinite(body.node.worldPosition.y) &&
                    body.node.worldPosition.y > 200,
                { y: body.node.worldPosition.y, stats: state },
            );
            j.enabled = false;
            await frames(2);
            const y = body.node.worldPosition.y;
            await frames(35);
            check(
                `${name} disable releases constraint`,
                lab.stats().joints === 0 && body.node.worldPosition.y < y - 30,
                { before: y, y: body.node.worldPosition.y },
            );
        }
        await clear();
        physics.gravity = new air.Vec2();
        const drag = spawn('box', 640, 360);
        await frames(2);
        lab.drag = drag;
        check(
            'scene release removes owned bodies/shapes/joints',
            lab.stats().bodies === 3 && lab.stats().shapes === 1,
            { stats: lab.stats() },
        );
        return { rows, drag: { x: drag.node.worldPosition.x, y: drag.node.worldPosition.y } };
    } catch (error) {
        error.acceptanceRows = rows;
        throw error;
    } finally {
        clock.end();
    }
}
