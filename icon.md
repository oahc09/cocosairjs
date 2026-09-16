图标核心含义可以概括成一句话：

> **“AIR 围绕 Runtime 核心流动，代表一个为 Code First、Web 和 Agent 而生的轻量交互引擎。”**

中间的蓝色立方体代表 Cocos Air 的核心 Runtime。它对应 `Scene / Node / Component / Mesh / Material / Animation` 这些稳定、底层、可组合的能力。立方体不是“应用”，而是整个系统的内核。

外部艺术化的 `AIR` 三个字母被做成了流体/轨道形态，没有使用普通字体。这一层代表 Cocos Air 相比传统 Creator 工作流的变化：

```text
传统方式
Editor → Scene File → Build → Runtime

Cocos Air
Code → Runtime → Result
```

也就是更轻、更直接、更流动。

其中 `A` 可以理解为 **Agent-first**，表示 AI Agent 可以直接通过代码、Runtime Inspection、Validation、Screenshot 等能力参与开发。

`I` 是 **Interactive**，中间竖直结构同时像一条连接通道，表达代码、Runtime、输入、动画、交互之间的连接。

`R` 是 **Runtime**，右侧开放的弧形结构强调它不是一个封闭 Editor，而是开放、可组合的运行时。

外层轨道表达的是 Cocos Air 目前已经形成的几个围绕 Runtime 的能力层：

```text
          Agent
            ●
            │

      ╭───────────╮
   Code           glTF
      \             /
       \           /
        Cocos Runtime
           Cube
       /           \
  DevTools        Assets
      ╰───────────╯
            │
            ●
```

两个小球可以理解成“外部输入节点”，比如 Agent、Asset、Tool、用户输入。它们不属于立方体内部，但可以围绕 Runtime 接入，也强化了系统不是封闭单体这一点。

> Cocos Air 不是重新造一个 Cocos Engine，而是在 Cocos Runtime 核心之上重新定义一种 Code First、Agent Ready 的使用方式。

品牌含义：

**Cube = Cocos Runtime**
**AIR = Agent-first Interactive Runtime**
**Orbit = Code / Asset / Agent 围绕 Runtime 自由组合**