
from pathlib import Path
import runpy, sys, json
original = Path.read_bytes
base = Path(sys.argv[2]); data = original(base)
rows = [json.loads(line) for line in data.splitlines()]
case = sys.argv[3]
if case == 'actual-velocity-corruption':
    row = next(row for row in rows if row['kind'] == 'analytic-box')
    row['result']['operations'][-1]['actual']['linearVelocity'][0] += 0.1
elif case == 'producer-predictions-unreadable':
    def poison(value):
        if isinstance(value, dict):
            for key in list(value):
                if key in ['expected','plan']: value[key] = {'poison': 'Reviewer must not consume this object'}
                else: poison(value[key])
        elif isinstance(value, list):
            for item in value: poison(item)
    poison(rows)
else: raise AssertionError(case)
replacement = ('\n'.join(json.dumps(r,separators=(',',':')) for r in rows)+'\n').encode()
# Write exact mutated input bytes once, then read for both modes via an explicitly marked hook.
Path(sys.argv[4]).write_bytes(replacement)
def read(self):
    if self.name == 'command-samples.raw.jsonl' and self.parent.name in ['command-wasm-debug-20261022-n4','command-wasm-release-20261022-n4']:
        return replacement
    return original(self)
Path.read_bytes = read
script,output = sys.argv[1],sys.argv[5]
sys.argv=[script,output]
runpy.run_path(script,run_name='__main__')
