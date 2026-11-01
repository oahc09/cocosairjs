const test = require('node:test'),
    assert = require('node:assert/strict'),
    ts = require('typescript');
const { typeOnlyClassExports, namespaceValueAliases, resolveAliasTarget } = require('./type-only-class-exports.cjs');
const parse = (text) => ts.createSourceFile('sdk.d.ts', text, ts.ScriptTarget.Latest, true);
test('public singleton class type is inventoried without inventing a value export', () =>
    assert.deepEqual(
        [
            ...typeOnlyClassExports(
                parse(
                    'declare class Screen { requestFullScreen(): Promise<void>; } export const screen: Screen; export type { Screen };',
                ),
            ),
        ],
        [['Screen', 'Screen']],
    ));
test('named type-only export aliases retain the public name', () =>
    assert.deepEqual(
        [...typeOnlyClassExports(parse('declare class PrivateName {} export { type PrivateName as PublicType };'))],
        [['PrivateName', 'PublicType']],
    ));
test('unexported, external, and real value classes are not classified type-only', () =>
    assert.deepEqual(
        [
            ...typeOnlyClassExports(
                parse(
                    'declare class Private {} export class Actual {} export type { Actual }; export type { External } from "other";',
                ),
            ),
        ],
        [],
    ));

test('namespace named value re-exports retain same-name and renamed public functions', () => {
    const aliases = namespaceValueAliases(
        parse('export function find(): void; export namespace utils { export { find }; export { find as locate }; }'),
    );
    assert.deepEqual(
        aliases.map(({ alias, target, scope }) => ({ alias, target, scope })),
        [
            { alias: 'utils.find', target: 'find', scope: 'utils' },
            { alias: 'utils.locate', target: 'find', scope: 'utils' },
        ],
    );
    for (const alias of aliases) assert.equal(resolveAliasTarget(alias, { find: {} }), 'find');
});
test('namespace value aliases honor lexical shadowing and exclude external/type-only exports', () => {
    const aliases = namespaceValueAliases(
        parse(
            'export namespace outer { export namespace inner { export { find }; export type { Type }; export { type Other }; export { external } from "other"; } }',
        ),
    );
    assert.equal(aliases.length, 1);
    assert.equal(resolveAliasTarget(aliases[0], { find: {}, 'outer.find': {} }), 'outer.find');
    assert.equal(resolveAliasTarget(aliases[0], { 'outer.inner.find': {}, 'outer.find': {} }), 'outer.inner.find');
    assert.equal(resolveAliasTarget(aliases[0], {}), null);
});
