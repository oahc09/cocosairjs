/* Source/CPU geometry checks only. No native, public engine, browser or formal Gate proof. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const example = path.join(root, 'examples/box3d-rigidbody-playground');
const filename = path.join(example, 'src/hull-geometry.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
});
assert.equal(compiled.diagnostics.length, 0);
const scope = { exports: {} };
vm.runInNewContext(compiled.outputText, { module: scope, exports: scope.exports, Object, Math });
const { HULL_VERTICES: vertices, hullMeshGeometry: geometry, hullMinimumOffsetY: minY } = scope.exports;
const main = fs.readFileSync(path.join(example, 'src/main.ts'), 'utf8');
const html = fs.readFileSync(path.join(example, 'index.html'), 'utf8');
const requirements = JSON.parse(fs.readFileSync(path.join(example, 'original-requirements.json'), 'utf8'));
let checks = 0;
function check(name, fn) {
    fn();
    checks++;
    console.log('PASS_SOURCE_CPU: ' + name);
}
check('centered tetrahedron has four distinct, non-box vertices', () => {
    assert.equal(vertices.length, 4);
    assert.equal(new Set(vertices.map((p) => p.join(','))).size, 4);
    for (let i = 0; i < 3; ++i)
        assert.equal(
            vertices.reduce((s, p) => s + p[i], 0),
            0,
        );
    assert.ok(Object.isFrozen(vertices) && vertices.every(Object.isFrozen));
});
check('visible triangles contain exact hull points with outward normals', () => {
    const g = geometry();
    assert.equal(g.positions.length, 36);
    assert.equal(g.normals.length, 36);
    assert.equal(g.indices.length, 12);
    const allowed = new Set(vertices.map((p) => p.join(',')));
    for (let i = 0; i < g.positions.length; i += 3) {
        const p = g.positions.slice(i, i + 3),
            n = g.normals.slice(i, i + 3);
        assert.ok(allowed.has(p.join(',')));
        assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-12);
        assert.ok(p.reduce((s, v, j) => s + v * n[j], 0) > 0);
    }
    assert.deepEqual(
        Array.from(g.indices),
        Array.from({ length: 12 }, (_, i) => i),
    );
});
check('height observation equals minimum explicitly quaternion-transformed vertex', () => {
    for (let i = 0; i <= 180; ++i) {
        const angle = (i * Math.PI) / 180;
        const q = {
            x: Math.sin(angle / 2) / Math.sqrt(14),
            y: (2 * Math.sin(angle / 2)) / Math.sqrt(14),
            z: (3 * Math.sin(angle / 2)) / Math.sqrt(14),
            w: Math.cos(angle / 2),
        };
        const heights = vertices.map(([x, y, z]) => {
            const tx = 2 * (q.y * z - q.z * y),
                ty = 2 * (q.z * x - q.x * z),
                tz = 2 * (q.x * y - q.y * x);
            return y + q.w * ty + q.z * tx - q.x * tz;
        });
        assert.ok(Math.abs(minY(q) - Math.min(...heights)) < 1e-12);
    }
});
check('real public MeshCollider consumes the same visible mesh, without primitive substitution', () => {
    assert.match(main, /hullMesh = utils\.createMesh\(hullMeshGeometry\(\)\)/);
    assert.match(
        main,
        /if \(kind === 'hull'\) \{\s*const collider = node\.addComponent\(MeshCollider\);\s*collider\.convex = true;\s*collider\.mesh = hullMesh;/,
    );
    assert.match(main, /kind === 'hull' \? hullMesh/);
    assert.match(main, /entry\.kind === 'hull'\) return position\.y \+ hullMinimumOffsetY\(q\)/);
    assert.doesNotMatch(main, /setWorldPosition|setWorldRotation|setLinearVelocity|setAngularVelocity/);
    assert.match(html, /value="hull"/);
});
check('full original requirements remain visible and unqualified', () => {
    assert.ok(
        requirements.checks.some(
            (x) =>
                x.requirement === 'Hull' &&
                /new native-COM dragging candidate requires fresh matching verification/.test(x.source),
        ),
    );
    assert.ok(requirements.checks.some((x) => /100 add\/remove/.test(x.requirement)));
    assert.ok(requirements.checks.every((x) => x.acceptance === 'NOT_RUN'));
    assert.match(main, /Hull\/compound dragging: native-COM source candidate/);
});
console.log(
    JSON.stringify({
        status: 'PASS_LIMITED_SOURCE_CPU',
        checks,
        native: 'NOT_RUN',
        browser: 'NOT_RUN',
        formalGates: 'NOT_RUN',
    }),
);
