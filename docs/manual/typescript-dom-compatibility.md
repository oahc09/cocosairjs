# TypeScript DOM 声明与浏览器能力

安装包保留主声明 `build/cocosair.module.d.ts`。TypeScript 4.9 的 `lib.dom` 缺少
`DecompressionStream`，其包导入由 `types@<5.0` 指向 `build/cocosair.legacy.d.ts`：
先导出同一份引擎声明，再补该 DOM 接口和构造器。`bootstrap` 子路径也有旧编译器包装。
经典 Node 模块解析使用 `typesVersions` 选择主入口包装；node16 解析使用版本类型条件。
不要求消费者自行复制 ambient 文件。

```ts
import { createPrimitiveGeometry } from 'cocosair.js';

if (typeof DecompressionStream !== 'undefined') {
    const decoder = new DecompressionStream('gzip');
    const stream = response.body?.pipeThrough(decoder);
}
```

示例中的 `response` 是应用取得的 Response。补充声明覆盖 `gzip`、`deflate`、`deflate-raw`；
支持的格式和构造失败由实际浏览器决定。类型补充不下载解压实现，不提供 polyfill，
也不证明当前浏览器支持该格式。调用前检测构造器，调用时处理错误。

TypeScript 5.0 及以上直接解析主声明和编译器自己的 `lib.dom`，不载入旧全局补充，
避免新 DOM 的 typed-array 参数和格式集合变化造成声明合并冲突。
这不改变仓库 TypeScript 4.9.5 或 lockfile。显式绕过包入口直接引用 build 主声明，
也会绕过旧编译器包装；消费者应使用公开包路径。

`npm run build:dts` 同时生成两份旧编译器包装。`npm run verify:consumer` 打包并安装到独立目录，
检查 TS 4.9 node16/经典解析中的直接构造器使用和新 SDK 类型；
`-- --modern-ts=<compiler-bin>` 使用已配置的较新编译器检查同一消费者并确认未载入旧包装。
验证保留项目已有 `skipLibCheck` 合同，不将其表述为整份引擎声明在所有编译器中无诊断。
