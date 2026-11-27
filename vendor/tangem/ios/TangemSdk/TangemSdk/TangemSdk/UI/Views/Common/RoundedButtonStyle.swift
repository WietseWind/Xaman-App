//
//  RoundedButtonStyle.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 13.08.2021.
//  Copyright © 2021 Tangem AG. All rights reserved.
//

import Foundation
import SwiftUI

@available(iOS 13.0, *)
struct RoundedButton: ButtonStyle {
    var colors: TangemSdkStyle.ButtonColors
    var isDisabled: Bool = false
    var isLoading: Bool = false
    
    var height: CGFloat = 50
    
    private var foregroundColor: Color {
        isDisabled ? colors.disabledForegroundColor : colors.foregroundColor
    }
    
    private var backgroundColor: Color {
        isDisabled ? colors.disabledBackgroundColor : colors.backgroundColor
    }
    
    @ViewBuilder private var loadingOverlay: some View {
        if isLoading  {
            ZStack {
                colors.backgroundColor
                if #available(iOS 14.0, *) {
                    ActivityIndicatorView(color: colors.foregroundColor)
                } else {
                    ActivityIndicatorView()
                }
            }
        } else {
            Color.clear
        }
    }
    
    func makeBody(configuration: Configuration) -> some View {
        HStack {
            Spacer()
            configuration.label
            Spacer()
        }
        .frame(height: height)
        .padding(.horizontal, 10)
        .font(.system(size: 17, weight: .semibold, design: .default))
        .foregroundColor(foregroundColor)
        .background(backgroundColor)
        .overlay(loadingOverlay)
        .cornerRadius(8)
        .allowsHitTesting(!isDisabled && !isLoading)
        .animation(.easeInOut(duration: 0.2))
    }
}

@available(iOS 13.0, *)
struct RoundedButton_Previews: PreviewProvider {
    
    @ViewBuilder
    static func buttons(for buttonColors: TangemSdkStyle.ButtonColors) -> some View {
        VStack {
            Button("Continue", action: {})
                .buttonStyle(RoundedButton(colors: buttonColors,
                                           isDisabled: false,
                                           isLoading: false))
            Button("Continue", action: {})
                .buttonStyle(RoundedButton(colors: buttonColors,
                                           isDisabled: false,
                                           isLoading: true))
            
            Button("Continue", action: {})
                .buttonStyle(RoundedButton(colors: buttonColors,
                                           isDisabled: true,
                                           isLoading: false))
            
            Button("Continue", action: {})
                .buttonStyle(RoundedButton(colors: buttonColors,
                                           isDisabled: true,
                                           isLoading: true))
        }
    }
    
    static var buttonGroup: some View {
        VStack(spacing: 80) {
            let style = TangemSdkStyle()
            
            buttons(for: style.colors.buttonColors)
            
            buttons(for: style.colors.secondaryButtonColors)
        }
        .padding()
    }
    
    static var previews: some View {
        Group {
            buttonGroup
            
            buttonGroup
                .preferredColorScheme(.dark)
        }
    }
}
