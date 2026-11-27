//
//  ExtendedPublicKey.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 30.07.2021.
//  Copyright © 2021 Tangem AG. All rights reserved.
//

import Foundation
import CryptoKit

@available(iOS 13.0, *)
/// BIP32 extended public key for `secp256k1`.
public struct ExtendedPublicKey: Equatable, Hashable, JSONStringConvertible, Codable {
    /// Compressed `secp256k1` key
    public let publicKey: Data
    public let chainCode: Data
    
    public init(publicKey: Data, chainCode: Data) {
        self.publicKey = publicKey
        self.chainCode = chainCode
    }
    
    /// This function performs CKDpub((Kpar, cpar), i) → (Ki, ci) to compute a child extended public key from the parent extended public key.
    ///  It is only defined for non-hardened child keys. `secp256k1` only
    public func derivePublicKey(node: DerivationNode) throws -> ExtendedPublicKey {
        guard publicKey.count == 33 else { //secp256k1 only
            throw TangemSdkError.unsupportedCurve
        }
        
        let index = node.index
        
        //We can derive only non-hardened keys
        guard index < BIP32.Constants.hardenedOffset else {
            throw HDWalletError.hardenedNotSupported
        }
        
        //let I = HMAC-SHA512(Key = cpar, Data = serP(Kpar) || ser32(i)).
        let data = publicKey + index.bytes4
        let hmac = HMAC<SHA512>.authenticationCode(for: data, using: SymmetricKey(data: chainCode))
        let digest = Data(hmac)
        
        let secp256k1 = Secp256k1Utils()
        let ki = try secp256k1.createPublicKey(privateKey: digest[0..<32], compressed: true)
        let derivedPublicKey = try secp256k1.sum(compressedPubKey1: ki, compressedPubKey2: publicKey)
        let derivedChainCode = digest[32..<64]
        return ExtendedPublicKey(publicKey: derivedPublicKey, chainCode: derivedChainCode)
    }
    
    /// This function performs CKDpub((Kpar, cpar), i) → (Ki, ci) to compute a child extended public key from the parent extended public key.
    ///  It is only defined for non-hardened child keys. `secp256k1` only
    public func derivePublicKey(path derivationPath: DerivationPath) throws -> ExtendedPublicKey {
        var key: ExtendedPublicKey = self
        
        for node in derivationPath.nodes {
            key = try key.derivePublicKey(node: node)
        }
        
        return key
    }
}
