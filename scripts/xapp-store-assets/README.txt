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
- iOS side glyphs use a 6.4pt source stroke on the 64pt canvas so the reduced glass
  icons retain at least a 2pt displayed line. Android retains its existing 3.2pt
  source stroke. The export keeps the same painted bounds and canvas sizes.
- Native RNN currently preserves original image colours. Unselected stays #848CB8;
  selected is black in the light app and white in the dark app. All three variants
  are exported at every density. StyleService chooses the existing Light variant.
- On the iPhone glass bar, navigator.ts tints both states of the four side icons
  with matching label colours: textPrimary at 60% opacity for inactive tabs,
  opaque textPrimary for the active tab. It preserves the existing 0.72 image-size factor, with a 21pt
  canvas minimum on compact @2x devices to keep the displayed stroke >=2pt. Regular bars
  keep the original PNG colours and sizes. Both initial tabs and theme refresh use
  this rule. Explicit 10pt labels are stable across theme changes. The native
  glass bar adopts the app-selected light/dark style independently of the OS.
  A scoped native fallback preserves attributed title colours after UIKit layout;
  it leaves React roots and automatic system appearance detection unchanged.
- The centre Xaman action button is excluded and unchanged.

Category selection API:
  getXAppCategoryIcon(category?: string | null): keyof typeof Images
The helper maps normalized English backend names only. Customer service/support
uses the support glyph. Unknown, empty, null and undefined use the grid fallback.
It does not change labels, category counts, filtering values or server data.
