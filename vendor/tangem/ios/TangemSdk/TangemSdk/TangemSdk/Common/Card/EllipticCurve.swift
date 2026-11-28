//
//  EllipticCurve.swift
//  TangemSdk
//
//  Created by Andrew Son on 18/11/20.
//  Copyright © 2020 Tangem AG. All rights reserved.
//

import Foundation

/// Elliptic curve used for wallet key operations.
@available(iOS 13.0, *)
public enum EllipticCurve: String, StringCodable, CaseIterable {
    case secp256k1
    case ed25519
    case secp256r1
    case bls12381_G2
    case bls12381_G2_AUG
    case bls12381_G2_POP
}
