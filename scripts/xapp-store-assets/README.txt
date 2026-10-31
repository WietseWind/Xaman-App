xApp store and bottom-bar artwork

Sources: Lucide 0.468.0 SVG geometry, with the upstream ISC licence and inherited
Feather MIT notice retained here. No npm dependency is added. All SVGs are local;
regeneration needs only macOS Swift, Foundation, CoreGraphics and ImageIO.
source-provenance.json records the pinned sources and local export choices.

Regenerate from the repository root:
  swift scripts/xapp-store-assets/generate.swift --output-root "$PWD"

Without --output-root, the script writes only scripts/xapp-store-assets/output/.
The converter implements the elements and SVG path commands used by these pinned
sources. It rejects unsupported elements/transforms/commands rather than fetching
or substituting graphics. It is a local export tool, not an app SVG dependency.

New assets:
- 13 category glyphs, a 2x2 grid fallback, info and recent(clock): transparent 24x24.
- Icon stroke width 1.7 matches the Calm category style. The PNGs are black alpha templates;
  React Native tintColor supplies the light/dark colour. No duplicate theme PNGs.
- ImageXAppTileScrim: transparent 8x132 black alpha mask. Stretch it across the tile
  and tint white in light mode or #171924 in dark mode. Opacity stops are 0 at 0%,
  0.05 at 25%, 0.95 at 87% and 1 at 100%. No text/colour is baked into this mask.
- iOS exports 1x/2x/3x. Android exports mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi.

Global bottom bar:
- Existing Home, Events, xApps and Settings image keys and filenames stay the same.
  Their glyphs are credit-card, list, layout-grid and sliders-horizontal.
- Keep existing 64pt iOS and 48dp Android canvases because navigator.ts/device.ts
  calculate native RNN sizes from them. The manifest fits new paths near the old
  painted height (about 43/64), with a fixed native line width to keep consistent
  visual weight. No navigator sizing change is needed.
- Native RNN currently preserves original image colours. Unselected stays #848CB8;
  selected is black in the light app and white in the dark app. All three variants
  are exported at every density. StyleService chooses the existing Light variant.
- The centre Xaman action button is excluded and unchanged.

Category selection API:
  getXAppCategoryIcon(category?: string | null): keyof typeof Images
The helper maps normalized English backend names only. Customer service/support
uses the support glyph. Unknown, empty, null and undefined use the grid fallback.
It does not change labels, category counts, filtering values or server data.
