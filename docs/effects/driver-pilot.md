# W5 Effect Driver Pilot

Wave5 Driver Pilot：声明式输入绑定→真实消费者Material uniform更新。本地设计，不称上游PropDriver同算法。

## 绑定合同

| 绑定                  | 说明                                                   |
| --------------------- | ------------------------------------------------------ |
| pointer-position      | CSS-rect归一化UV（v-up），返回 {x,y}                   |
| pointer-x / pointer-y | 标量单坐标                                             |
| time                  | Σ有限非负dt；pause冻结全部（包括pointer）              |
| auto-animate          | amplitude·sin(2π·time/period + phase)                  |
| map-range             | inputMin/Max→outputMin/Max；clamp（默认）或extrapolate |

## 消费者

E03 Holographic + E04 Neon。母参数默认值从各自 parameters.json 冻结读取；driver 仅覆盖映射的 uniform 分量，其余保持母默认。

## 已完成的冻结候选验收

| 维度        | 内容                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| Functional  | 3引擎 × 2消费者 × DPR1/2 × 7案例 = 84组；180边界、96非法输入、1200资源循环、12 resize |
| Performance | 3 profile × 2 consumer × 3 engine = 18串行窗口，5853 steady帧                         |

六门通过及原始证据见[十三项交付](driver-pilot-validation-delivery.md)。完整接受正例与实际报告篡改审计均通过，母片段没有简化。UV 驱动真实 Node 位置；母顶点通过原生世界矩阵消费该位移。

本结论只适用于记录的不可变候选。并行 SDK 重建后工作区指纹不同，当前 SDK 总 Gate 仍 BLOCKED；Agent 与独立 Gallery 仍 NOT_RUN。
