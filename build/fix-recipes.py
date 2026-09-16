# -*- coding: utf-8 -*-
"""Patch recipes30.ts: add supplementary benchmarkRefs for interaction/visual coverage proof.

Interaction proof: rc/Interaction/Agent benchmark. Visual proof: benchmark with visible-frame.
Per recipe, add domain-appropriate refs so the composite coverage is real, not token.
"""
import io

p = 'tools/benchmark/recipes/recipes30.ts'
s = io.open(p, encoding='utf-8').read()

# For each recipe, add a rc benchmark and a visual benchmark if not already present.
# Domain-mapped: the rc benchmark should be topically adjacent.
supplements = {
    'R001': ['B091', 'B001'],
    'R002': ['B061', 'B001'],
    'R003': ['B081', 'B001'],
    'R004': ['B091', 'B001'],
    'R005': ['B033', 'B001'],
    'R006': ['B091', 'B042'],
    'R007': ['B081', 'B001'],
    'R008': ['B091', 'B042'],
    'R009': ['B039', 'B042'],
    'R010': ['B091', 'B045'],
    'R011': ['B091', 'B011'],
    'R012': ['B018', 'B012'],
    'R013': ['B018', 'B013'],
    'R014': ['B018', 'B020'],
    'R015': ['B015', 'B011'],
    'R016': ['B061', 'B001'],
    'R017': ['B033', 'B037'],
    'R018': ['B090', 'B001'],
    'R019': ['B087', 'B001'],
    'R020': ['B007', 'B001'],
    'R021': ['B075', 'B074'],
    'R022': ['B075', 'B072'],
    'R023': ['B053', 'B055'],
    'R024': ['B053', 'B056'],
    'R025': ['B053', 'B057'],
    'R026': ['B083', 'B068'],
    'R027': ['B091', 'B049'],
    'R028': ['B082', 'B068'],
    'R029': ['B029', 'B023'],
    'R030': ['B091', 'B092'],
}
for rid, refs in supplements.items():
    # 定位该 recipe 行，追加缺失的 benchmarkRefs
    key = f"r('{rid}', "
    idx = s.find(key)
    if idx < 0:
        print(f'WARN: {rid} not found')
        continue
    # 找到 benchmarks: [...] 列表
    bstart = s.find('benchmarks: [', idx)
    bend = s.find(']', bstart)
    existing = s[bstart:bend]
    for ref in refs:
        if f"'{ref}'" not in existing:
            insert_pos = bend
            s = s[:insert_pos] + f", '{ref}'" + s[insert_pos:]
            bend += len(f", '{ref}'")
            # 更新 existing 供后续 ref 检查
            existing = s[bstart:s.find(']', bstart)]

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('recipes30 refs supplemented')
