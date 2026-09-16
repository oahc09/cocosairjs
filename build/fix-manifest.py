# -*- coding: utf-8 -*-
"""Fix writeManifest only."""
import io

p = 'tools/benchmark/runner/metrics.ts'
s = io.open(p, encoding='utf-8').read()

NL = chr(10)
BS = chr(92)

old = ("export function writeManifest (file: string, manifest: RunManifest, fixtureRoot: string): void {" + NL
       + "    const fs = require('fs') as typeof import('fs');" + NL
       + "    const withHash = { ...manifest, startingFixtureHash: sha256(Buffer.from(manifest.startingFixtureHash)) };" + NL
       + "    fs.writeFileSync(file, JSON.stringify(withHash, null, 2) + '" + BS + "n', 'utf8');" + NL
       + "    void fixtureRoot;")

new = ("/** " + chr(0xA7) + "43" + chr(65306) + "fixtureRoot " + chr(3682) + chr(26694) + chr(24314) + chr(31435) + chr(25490) + chr(24207) + chr(31383) + chr(23450) + chr(30340) + chr(36882) + chr(24402) + " manifest" + NL
       + "export function computeFixtureManifestHash (fixtureRoot: string): string {" + NL
       + "    const fs = require('fs') as typeof import('fs');" + NL
       + "    const pathMod = require('path') as typeof import('path');" + NL
       + "    const cryptoMod = require('crypto') as typeof import('crypto');" + NL
       + "    const entries: string[] = [];" + NL
       + "    const walk = (dir: string, prefix: string): void => {" + NL
       + "        if (!fs.existsSync(dir)) { return; }" + NL
       + "        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {" + NL
       + "            const rel = prefix ? prefix + '/' + entry.name : entry.name;" + NL
       + "            if (entry.isDirectory()) { walk(path.join(dir, entry.name), rel); } else {" + NL
       + "                entries.push(rel + ':' + cryptoMod.createHash('sha256').update(fs.readFileSync(path.join(dir, entry.name))).digest('hex'));" + NL
       + "            }" + NL
       + "        }" + NL
       + "    };" + NL
       + "    walk(fixtureRoot, '');" + NL
       + "    entries.sort();" + NL
       + "    return cryptoMod.createHash('sha256').update(entries.join('|') || '<empty>').digest('hex');" + NL
       + "}" + NL
       + NL
       + "export function writeManifest (file: string, manifest: RunManifest, fixtureRoot: string): void {" + NL
       + "    const fs = require('fs') as typeof import('fs');" + NL
       + "    // " + chr(0xA7) + "43" + chr(65306) + "startingFixtureHash " + chr(24517) + chr(39057) + chr(26469) + chr(33258) + chr(30495) + chr(23454) + " fixture " + chr(20869) + chr(23481) + NL
       + "    const withHash = { ...manifest, startingFixtureHash: computeFixtureManifestHash(fixtureRoot) };" + NL
       + "    fs.writeFileSync(file, JSON.stringify(withHash, null, 2) + '" + BS + "n', 'utf8');" + NL
       + "    void fixtureRoot;")

assert old in s, 'writeManifest block'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline=NL).write(s)
print('writeManifest ok')
