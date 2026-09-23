'use strict';
// r45h4c 只读判据：验证「发布面两份文档本轮改动」的还原性，逐处如实报告命中/未命中。
// 不写盘、不改判定阈值；退出码 0 仅表示"判据脚本跑完并如实打印"，不表示两处都命中。
const fs = require('fs');
const crypto = require('crypto');
const ROOT = 'E:/AIProMax/github/cocosair.js';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const out = {};

// 1) 报告：删掉澄清段并把连接号改回原字 ⇒ 期望逐字节 == r45h4b 快照 123,613 / 84674600b552777e
{
  const s = fs.readFileSync(ROOT + '/docs/acceptance-report-v12.md', 'utf8');
  const a = s.indexOf('。⚠️ 读数出处澄清');
  const b = s.indexOf('，不是本轮全量现读，');
  if (a < 0 || b < 0) throw new Error('ASSERT 报告还原锚点缺失');
  if (s.split('读数出处澄清').length - 1 !== 1) throw new Error('ASSERT 报告还原锚点不唯一');
  const back = Buffer.from(s.slice(0, a) + '，' + s.slice(b + '，不是本轮全量现读'.length + 1), 'utf8');
  out.report = {
    current: `${Buffer.byteLength(s, 'utf8')} ${sha16(Buffer.from(s, 'utf8'))}`,
    reverted: `${back.length} ${sha16(back)}`,
    expected: '123613 84674600b552777e',
    exact: back.length === 123613 && sha16(back) === '84674600b552777e',
  };
}

// 2) notes：删追加段 + 行内快照标注 ⇒ 期望回到 123,315 / 14ce7e2bcedc9a64（若不成立必须如实报差值）
{
  const s = fs.readFileSync(ROOT + '/docs/v12-upstream-regression.md', 'utf8');
  const PAREN = '（上面那个 **123,613 B / 307 行**是 r45h4c 之前的快照，终值见台账行）';
  if (s.split(PAREN).length - 1 !== 1) throw new Error('ASSERT notes 行内标注锚点');
  const noParen = s.replace(PAREN, '');
  const i3 = noParen.indexOf('**同轮第三处自我更正（r45h4c，写后自查）**');
  if (i3 < 0) throw new Error('ASSERT notes 追加段锚点缺失');
  const back = Buffer.from(noParen.slice(0, i3), 'utf8');
  out.notes = {
    current: `${Buffer.byteLength(s, 'utf8')} ${sha16(Buffer.from(s, 'utf8'))}`,
    reverted: `${back.length} ${sha16(back)}`,
    expected: '123315 14ce7e2bcedc9a64',
    exact: back.length === 123315 && sha16(back) === '14ce7e2bcedc9a64',
    deltaBytes: back.length - 123315,
    removed: { appendedParagraph: Buffer.byteLength(noParen.slice(i3), 'utf8'), inlineSnapshotLabel: Buffer.byteLength(PAREN, 'utf8') },
  };
}

console.log(JSON.stringify(out, null, 2));
process.exit(0);
