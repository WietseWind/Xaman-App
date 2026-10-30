#!/usr/bin/env swift
// Run from the repository root: swift scripts/tangem-identify-assets/generate.swift
// Uses macOS CoreGraphics/ImageIO only. No app or build dependency is added.
import Foundation
import CoreGraphics
import ImageIO

struct Shape {
    let path: CGPath
    let color: String
    let gradientTo: String?
    let opacity: CGFloat
    let stroke: CGFloat?
    let clip: CGPath?
}

struct Artwork {
    let width: Int
    let height: Int
    var shapes: [Shape] = []

    mutating func add(_ path: CGPath, _ color: String, gradientTo: String? = nil,
                      opacity: CGFloat = 1, stroke: CGFloat? = nil, clip: CGPath? = nil,
                      transform: CGAffineTransform = .identity) {
        var matrix = transform
        shapes.append(Shape(path: path.copy(using: &matrix)!, color: color,
                            gradientTo: gradientTo, opacity: opacity, stroke: stroke,
                            clip: clip?.copy(using: &matrix)))
    }
}

let repo = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = repo.appendingPathComponent("scripts/tangem-identify-assets")
let graphics = repo.appendingPathComponent("ios/Xaman/Images.xcassets/Graphics")
let icons = repo.appendingPathComponent("ios/Xaman/Images.xcassets/Icons")
let android = repo.appendingPathComponent("android/app/src/main/res")
let logoURL = graphics.appendingPathComponent("XamanLogoLight.imageset/xaman_logo_light@3x.png")

func rounded(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat,
             radius: CGFloat) -> CGPath {
    CGPath(roundedRect: CGRect(x: x, y: y, width: width, height: height),
           cornerWidth: radius, cornerHeight: radius, transform: nil)
}

func circle(_ x: CGFloat, _ y: CGFloat, _ radius: CGFloat) -> CGPath {
    CGPath(ellipseIn: CGRect(x: x - radius, y: y - radius,
                            width: radius * 2, height: radius * 2), transform: nil)
}

func nfc() -> CGPath {
    let path = CGMutablePath()
    path.move(to: CGPoint(x: 9, y: 8))
    path.addQuadCurve(to: CGPoint(x: 9, y: 16), control: CGPoint(x: 13, y: 12))
    path.move(to: CGPoint(x: 13, y: 5))
    path.addQuadCurve(to: CGPoint(x: 13, y: 19), control: CGPoint(x: 20, y: 12))
    path.move(to: CGPoint(x: 17, y: 2))
    path.addQuadCurve(to: CGPoint(x: 17, y: 22), control: CGPoint(x: 27, y: 12))
    return path
}

func scan() -> CGPath {
    let path = CGMutablePath()
    let segments: [[CGPoint]] = [
        [CGPoint(x: 3, y: 8), CGPoint(x: 3, y: 4), CGPoint(x: 4, y: 3), CGPoint(x: 8, y: 3)],
        [CGPoint(x: 16, y: 3), CGPoint(x: 20, y: 3), CGPoint(x: 21, y: 4), CGPoint(x: 21, y: 8)],
        [CGPoint(x: 21, y: 16), CGPoint(x: 21, y: 20), CGPoint(x: 20, y: 21), CGPoint(x: 16, y: 21)],
        [CGPoint(x: 8, y: 21), CGPoint(x: 4, y: 21), CGPoint(x: 3, y: 20), CGPoint(x: 3, y: 16)],
        [CGPoint(x: 8, y: 12), CGPoint(x: 16, y: 12)],
    ]
    for points in segments {
        path.move(to: points[0])
        points.dropFirst().forEach { path.addLine(to: $0) }
    }
    return path
}

func wordmark() -> CGPath {
    // Trace the existing brand asset's alpha outline at its original resolution.
    // This keeps the actual Xaman mark, without a runtime bitmap/font dependency.
    guard let imageSource = CGImageSourceCreateWithURL(logoURL as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        fatalError("Run from the repository root; the existing Xaman wordmark is required.")
    }
    let width = image.width, height = image.height, stride = width + 1
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    pixels.withUnsafeMutableBytes { bytes in
        let context = CGContext(data: bytes.baseAddress, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    }
    func opaque(_ x: Int, _ y: Int) -> Bool {
        x >= 0 && x < width && y >= 0 && y < height && pixels[(y * width + x) * 4 + 3] >= 128
    }
    var edges: [Int: [Int]] = [:]
    func edge(_ x1: Int, _ y1: Int, _ x2: Int, _ y2: Int) {
        edges[y1 * stride + x1, default: []].append(y2 * stride + x2)
    }
    for y in 0..<height {
        for x in 0..<width where opaque(x, y) {
            if !opaque(x, y - 1) { edge(x, y, x + 1, y) }
            if !opaque(x + 1, y) { edge(x + 1, y, x + 1, y + 1) }
            if !opaque(x, y + 1) { edge(x + 1, y + 1, x, y + 1) }
            if !opaque(x - 1, y) { edge(x, y + 1, x, y) }
        }
    }
    let path = CGMutablePath()
    while let start = edges.keys.min() {
        var current = start
        var points: [CGPoint] = []
        repeat {
            points.append(CGPoint(x: current % stride, y: current / stride))
            guard var next = edges[current], let target = next.popLast() else {
                fatalError("Open Xaman wordmark outline")
            }
            if next.isEmpty { edges.removeValue(forKey: current) } else { edges[current] = next }
            current = target
        } while current != start
        path.move(to: points[0])
        for index in 1..<points.count {
            let previous = points[index - 1], point = points[index], next = points[(index + 1) % points.count]
            if (point.x - previous.x) * (next.y - point.y) != (point.y - previous.y) * (next.x - point.x) {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
    }
    var placement = CGAffineTransform(translationX: 37, y: 57)
        .scaledBy(x: 91 / CGFloat(width), y: 91 / CGFloat(width))
    return path.copy(using: &placement)!
}

func hero(dark: Bool) -> Artwork {
    var art = Artwork(width: 220, height: 150)
    let cardColor = "0030CF"
    let cardInk = "FFFFFF"
    let badgeColor = dark ? "272B47" : "EEF0FB"
    let badgeRing = dark ? "12131B" : "F8F9FC"
    let card = rounded(20, 25, 172, 100, radius: 11)
    let angle: CGFloat = -.pi / 20
    let turn = CGAffineTransform(translationX: 106, y: 75)
        .rotated(by: angle).translatedBy(x: -106, y: -75)
    // Flat translucent shadow layers keep the SVG and raster exports identical.
    for offset: CGFloat in [7, 4] {
        let shadow = turn.concatenating(CGAffineTransform(translationX: 0, y: offset))
        art.add(card, dark ? "000000" : "1C2440", opacity: dark ? 0.10 : 0.04, transform: shadow)
    }
    art.add(card, cardColor, gradientTo: "16339C", transform: turn)
    // A restrained contour finish follows the physical Xaman card reference.
    for inset: CGFloat in [0, 13, 27, 42, 58, 75] {
        let contour = CGMutablePath()
        contour.move(to: CGPoint(x: 4 + inset * 0.35, y: 132))
        contour.addCurve(to: CGPoint(x: 164 - inset * 0.4, y: 15),
            control1: CGPoint(x: 13 + inset * 0.3, y: 68),
            control2: CGPoint(x: 116 - inset * 0.35, y: -14 + inset * 0.3))
        contour.addCurve(to: CGPoint(x: 202 - inset * 0.22, y: 112 - inset * 0.18),
            control1: CGPoint(x: 202 - inset * 0.18, y: 25 + inset * 0.2),
            control2: CGPoint(x: 217 - inset * 0.15, y: 80))
        contour.addCurve(to: CGPoint(x: 4 + inset * 0.35, y: 132),
            control1: CGPoint(x: 160 - inset * 0.1, y: 150 - inset * 0.16),
            control2: CGPoint(x: 50 + inset * 0.1, y: 169 - inset * 0.15))
        art.add(contour, "112B96", opacity: 0.34, stroke: 1.7, clip: card, transform: turn)
    }
    art.add(wordmark(), cardInk, transform: turn)
    let radio = CGAffineTransform(translationX: 150, y: 46)
        .scaledBy(x: 0.88, y: 0.88).concatenating(turn)
    art.add(nfc(), cardInk, stroke: 2, transform: radio)
    art.add(circle(154.4, 56.6, 1.15), cardInk, transform: turn)
    art.add(circle(181, 117, 24.5), badgeRing)
    art.add(circle(181, 117, 20), badgeColor)
    let badgeGlyph = CGAffineTransform(translationX: 170, y: 106)
        .scaledBy(x: 22 / 24, y: 22 / 24)
    art.add(scan(), dark ? "91AEFF" : cardColor, stroke: 2.25, transform: badgeGlyph)
    return art
}

func icon() -> Artwork {
    var art = Artwork(width: 24, height: 24)
    art.add(nfc(), "000000", stroke: 2)
    art.add(circle(5, 12, 1.1), "000000")
    return art
}

func number(_ value: CGFloat) -> String {
    String(format: "%.3f", locale: Locale(identifier: "en_US_POSIX"), Double(value))
}

func pathData(_ path: CGPath) -> String {
    var commands: [String] = []
    path.applyWithBlock { element in
        let points = element.pointee.points
        func point(_ index: Int) -> String { "\(number(points[index].x)) \(number(points[index].y))" }
        switch element.pointee.type {
        case .moveToPoint: commands.append("M\(point(0))")
        case .addLineToPoint: commands.append("L\(point(0))")
        case .addQuadCurveToPoint: commands.append("Q\(point(0)) \(point(1))")
        case .addCurveToPoint: commands.append("C\(point(0)) \(point(1)) \(point(2))")
        case .closeSubpath: commands.append("Z")
        @unknown default: fatalError("Unexpected path element")
        }
    }
    return commands.joined(separator: " ")
}

func svg(_ art: Artwork, name: String) throws {
    var definitions: [String] = []
    let paths = art.shapes.enumerated().map { index, shape -> String in
        let paint: String
        if let width = shape.stroke {
            paint = "fill=\"none\" stroke=\"#\(shape.color)\" stroke-width=\"\(number(width))\" stroke-linecap=\"round\" stroke-linejoin=\"round\""
        } else {
            if let end = shape.gradientTo {
                definitions.append("    <linearGradient id=\"gradient\(index)\"><stop stop-color=\"#\(shape.color)\"/><stop offset=\"1\" stop-color=\"#\(end)\"/></linearGradient>")
                paint = "fill=\"url(#gradient\(index))\""
            } else {
                paint = "fill=\"#\(shape.color)\""
            }
        }
        var clip = ""
        if let path = shape.clip {
            definitions.append("    <clipPath id=\"clip\(index)\"><path d=\"\(pathData(path))\"/></clipPath>")
            clip = " clip-path=\"url(#clip\(index))\""
        }
        return "  <path d=\"\(pathData(shape.path))\" \(paint) opacity=\"\(number(shape.opacity))\"\(clip)/>"
    }.joined(separator: "\n")
    let definitionMarkup = definitions.isEmpty ? "" : "  <defs>\n\(definitions.joined(separator: "\n"))\n  </defs>\n"
    let document = """
    <svg xmlns="http://www.w3.org/2000/svg" width="\(art.width)" height="\(art.height)" viewBox="0 0 \(art.width) \(art.height)">
      <title>\(name == "icon_scan_card" ? "Contactless card scan" : "Tangem card identification")</title>
    \(definitionMarkup)\(paths)
    </svg>

    """
    try document.write(to: source.appendingPathComponent(name + ".svg"), atomically: true, encoding: .utf8)
}

func png(_ art: Artwork, scale: CGFloat, destination: URL) throws {
    let width = Int(CGFloat(art.width) * scale), height = Int(CGFloat(art.height) * scale)
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fatalError("Bitmap allocation failed") }
    context.translateBy(x: 0, y: CGFloat(height))
    context.scaleBy(x: scale, y: -scale)
    context.setAllowsAntialiasing(true)
    context.setLineCap(.round)
    context.setLineJoin(.round)
    for shape in art.shapes {
        context.saveGState()
        if let clip = shape.clip {
            context.addPath(clip)
            context.clip()
        }
        let rgb = UInt32(shape.color, radix: 16)!
        let color = CGColor(srgbRed: CGFloat((rgb >> 16) & 255) / 255,
            green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255,
            alpha: shape.opacity)
        context.addPath(shape.path)
        if let stroke = shape.stroke {
            context.setStrokeColor(color)
            context.setLineWidth(stroke)
            context.strokePath()
        } else if let end = shape.gradientTo {
            let rgbEnd = UInt32(end, radix: 16)!
            let endColor = CGColor(srgbRed: CGFloat((rgbEnd >> 16) & 255) / 255,
                green: CGFloat((rgbEnd >> 8) & 255) / 255, blue: CGFloat(rgbEnd & 255) / 255,
                alpha: shape.opacity)
            let bounds = shape.path.boundingBoxOfPath
            context.clip()
            let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
                colors: [color, endColor] as CFArray, locations: [0, 1])!
            context.drawLinearGradient(gradient, start: CGPoint(x: bounds.minX, y: bounds.midY),
                end: CGPoint(x: bounds.maxX, y: bounds.midY), options: [])
        } else {
            context.setFillColor(color)
            context.fillPath()
        }
        context.restoreGState()
    }
    let destinationImage = CGImageDestinationCreateWithURL(destination as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(destinationImage, context.makeImage()!, nil)
    guard CGImageDestinationFinalize(destinationImage) else { fatalError("PNG export failed") }
}

let assets: [(String, String, Artwork, URL)] = [
    ("ImageIdentifyTangem", "image_identify_tangem", hero(dark: false), graphics),
    ("ImageIdentifyTangemLight", "image_identify_tangem_light", hero(dark: true), graphics),
    ("IconScanCard", "icon_scan_card", icon(), icons),
]
for (name, filename, art, catalog) in assets {
    try svg(art, name: filename)
    let directory = catalog.appendingPathComponent(name + ".imageset")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var entries: [[String: String]] = []
    for scale in 1...3 {
        let pngName = "\(filename)@\(scale)x.png"
        try png(art, scale: CGFloat(scale), destination: directory.appendingPathComponent(pngName))
        entries.append(["idiom": "universal", "scale": "\(scale)x", "filename": pngName])
    }
    let contents: [String: Any] = ["images": entries, "info": ["author": "xcode", "version": 1]]
    try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
        .write(to: directory.appendingPathComponent("Contents.json"))
    for (density, scale): (String, CGFloat) in [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)] {
        try png(art, scale: scale, destination: android.appendingPathComponent("drawable-\(density)/\(filename).png"))
    }
    print("\(name): \(art.width)×\(art.height) logical pixels; iOS1x/2x/3x, Android1x/1.5x/2x/3x/4x")
}
