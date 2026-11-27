//
//  KeyboardAdaptive.swift
//  KeyboardAvoidanceSwiftUI
//
//  Created by Vadim Bulavin on 3/27/20.
//  Copyright © 2020 Vadim Bulavin. All rights reserved.
//

import SwiftUI
import Combine

@available(iOS 13.0, *)
struct KeyboardAdaptive: ViewModifier {
    @State private var bottomPadding: CGFloat = 0
    @State private var animationDuration: Double = 0
    var animated: Binding<Bool>
    
    func body(content: Content) -> some View {
            content
                .padding(.bottom, self.bottomPadding)
                .onReceive(Publishers.keyboardInfo) { keyboardHeight, animationDuration in
                    let bottomSafeAreaInset = keyboardHeight > 0 ? UIApplication.shared.windows.first?.safeAreaInsets.bottom ?? 0 : 0
                    self.animationDuration = animationDuration
                    self.bottomPadding = keyboardHeight - bottomSafeAreaInset
            }
                .animation(animated.wrappedValue ? Animation.easeOut(duration: animationDuration) : nil)
    }
}

@available(iOS 13.0, *)
extension View {
    @ViewBuilder
    func keyboardAdaptive(animated: Binding<Bool>) -> some View {
        if #available(iOS 14.0, *) {
            self
        } else {
            ModifiedContent(content: self, modifier: KeyboardAdaptive(animated: animated))
        }
    }
}
