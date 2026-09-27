/* Bind exercised Label/Sprite component APIs to the rendered UI Gallery page. */
const fs = require('fs');
const path = require('path');
const { findSymbolLine } = require('./spec-evidence.cjs');

const root = path.resolve(__dirname, '../..');
const exampleDir = path.join(root, 'examples/ui-components');
const specPath = path.join(exampleDir, 'example.json');
const sourcePath = path.join(exampleDir, 'main.js');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
const sourceAnchors = {
    'Label.constructor': 'Label.prototype.constructor',
    'Sprite.constructor': 'Sprite.prototype.constructor',
    'UIRenderer.color': 'label.color',
};
const sourceLines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
const units = [
    'Label',
    'Label.constructor',
    'Label.HorizontalAlign',
    'Label.VerticalAlign',
    'Label.Overflow',
    'Label.CacheMode',
    'Label.string',
    'Label.horizontalAlign',
    'Label.verticalAlign',
    'Label.actualFontSize',
    'Label.fontSize',
    'Label.lineHeight',
    'Label.spacingX',
    'Label.overflow',
    'Label.enableWrapText',
    'Label.useSystemFont',
    'Label.fontFamily',
    'Label.font',
    'Label.cacheMode',
    'Label.isBold',
    'Label.isItalic',
    'Label.isUnderline',
    'Label.onEnable',
    'Label.updateRenderData',
    'Label.underlineHeight',
    'Label.enableOutline',
    'Label.outlineColor',
    'Label.outlineWidth',
    'Label.enableShadow',
    'Label.shadowColor',
    'Label.shadowOffset',
    'Label.shadowBlur',
    'Sprite',
    'Sprite.constructor',
    'Sprite.spriteAtlas',
    'Sprite.sizeMode',
    'Sprite.spriteFrame',
    'Sprite.type',
    'Sprite.fillType',
    'Sprite.fillCenter',
    'Sprite.fillStart',
    'Sprite.fillRange',
    'Sprite.trim',
    'Sprite.grayscale',
    'Sprite.FillType',
    'Sprite.Type',
    'Sprite.SizeMode',
    'Sprite.EventType',
    'Sprite.onEnable',
    'Sprite.onDisable',
    'Sprite.changeSpriteFrameFromAtlas',
    'UIRenderer.color',
    'UIRenderer.sharedMaterials',
    'UIRenderer.customMaterial',
    'UIRenderer.priority',
    'UIRenderer.onLoad',
    'UIRenderer.onEnable',
    'UIRenderer.onDisable',
    'UIRenderer.markForUpdateRenderData',
    'UIRenderer.requestRenderData',
    'UIRenderer.postUpdateAssembler',
];
for (const unit of units) {
    if (!inventory.units[unit] || !inventory.units[unit].coverageRequired)
        throw new Error(`Missing required inventory unit: ${unit}`);
    const source = 'main.js';
    const found = findSymbolLine(exampleDir, source, unit);
    if (found.error) throw new Error(found.error);
    for (const list of [spec.apiClaims, spec.api.supporting, spec.api.claims].filter(Array.isArray)) {
        if (!list.includes(unit)) list.push(unit);
    }
    const existing = spec.api.evidence.find((entry) => entry.api === unit);
    if (existing) existing.sourceLocation = `L${found.line}`;
    else spec.api.evidence.push({ api: unit, source, validator: 'no-runtime-error', sourceLocation: `L${found.line}` });
}
for (const entry of spec.api.evidence) {
    if (entry.source !== 'main.js') continue;
    const anchor = sourceAnchors[entry.api];
    const anchorLine = anchor ? sourceLines.findIndex((line) => line.includes(anchor)) : -1;
    const found = anchorLine >= 0 ? { line: anchorLine + 1 } : findSymbolLine(exampleDir, entry.source, entry.api);
    if (found.error) throw new Error(found.error);
    entry.sourceLocation = `L${found.line}`;
}
fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`[ui-component] ${units.length} required Label/Sprite APIs bound to the rendered page`);
