// AIR 环境声明替位（V1.2 批次 D-3）：官方 tsconfig 的 types 列表含
// `./native/external/emscripten/box2d/box2d`，该 emscripten typings 不随引擎快照分发。
// `cocos/physics-2d/box2d/platform/physics-ray-cast-callback.ts` 在 `ReportFixture` 签名里引用 `B2.Vec2`
// （全仓仅此一处），故以最小 ambient 声明替位，使抽取文件保持与官方逐字节一致。
declare namespace B2 {
    interface Vec2 {
        x: number;
        y: number;
    }
}
