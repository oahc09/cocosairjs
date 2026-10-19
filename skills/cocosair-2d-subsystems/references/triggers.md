# Cocos AIR 2D subsystem triggers

Source annotations refer to the AIR checkout.

## When to use what

| Subsystem     | Runnable today | Import symbols                                                                                  | Constructed from                                   | Main trap                            |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Spine         | No, BLOCKED    | `sp`, `loadWasmModuleSpine`                                                                     | skeleton json or binary, atlas text, `Texture2D[]` | null runtime data, no error          |
| DragonBones   | Yes            | `dragonBones` namespace                                                                         | two assets from JSON strings plus one `Texture2D`  | asset setters want raw text          |
| TiledMap      | Yes            | `TiledMap`, `TiledMapAsset`, `TiledLayer`, `TiledObjectGroup`, `TiledTile`, `TiledUserNodeData` | tmx XML string, tsx text, sprite frames            | name lookup by parallel arrays       |
| Particle 2D   | Yes            | `ParticleSystem2D`, `ParticleAsset`                                                             | plist text parsed at run time                      | plist key names and blend enum slots |
| Motion streak | Yes            | `MotionStreak`, `MotionStreakAssemblerManager`                                                  | a plain `Texture2D`                                | no `MotionStreak2D` exists           |
| Billboard     | Yes            | `Billboard`                                                                                     | any `Texture2D` the app keeps alive                | `width` and `height` default to 0    |
