# UPSTREAM

本项目 `cocosair.js`（Cocos AIR）的源码基线来自 Cocos 引擎（cocos4）本地完整快照。

## 基线标识

| 项 | 值 |
|---|---|
| Upstream package | `cocos-creator` |
| Upstream version | `4.0.0-alpha.33` |
| Upstream creator field | `3.8.8` |
| Upstream repository | https://github.com/cocos-creator/engine |
| Baseline Date | 2026-09-12 |
| Upstream commit SHA | 不可用（见 Deviation-01） |

## Deviation-01: 上游 commit SHA 不可得

- 现象：本地目录为一次性下载的上游源码快照，随后才执行 `git init`，git 仓库内无任何 commit、无 remote、无 packed-refs。
- 影响：无法以 `cocos4 @ <commit SHA>` 形式记录基线。
- 处理：以 **引擎版本号（4.0.0-alpha.33）+ 快照日期（2026-09-12）+ 目录指纹统计** 作为基线标识，详见 `docs/00-upstream-baseline.md`。
- 后续如获得上游仓库地址与对应 commit，应补记本文件。

## 基线快照统计（2026-09-12）

| 项 | 值 |
|---|---|
| `cocos/` TS 文件 | 1251（其中 `*.jsb.ts` 54） |
| `cocos/` TS 行数 | ~314,009 |
| `editor/` TS 文件/行数 | 33 / ~5,515 |
| `exports/` 导出入口 | 47 个 `.ts` |
| `native/` 体积 | ~855 MB（不入 Air） |
| 源码状态 | 全部文件为 untracked 快照，无本地修改历史可考 |

## 约定

1. 不执行 `git clone / pull / checkout`；不改动上游文件内容（除计划书明确允许的 Extraction 动作）。
2. 所有后续报告、提交说明引用基线时使用：
   `cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`。
3. 上游文件与 Air 文件的对应关系记录在 `docs/upstream-file-map.json`。
