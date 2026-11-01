# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""Independent finite arithmetic review. Reads commands/geometry and actual outputs,
never producer expected/plan fields. Does not run or qualify AIR World transactions.
"""
from pathlib import Path
import sys, json, hashlib, math, datetime
root = Path.cwd()
out = Path(sys.argv[1])
if out.exists():
    raise RuntimeError('A new output directory is required')
out.mkdir(parents=True)
files = [root / ('tools/physics/box3d/output/command-wasm-' + mode + '-20261022-n4/command-samples.raw.jsonl') for mode in ['debug', 'release']]
sha = lambda b: hashlib.sha256(b).hexdigest()
raw = [p.read_bytes() for p in files]
assert raw[0] == raw[1], 'Finite cross-mode streams differ'
streams = [[json.loads(line) for line in data.splitlines()] for data in raw]
assert len(streams[0]) == len(streams[1]) == 217

def add(a, b): return [a[i] + b[i] for i in range(3)]
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def rotate(q, v):
    assert abs(sum(x*x for x in q)-1) < 1e-10
    t = [2*x for x in cross(q[:3], v)]
    return add(add(v, [q[3]*x for x in t]), cross(q[:3], t))
def inverse(q, v): return rotate([-q[0], -q[1], -q[2], q[3]], v)

rows = []
for mode, samples in zip(['Debug', 'Release'], streams):
    scenes = [x for x in samples if x['kind'] == 'analytic-box']
    assert len(scenes) == 32 and [x['scene'] for x in scenes] == list(range(32))
    for sample in scenes:
        f = sample['fixture']; m = f['mass']; hx,hy,hz = f['half']
        assert m > 0 and min(hx,hy,hz) > 0
        diagonal = [m*(hy*hy+hz*hz)/3, m*(hx*hx+hz*hz)/3, m*(hx*hx+hy*hy)/3]
        commands = sample['commands']; actuals = sample['result']['operations']
        assert [x['kind'] for x in commands] == ['clearState','reset','force','torque','linearImpulse','angularImpulse']
        assert len(actuals) == len(commands) == 6
        velocity = [0.,0.,0.]; angular = [0.,0.,0.]; force = [0.,0.,0.]; torque = [0.,0.,0.]
        q = None; position = None; checks = []
        def check(name, expected, observed):
            assert len(expected) == len(observed)
            errors = [abs(a-b) for a,b in zip(expected, observed)]
            assert all(math.isfinite(v) for v in [*expected,*observed])
            # Absolute 1e-5 covers finite float32 rounding, not a measured-fit tolerance.
            checks.append({'name':name,'expected':expected,'observed':observed,'maximumAbsoluteError':max(errors),'passed':max(errors)<=1e-5})
        def angular_response(moment):
            shape_local = inverse(f['shapeRotation'], inverse(q, moment))
            return rotate(q, rotate(f['shapeRotation'], [shape_local[i]/diagonal[i] for i in range(3)]))
        for command, observed in zip(commands, actuals):
            assert command['kind'] == observed['kind'] and command['sequence'] == observed['sequence']
            kind = command['kind']; value = command.get('value')
            if kind == 'reset':
                position = command['pose']['position']; q = command['pose']['rotation']
            elif kind not in ['clearState']:
                assert command['space'] == 'local' and q is not None
                world = rotate(q, value)
                if kind == 'force':
                    force = add(force, world); torque = add(torque, cross(rotate(q, command['offset']), world))
                elif kind == 'torque': torque = add(torque, world)
                elif kind == 'linearImpulse':
                    velocity = add(velocity, [v/m for v in world]); angular = add(angular, angular_response(cross(rotate(q, command['offset']), world)))
                elif kind == 'angularImpulse': angular = add(angular, angular_response(world))
                else: raise AssertionError(kind)
            actual = observed['actual']
            for name, expected in [('linearVelocity',velocity),('angularVelocity',angular),('force',force),('torque',torque)]:check(kind+'.'+name, expected, actual[name])
            if q is not None:
                check(kind+'.position',position,actual['pose']['position']);check(kind+'.rotation',q,actual['pose']['rotation']);check(kind+'.worldCenter',add(position,rotate(q,f['center'])),actual['worldCenter'])
        final = sample['result']['bodies'][0]['actual']; state = final['state']
        for name, expected in [('linearVelocity',velocity),('angularVelocity',angular),('force',force),('torque',torque)]:check('final.'+name, expected, state[name])
        rows.append({'mode':mode,'scene':sample['scene'],'checks':checks,'maximumAbsoluteError':max(c['maximumAbsoluteError'] for c in checks),'passed':all(c['passed']for c in checks)})
receipt = {'status':'PASS_FINITE_INDEPENDENT_COMMAND_ARITHMETIC' if all(r['passed']for r in rows) else 'FAIL_RETAINED','timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewerSha256':sha(Path(__file__).read_bytes()),'inputs':[{'path':str(p.relative_to(root)),'bytes':len(b),'sha256':sha(b)}for p,b in zip(files,raw)],'crossModeIdenticalRawSamples':217,'scenesPerMode':32,'checkedVectors':sum(len(r['checks'])for r in rows),'maximumAbsoluteError':max(r['maximumAbsoluteError']for r in rows),'scope':'Independent Python scalar quaternion, center, force moment, linear impulse and rotated box COM inertia calculations, 6 immediate commands per scene. No imports from fixture, native planner or AIR; producer expected/plan fields are never consumed. Not an integration trajectory or unified World transaction qualification.','rows':rows}
(out/'review.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='rows'}))
assert receipt['status'].startswith('PASS')
