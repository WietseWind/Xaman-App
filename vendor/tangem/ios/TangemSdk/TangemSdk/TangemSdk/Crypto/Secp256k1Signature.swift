//
//  Secp256k1Signature.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 22.12.2021.
//  Copyright © 2021 Tangem AG. All rights reserved.
//

import Foundation
import TangemSdk_secp256k1

@available(iOS 13.0, *)
public struct Secp256k1Signature {
    private let secp256k1 = Secp256k1Utils()
    private let rawSig: secp256k1_ecdsa_signature
    
    public init(with data: Data) throws {
        rawSig = try secp256k1.parseNormalize(data)
    }
    
    public func normalize() throws -> Data {
        var sig = rawSig
        return try secp256k1.serializeSignature(&sig)
    }
    
    public func serializeDer() throws -> Data {
        var sig = rawSig
        return try secp256k1.serializeDer(&sig)
    }
    
    /// Verify with sha256 hash function
    public func verify(with publicKey: Data, message: Data) throws -> Bool {
        return try verify(with: publicKey, hash: message.getSha256())
    }
    
    public func verify(with publicKey: Data, hash: Data) throws -> Bool {
        var sig = rawSig
        return try secp256k1.verifySignature(&sig, publicKey: publicKey, hash: hash)
    }
    
    public func unmarshal(with publicKey: Data, hash: Data) throws -> (v: Data, r: Data, s: Data) {
        var sig = rawSig
        return try secp256k1.unmarshalSignature(&sig, publicKey: publicKey, hash: hash)
    }
}
