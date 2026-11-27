//
//  BIP32.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 04.08.2021.
//  Copyright © 2021 Tangem AG. All rights reserved.
//

import Foundation

struct BIP32 {
    enum Constants {
        static let hardenedOffset: UInt32 = .init(0x80000000)
        static let hardenedSymbol: String = "'"
        static let alternativeHardenedSymbol: String = "’"
        static let masterKeySymbol: String = "m"
        static let separatorSymbol: Character = "/"
    }
}

