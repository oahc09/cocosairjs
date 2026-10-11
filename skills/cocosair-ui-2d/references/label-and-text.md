Derived from src/cocos/2d/components/label.ts, src/cocos/2d/components/label-outline.ts, src/cocos/2d/components/label-shadow.ts, src/cocos/2d/components/rich-text.ts, src/cocos/2d/assets/bitmap-font.ts, src/cocos/2d/assets/label-atlas.ts, src/air/ui-kit.ts, docs/manual/creating-text.md, docs/manual/bitmap-font-loading.md - 2026-10-10

# Label and text

`Label extends UIRenderer` (`src/cocos/2d/components/label.ts:180`), so it participates in 2D sorting,
`color` and the batcher like any other UI renderer. There is no 3D text geometry and no Creator
font-asset pipeline: text uses the system font, or an authored BMFont bound through the supported load
path (`docs/manual/creating-text.md:14`, `:38`).

## Font capability boundary

- Default: leave `label.font` unset and `Label` renders with the platform system font (`docs/manual/creating-text.md:38-39`).
- Authored faces: only BMFont. `parseFnt(text)` parses the `.fnt` text into frozen page/glyph data, `createBitmapFont(data, pageSpriteFrame)` assembles a native `BitmapFont`, and `loadBitmapFont(url, { bank, signal })` is the routine AssetBank-backed loader (`docs/manual/bitmap-font-loading.md:3`, `:7`, `:13-26`).
- `BitmapFont extends Font` (`src/cocos/2d/assets/bitmap-font.ts:122`), and `LabelAtlas extends BitmapFont` (`src/cocos/2d/assets/label-atlas.ts:35`); `LabelAtlas` is exported bare, `Font`, `BitmapFont` and `TTFFont` are all on the export block (`build/cocosair.module.js`, currently :161574).
- No `.ttf`/`.font` asset-import workflow exists; the manual's `LabelAtlas`/RichText "editor workflow" wording at `docs/manual/creating-text.md:38` describes the missing authoring pipeline, not a missing component.

## labelNode helper

`labelNode(parent, text, name = 'Label', options)` builds a `UITransform` + `Label` child
(`src/air/ui-kit.ts:111-131`). Real defaults:

| Option         | Default                        | Line                    |
| -------------- | ------------------------------ | ----------------------- |
| layer          | `Layers.Enum.UI_2D`            | `src/air/ui-kit.ts:116` |
| fontSize       | 28                             | `src/air/ui-kit.ts:117` |
| lineHeight     | `Math.round(fontSize * 1.25)`  | `src/air/ui-kit.ts:124` |
| color          | `options.color ?? Color.WHITE` | `src/air/ui-kit.ts:125` |
| boxSize        | `[0, 0]` (auto measure)        | `src/air/ui-kit.ts:119` |
| overflow       | applied only if supplied       | `src/air/ui-kit.ts:126` |
| enableWrapText | applied only if supplied       | `src/air/ui-kit.ts:127` |

`fontSize * 1.25` is rounded, so `fontSize: 28` yields `lineHeight: 35` (`src/air/ui-kit.ts:117`,
`:124`). This matches the manual's own `addLabel` recipe (`docs/manual/creating-text.md:26`,
`docs/manual/2d-ui.md:76`).

`enableWrapText` is validated: passing a non-boolean throws
`Object.assign(new Error('[AIR_E_LABEL_WRAP] enableWrapText must be boolean'), { code: 'AIR_E_LABEL_WRAP' })`
(`src/air/ui-kit.ts:112-113`). Omitting it keeps the native `Label` default.

## Overflow semantics

`Label.Overflow` is `{ NONE = 0, CLAMP = 1, SHRINK = 2, RESIZE_HEIGHT = 3 }`
(`src/cocos/2d/components/label.ts:108-134`). Measured behavior on a fixed 300x40 box (`docs/manual/creating-text.md:47-52`):

- NONE: no wrap; content size grows with text width.
- CLAMP: box constant; overflow clipped. It is not single-line ellipsis truncation.
- SHRINK: box constant; the rendered size is internalized in `_actualFontSize`, so assert on the render result, not the `fontSize` property.
- RESIZE_HEIGHT: width constant, height grows with wrapping; wrapping is inherent, so `enableWrapText = false` still wraps.

## CacheMode

`Label.CacheMode` is `{ NONE = 0, BITMAP = 1, CHAR = 2 }` (`src/cocos/2d/components/label.ts:143-164`),
exposed as `Label.CacheMode` (`:204`). BITMAP caches the whole label into the dynamic atlas; CHAR
caches per glyph. Toggling cache mode re-rasterizes (`:502-510`).

## Outline, shadow, RichText

- `LabelOutline` (`src/cocos/2d/components/label-outline.ts:46`) and `LabelShadow` (`src/cocos/2d/components/label-shadow.ts:43`) are separate `Component`s added alongside `Label`, not `Label` properties (`docs/manual/creating-text.md:39`).
- Native label shadow is configured through `enableShadow`, `shadowColor`, `shadowBlur` and `shadowOffset` on `Label` itself (`docs/manual/creating-text.md:54-55`, `:77`); `LabelShadow` is the component form.
- `RichText` (`src/cocos/2d/components/rich-text.ts:157`) is exported only as `RichText as RichTextComponent` - import that alias, there is no bare `RichText` (`build/cocosair.module.js`, currently :161574). RichText sub-labels re-apply style on segment rebuild, so shadow must be re-applied per business style (`docs/manual/creating-text.md:79`).

## Release note

BMFont handles own font, page `SpriteFrame` and `Texture2D`; unbind `label.font = null` before
`handle.dispose()`, and extra `font.addRef()` not returned throws `AIR_E_FNT_IN_USE`
(`docs/manual/bitmap-font-loading.md:23-25`, `:36-38`). Loader errors are `AIR_E_FNT_FORMAT`,
`AIR_E_FNT_DATA`, `AIR_E_FNT_PAGES`, `AIR_E_FNT_PACKED`, `AIR_E_FNT_PAGE_TEXTURE`, `AIR_E_FNT_BASE_URL`
and `AIR_E_FNT_IN_USE` (`docs/manual/bitmap-font-loading.md:47-48`).
