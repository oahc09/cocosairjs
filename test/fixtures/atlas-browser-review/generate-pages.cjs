// Repository-owned asymmetric images. Each PNG row follows image top-to-bottom order.
const { PNG } = require('pngjs');
const fs = require('node:fs'), path = require('node:path');
function make(width, height) {
    const png = new PNG({ width, height });
    for (let i = 0; i < png.data.length; i += 4) png.data.set([9,19,29,255], i);
    return png;
}
function fill(png, x, y, w, h, rgba) {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) png.data.set(rgba, (row * png.width + col) * 4);
}
const a = make(32,16), b = make(16,16);
for (const [x,y,color] of [[0,0,[255,0,0,255]],[4,0,[0,255,0,255]],[0,4,[0,0,255,255]],[4,4,[255,255,0,255]]]) fill(a,x,y,4,4,color);
fill(a,8,0,6,4,[255,0,255,255]); fill(a,14,0,6,4,[255,128,0,255]);
fill(a,20,0,8,6,[0,200,80,255]); fill(a,20,6,8,2,[0,80,40,255]);
for (const [x,color] of [[0,[0,255,255,255]],[4,[255,255,255,255]],[8,[160,0,255,255]]]) fill(b,x,0,4,4,color);
for (const [name,png] of [['page-0.png',a],['page-1.png',b]]) fs.writeFileSync(path.join(__dirname,name), PNG.sync.write(png));
