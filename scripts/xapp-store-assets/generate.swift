#!/usr/bin/env swift
// SVG to native PNG. Uses only macOS Foundation/CoreGraphics/ImageIO.
// Run with --output-root /path/to/repo to write native assets there.
// Without that argument, output stays beside this script under output/.
import Foundation
import CoreGraphics
import ImageIO

struct Asset: Decodable {
    let file: String
    let logical_width: Int
    let logical_height: Int
    let catalog: String
    let ios_logical_width: Int?
    let ios_logical_height: Int?
    let android_logical_width: Int?
    let android_logical_height: Int?
    let paint_width: CGFloat?
    let paint_height: CGFloat?
    let native_stroke_width: CGFloat?
    let ios_filenames: [String: String]?
}

struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

struct Node {
    let name: String
    let attributes: [String: String]
}

final class SVG: NSObject, XMLParserDelegate {
    var nodes: [Node] = []
    var stops: [(CGFloat, CGFloat)] = []
    var strokeWidth: CGFloat = 1.7
    var width: CGFloat = 0
    var height: CGFloat = 0
    var color = "000000"
    var unsupported: String?

    func parser(_ parser: XMLParser, didStartElement name: String,
                namespaceURI: String?, qualifiedName: String?, attributes: [String: String]) {
        if attributes["transform"] != nil {
            unsupported = "SVG transforms require explicit converter support"; parser.abortParsing(); return
        }
        switch name {
        case "svg":
            width = CGFloat(Double(attributes["width"] ?? "0") ?? 0)
            height = CGFloat(Double(attributes["height"] ?? "0") ?? 0)
            strokeWidth = CGFloat(Double(attributes["stroke-width"] ?? "1.7") ?? 1.7)
            if let stroke = attributes["stroke"], stroke.hasPrefix("#") {
                color = String(stroke.dropFirst())
            }
        case "stop":
            let offset = attributes["offset"] ?? "0"
            let fraction = offset.hasSuffix("%")
                ? (Double(offset.dropLast()) ?? 0) / 100 : Double(offset) ?? 0
            stops.append((CGFloat(fraction), CGFloat(Double(attributes["stop-opacity"] ?? "1") ?? 1)))
        case "path", "line", "polyline", "polygon", "rect", "circle", "ellipse":
            nodes.append(Node(name: name, attributes: attributes))
        case "defs", "linearGradient", "title": break
        default: unsupported = "Unsupported SVG element: \(name)"; parser.abortParsing()
        }
    }
}

// SVG elliptical endpoint arcs, converted to cubic segments of at most 90°.
func arc(_ path: CGMutablePath, from start: CGPoint, to end: CGPoint,
         rx rawRX: CGFloat, ry rawRY: CGFloat, rotation: CGFloat,
         large: Bool, sweep: Bool) {
    if start == end { return }
    var rx = abs(rawRX), ry = abs(rawRY)
    if rx == 0 || ry == 0 { path.addLine(to: end); return }
    let phi = rotation * .pi / 180, cosine = cos(phi), sine = sin(phi)
    let halfX = (start.x - end.x) / 2, halfY = (start.y - end.y) / 2
    let x = cosine * halfX + sine * halfY, y = -sine * halfX + cosine * halfY
    let fit = x * x / (rx * rx) + y * y / (ry * ry)
    if fit > 1 { rx *= sqrt(fit); ry *= sqrt(fit) }
    let denominator = rx * rx * y * y + ry * ry * x * x
    let numerator = max(0, rx * rx * ry * ry - denominator)
    let coefficient: CGFloat = (large == sweep ? -1 : 1) * sqrt(numerator / denominator)
    let centerX = coefficient * rx * y / ry, centerY = -coefficient * ry * x / rx
    let cx = cosine * centerX - sine * centerY + (start.x + end.x) / 2
    let cy = sine * centerX + cosine * centerY + (start.y + end.y) / 2
    let ux = (x - centerX) / rx, uy = (y - centerY) / ry
    let vx = (-x - centerX) / rx, vy = (-y - centerY) / ry
    let begin = atan2(uy, ux)
    var delta = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    if !sweep && delta > 0 { delta -= 2 * .pi }
    if sweep && delta < 0 { delta += 2 * .pi }
    let pieces = max(1, Int(ceil(abs(delta) / (.pi / 2))))
    let step = delta / CGFloat(pieces)
    func point(_ angle: CGFloat) -> CGPoint {
        CGPoint(x: cx + rx * cosine * cos(angle) - ry * sine * sin(angle),
                y: cy + rx * sine * cos(angle) + ry * cosine * sin(angle))
    }
    func tangent(_ angle: CGFloat) -> CGPoint {
        CGPoint(x: -rx * cosine * sin(angle) - ry * sine * cos(angle),
                y: -rx * sine * sin(angle) + ry * cosine * cos(angle))
    }
    for piece in 0..<pieces {
        let a = begin + CGFloat(piece) * step, b = a + step
        let first = point(a), last = piece == pieces - 1 ? end : point(b)
        let firstTangent = tangent(a), lastTangent = tangent(b)
        let factor = 4 / 3 * tan(step / 4)
        path.addCurve(to: last,
            control1: CGPoint(x: first.x + factor * firstTangent.x, y: first.y + factor * firstTangent.y),
            control2: CGPoint(x: last.x - factor * lastTangent.x, y: last.y - factor * lastTangent.y))
    }
}

func tokens(_ source: String) -> [String] {
    let pattern = "[a-zA-Z]|[-+]?(?:[0-9]*\\.[0-9]+|[0-9]+\\.?[0-9]*)(?:[eE][-+]?[0-9]+)?"
    let regex = try! NSRegularExpression(pattern: pattern)
    return regex.matches(in: source, range: NSRange(source.startIndex..., in: source)).map {
        String(source[Range($0.range, in: source)!])
    }
}

func svgPath(_ source: String) throws -> CGPath {
    let values = tokens(source), path = CGMutablePath()
    var index = 0, command = "", current = CGPoint.zero, beginning = CGPoint.zero
    func number() throws -> CGFloat {
        guard index < values.count, let value = Double(values[index]) else {
            throw Failure("Missing coordinate for SVG command \(command)")
        }
        index += 1
        return CGFloat(value)
    }
    func point(_ relative: Bool) throws -> CGPoint {
        let x = try number(), y = try number()
        return CGPoint(x: x + (relative ? current.x : 0), y: y + (relative ? current.y : 0))
    }
    while index < values.count {
        if Double(values[index]) == nil { command = values[index]; index += 1 }
        let relative = command == command.lowercased()
        switch command.uppercased() {
        case "M":
            current = try point(relative); beginning = current; path.move(to: current)
            command = relative ? "l" : "L"
        case "L": current = try point(relative); path.addLine(to: current)
        case "H": current.x = try number() + (relative ? current.x : 0); path.addLine(to: current)
        case "V": current.y = try number() + (relative ? current.y : 0); path.addLine(to: current)
        case "C":
            let first = try point(relative), second = try point(relative), end = try point(relative)
            path.addCurve(to: end, control1: first, control2: second); current = end
        case "Q":
            let control = try point(relative), end = try point(relative)
            path.addQuadCurve(to: end, control: control); current = end
        case "A":
            let rx = try number(), ry = try number(), rotation = try number()
            let large = try number() != 0, sweep = try number() != 0, end = try point(relative)
            arc(path, from: current, to: end, rx: rx, ry: ry, rotation: rotation, large: large, sweep: sweep)
            current = end
        case "Z": path.closeSubpath(); current = beginning; command = ""
        default: throw Failure("Unsupported SVG command: \(command)")
        }
    }
    return path
}

func shape(_ node: Node) throws -> CGPath {
    let a = node.attributes
    func value(_ name: String, _ fallback: CGFloat = 0) -> CGFloat {
        a[name].flatMap(Double.init).map { CGFloat($0) } ?? fallback
    }
    switch node.name {
    case "path": return try svgPath(a["d"] ?? "")
    case "line":
        let p = CGMutablePath(); p.move(to: CGPoint(x: value("x1"), y: value("y1")))
        p.addLine(to: CGPoint(x: value("x2"), y: value("y2"))); return p
    case "polyline", "polygon":
        let points = tokens(a["points"] ?? "").compactMap(Double.init)
        guard points.count >= 2 && points.count % 2 == 0 else { throw Failure("Invalid SVG points") }
        let p = CGMutablePath(); p.move(to: CGPoint(x: points[0], y: points[1]))
        for index in stride(from: 2, to: points.count, by: 2) {
            p.addLine(to: CGPoint(x: points[index], y: points[index + 1]))
        }
        if node.name == "polygon" { p.closeSubpath() }; return p
    case "circle", "ellipse":
        let rx = value("rx", value("r")), ry = value("ry", value("r"))
        return CGPath(ellipseIn: CGRect(x: value("cx") - rx, y: value("cy") - ry,
                                       width: rx * 2, height: ry * 2), transform: nil)
    case "rect":
        let rect = CGRect(x: value("x"), y: value("y"), width: value("width"), height: value("height"))
        return CGPath(roundedRect: rect, cornerWidth: value("rx"), cornerHeight: value("ry", value("rx")), transform: nil)
    default: throw Failure("Unsupported SVG element: \(node.name)")
    }
}

func png(_ document: SVG, asset: Asset, width logicalWidth: Int, height logicalHeight: Int,
         scale: CGFloat, destination: URL) throws {
    let width = Int(CGFloat(logicalWidth) * scale), height = Int(CGFloat(logicalHeight) * scale)
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw Failure("Bitmap allocation failed") }
    context.translateBy(x: 0, y: CGFloat(height)); context.scaleBy(x: scale, y: -scale)
    context.setLineCap(.round); context.setLineJoin(.round)
    let rgb = UInt32(document.color, radix: 16) ?? 0
    let color = CGColor(srgbRed: CGFloat((rgb >> 16) & 255) / 255,
        green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1)
    context.setStrokeColor(color); context.setFillColor(color)
    if !document.stops.isEmpty {
        // Write the alpha mask directly. CoreGraphics gradient dithering would
        // introduce horizontal/noisy alpha differences in this narrow template.
        let pixels = context.data!.assumingMemoryBound(to: UInt8.self)
        for y in 0..<height {
            let position = CGFloat(y) / CGFloat(max(1, height - 1))
            var opacity = document.stops.last!.1
            for index in 1..<document.stops.count where position <= document.stops[index].0 {
                let before = document.stops[index - 1], after = document.stops[index]
                let fraction = (position - before.0) / (after.0 - before.0)
                opacity = before.1 + fraction * (after.1 - before.1); break
            }
            let alpha = UInt8((min(1, max(0, opacity)) * 255).rounded())
            for x in 0..<width {
                let index = (y * width + x) * 4
                pixels[index] = 0; pixels[index + 1] = 0; pixels[index + 2] = 0; pixels[index + 3] = alpha
            }
        }
    } else {
        let paths = try document.nodes.map(shape)
        if let paintWidth = asset.paint_width, let paintHeight = asset.paint_height,
           let nativeStroke = asset.native_stroke_width {
            // The existing dock sizes assume64pt iOS/48dp Android canvases and
            // about43pt of painted height. Retain that contract for the new glyphs.
            let ratio = CGFloat(logicalWidth) / CGFloat(asset.ios_logical_width ?? logicalWidth)
            let bounds = paths.reduce(CGRect.null) { $0.union($1.boundingBoxOfPath) }
            let stroke = nativeStroke * ratio
            let fit = min((paintWidth * ratio - stroke) / bounds.width,
                          (paintHeight * ratio - stroke) / bounds.height)
            context.translateBy(x: (CGFloat(logicalWidth) - bounds.width * fit) / 2 - bounds.minX * fit,
                                y: (CGFloat(logicalHeight) - bounds.height * fit) / 2 - bounds.minY * fit)
            context.scaleBy(x: fit, y: fit); context.setLineWidth(stroke / fit)
        } else {
            context.scaleBy(x: CGFloat(logicalWidth) / document.width,
                            y: CGFloat(logicalHeight) / document.height)
            context.setLineWidth(document.strokeWidth)
        }
        for path in paths {
            context.addPath(path); context.strokePath()
        }
    }
    guard let image = context.makeImage(),
          let output = CGImageDestinationCreateWithURL(destination as CFURL, "public.png" as CFString, 1, nil) else {
        throw Failure("PNG output allocation failed")
    }
    CGImageDestinationAddImage(output, image, nil)
    if !CGImageDestinationFinalize(output) { throw Failure("PNG export failed: \(destination.path)") }
}

func run() throws {
    let source = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
    let args = CommandLine.arguments
    let output: URL
    if let option = args.firstIndex(of: "--output-root"), option + 1 < args.count {
        output = URL(fileURLWithPath: args[option + 1])
    } else { output = source.appendingPathComponent("output") }
    let mapping = try JSONDecoder().decode([String: Asset].self,
        from: Data(contentsOf: source.appendingPathComponent("asset-map.json")))
    var count = 0
    for name in mapping.keys.sorted() {
        let asset = mapping[name]!, document = SVG()
        let parser = XMLParser(data: try Data(contentsOf: source.appendingPathComponent("svg/\(asset.file).svg")))
        parser.delegate = document
        guard parser.parse(), document.width == CGFloat(asset.logical_width),
              document.height == CGFloat(asset.logical_height) else {
            throw Failure("Invalid SVG: \(asset.file): \(document.unsupported ?? parser.parserError?.localizedDescription ?? "dimensions")")
        }
        let catalog = output.appendingPathComponent("ios/Xaman/Images.xcassets/\(asset.catalog)/\(name).imageset")
        try FileManager.default.createDirectory(at: catalog, withIntermediateDirectories: true)
        var entries: [[String: String]] = []
        for scale in 1...3 {
            let file = asset.ios_filenames?["\(scale)x"] ?? "\(asset.file)@\(scale)x.png"
            try png(document, asset: asset, width: asset.ios_logical_width ?? asset.logical_width,
                    height: asset.ios_logical_height ?? asset.logical_height,
                    scale: CGFloat(scale), destination: catalog.appendingPathComponent(file))
            entries.append(["idiom": "universal", "filename": file, "scale": "\(scale)x"]); count += 1
        }
        let contents: [String: Any] = ["images": entries, "info": ["author": "xcode", "version": 1]]
        let contentsURL = catalog.appendingPathComponent("Contents.json")
        let previous = (try? Data(contentsOf: contentsURL))
            .flatMap { try? JSONSerialization.jsonObject(with: $0) } as? NSDictionary
        if previous?.isEqual(to: contents) != true {
            try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
                .write(to: contentsURL)
        }
        for (density, scale): (String, CGFloat) in [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)] {
            let folder = output.appendingPathComponent("android/app/src/main/res/drawable-\(density)")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try png(document, asset: asset, width: asset.android_logical_width ?? asset.logical_width,
                    height: asset.android_logical_height ?? asset.logical_height,
                    scale: scale, destination: folder.appendingPathComponent("\(asset.file).png")); count += 1
        }
    }
    print("Exported \(mapping.count) SVG assets as \(count) native PNGs under \(output.path)")
}

do { try run() } catch { fputs("Asset export failed: \(error)\n", stderr); exit(1) }
