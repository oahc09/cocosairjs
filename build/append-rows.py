# -*- coding: utf-8 -*-
"""Append 67 catalog rows + fix duplicate export in catalog100.ts."""
import io

p = 'tools/benchmark/catalog/catalog100.ts'
s = io.open(p, encoding='utf-8').read()

old = "export const CATALOG100: BenchmarkDefinition[] = built.benchmarks;\nexport const SPECS: Map<string, Spec> = built.specs;\nexport const CATALOG100 = { revision: 'catalog100-r1', benchmarks: CATALOG100 };\nexport { GOLDEN_REVISION };"
if old in s:
    new = "export const CATALOG_BENCHMARKS: BenchmarkDefinition[] = built.benchmarks;\nexport const SPECS: Map<string, Spec> = built.specs;\nexport const CATALOG100 = { revision: 'catalog100-r1', benchmarks: CATALOG_BENCHMARKS };\nexport { GOLDEN_REVISION };"
    s = s.replace(old, new, 1)
    print('export fixed')

anchor = """    {
        id: 'B095', type: 'runtime-control', category: 'Agent', name: 'rc-error-report',
        prompt: 'Use the runtime agent session to request the runtime error report (getRuntimeErrors) and finish; an empty report is a pass.',
        validators: ['scene-ready', 'no-runtime-error'],
        template: 'rc-app', params: {},
        refCode: rcApp('B095'),
    },
];"""

extra = io.open('build/rows-extra.txt', encoding='utf-8').read()
assert anchor in s, 'rows anchor'
s = s.replace(anchor, extra, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rows appended')
