/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require(path.resolve(__dirname, '../box3d-rebuild-20261022/node_modules/typescript'));
const printer = ts.createPrinter({ removeComments: true });
const results = [];
for (const rel of [
    'src/cocos/physics/framework/components/colliders/collider.ts',
    'src/cocos/physics/framework/physics-system.ts',
]) {
    const before = ts.createSourceFile(
        rel,
        fs.readFileSync(path.join(__dirname, 'inputs/product', rel), 'utf8'),
        ts.ScriptTarget.ES2022,
        true,
    );
    const candidate = ts.createSourceFile(
        rel,
        fs.readFileSync(path.join(__dirname, rel), 'utf8'),
        ts.ScriptTarget.ES2022,
        true,
    );
    let positive = 0,
        negative = 0;
    const transformed = ts.transform(candidate, [
        (context) => {
            const visit = (node) => {
                if (ts.isIfStatement(node)) {
                    const expression = node.expression.getText(candidate);
                    if (expression === 'change.privateSubscriptions') {
                        positive++;
                        return undefined;
                    }
                    if (expression === '!change.privateSubscriptions') {
                        negative++;
                        return ts.isBlock(node.thenStatement)
                            ? node.thenStatement.statements.map((s) => ts.visitNode(s, visit))
                            : ts.visitNode(node.thenStatement, visit);
                    }
                }
                return ts.visitEachChild(node, visit, context);
            };
            return (file) => ts.visitNode(file, visit);
        },
    ]);
    const canonicalBefore = printer.printFile(before);
    const canonicalLegacy = printer.printFile(transformed.transformed[0]);
    assert.equal(canonicalLegacy, canonicalBefore, `Legacy branch must reduce to complete original AST: ${rel}`);
    results.push({
        file: rel,
        copiedPrivateFalseReducesToOriginalWholeFileAST: true,
        positiveBranches: positive,
        negativeBranches: negative,
    });
    transformed.dispose();
}
const out = path.join(__dirname, 'evidence/legacy-structure.json');
fs.writeFileSync(
    out,
    JSON.stringify(
        {
            scope: 'Whole-file AST equality after constant folding only the new copied capability to false. Comments ignored; no other transform.',
            results,
        },
        null,
        2,
    ) + '\n',
);
console.log('PASS: legacy capability=false reduces both complete Collider and System ASTs to the originals.');
