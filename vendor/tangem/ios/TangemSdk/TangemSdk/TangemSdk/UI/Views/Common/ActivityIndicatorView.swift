//
//  ActivityIndicatorView.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 13.08.2021.
//  Copyright © 2021 Tangem AG. All rights reserved.
//

import Foundation
import SwiftUI

@available(iOS 13.0, *)
struct ActivityIndicatorView: UIViewRepresentable {
    private var isAnimating: Bool
    private var style: UIActivityIndicatorView.Style
    private var color: UIColor
    
    init(isAnimating: Bool = true, style: UIActivityIndicatorView.Style = .medium, color: UIColor = .white) {
        self.isAnimating = isAnimating
        self.style = style
        self.color = color
    }
    
    @available(iOS 14.0, *)
    init(isAnimating: Bool = true, style: UIActivityIndicatorView.Style = .medium, color: Color) {
        self.isAnimating = isAnimating
        self.style = style
        self.color = UIColor(color)
    }
    
    func makeUIView(context: UIViewRepresentableContext<ActivityIndicatorView>) -> UIActivityIndicatorView {
        let indicator = UIActivityIndicatorView(style: style)
        indicator.color = color
        return indicator
    }

    func updateUIView(_ uiView: UIActivityIndicatorView, context: UIViewRepresentableContext<ActivityIndicatorView>) {
        isAnimating ? uiView.startAnimating() : uiView.stopAnimating()
    }
}
