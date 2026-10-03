# 雾的运行时合同与unlit精确雾

当前Fog.type与accurate是管线宏，切换会通知材质重编译。不能把单次CPU setter耗时当作GPU或present耗时，
也不能普遍保证运行时切换没有16ms尖峰。优先在run前配置，并明确初始化顺序：enabled=true后设置type。
disabled时写type会丢弃该值，当前FOG_TYPE_NONE为4。

对于固定线性雾类型，fogStart/fogEnd等参数通过UBO更新。本例用start/end=100/101实现可见场景的雾bypass，
恢复0/8重新加雾，CC_USE_FOG始终为0；这不是通用全类型开关。
bypass距离必须覆盖受测场景，密度参数不能直接套到线性雾。

## 大三角的实际断点

普通顶点雾在顶点计算距离，再插值雾系数。大三角的三个顶点都在fogEnd之外时，内部也会被错误地视为完全雾化。
当前builtin-unlit在accurate=true时还存在另一处断点：vertex不传world position，fragment调用单参CC_APPLY_FOG，
该重载在accurate=true时不应用雾。开启宏成功并不证明精确雾生效。

[fog-accuracy](../../examples/fog-accuracy/) 使用相机z=5、fogStart0/fogEnd8、三个远距离顶点，
固定中点RGB实际为：普通顶点雾0，native accurate255，Air专用变体156。
节点沿z平移+1后为180，实例化路径也为180，证明使用了真实世界坐标。

```ts
import { createAirUnlitFogEffect, Material } from 'cocosair';

// 在createAirApp完成后配置场景；工厂不改builtin-unlit或builtin-standard。
scene.globals.fog.enabled = true;
scene.globals.fog.type = 0;
scene.globals.fog.accurate = true;
const effect = createAirUnlitFogEffect();
const material = new Material();
material.initialize({ effectAsset: effect });
renderer.setSharedMaterial(material, 0);
```

工厂返回独立owned EffectAsset，业务按自己的资源生命周期释放material和effect。
GLSL3/4均传worldPos并调用双参雾函数，原生TRS/instancing路径已测；skinning/morph源码保留，尚未在该例验证。
夜城的USE_VERTEX_COLOR窗格也在三浏览器运行；USE_TEXTURE、alpha test和skinning/morph组合不能由该结果推导已验证。
当前builtin-unlit只有1个shader，其已有output location为0/1/2；Air变体使用location3，
源码兼容性检查遇到目标调用或precision前导不匹配会拒绝注册。未来上游增加同位置varying时仍须重新评估。
当前浏览器范围为WebGL2。shader模板identity由内容生成，EffectAsset唯一名称不生成新program模板。
工厂移除自身不需要的延迟预编译监听，不改变原生EffectAsset的提前注册合同。

本轮20次真实GPU创建/销毁只使用1个shader ID，registry22→22、bufferSize7140226→7140226；
另外50次源级回归确认无template、registry或延迟监听增长。
这证明固定效果路径下缓存有界，不等于引擎全局shader缓存应逐次清空。
