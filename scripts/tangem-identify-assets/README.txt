Tangem Identify artwork

ImageIdentifyTangem: light app theme, rich blue card with white Xaman lettering.
ImageIdentifyTangemLight: the same blue/white card, with a dark-theme scan badge.
The card finish follows the physical Xaman card: #0030CF to #16339C blue with
subtle clipped contours. The exact existing Xaman wordmark is traced from its
high-resolution alpha outline; the original brand asset is unchanged.
Both hero images use a transparent 220x150 logical canvas. The decorative card
has no serial. The app displays the actual card serial separately.
IconScanCard: transparent 24x24 contactless scan glyph, black with alpha; use the
normal React Native tintColor style for the button/theme color.

Native PNG exports:
- iOS: 1x, 2x, 3x in universal imagesets under Images.xcassets.
- Android: mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi under res/drawable-*.
No SVG/XML decoding is needed in the app.

Regenerate all SVG sources and native PNGs from the repository root on macOS:
  swift scripts/tangem-identify-assets/generate.swift

The generator uses built-in CoreGraphics/ImageIO only. The exported SVG contains
the outlined Xaman mark, so SVG/PNG files have no font or linked-image dependency.
The paths, gradients and raster images are exported from the same geometry.
PNG files use sRGB and transparency. No runtime or build dependency is added.
