//
//  TerminalKeysService.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 23.01.2020.
//  Copyright © 2020 Tangem AG. All rights reserved.
//

import Foundation

/// Service for manage keypair, used for Linked Terminal feature. Can be disabled by legacyMode or manually
@available(iOS 13.0, *)
public class TerminalKeysService {
    let secureStorage = SecureStorage()
    
    /// Retrieve generated keys from keychain if they exist. Generate new and store in Keychain otherwise
    public lazy var keys: KeyPair?  = {
        guard let privateKey = try? secureStorage.get(.terminalPrivateKey),
              let publicKey = try? secureStorage.get(.terminalPublicKey) else {
            
            if let newKeys = try? Secp256k1Utils().generateKeyPair() {
                try? secureStorage.store(newKeys.privateKey, forKey: .terminalPrivateKey)
                try? secureStorage.store(newKeys.publicKey, forKey: .terminalPublicKey)
                return newKeys
            }
            
            return nil
        }
        
        //migrate from old format
        if privateKey.count != 32, publicKey.count != 65,
           let decodedPrivateKey = try? NSKeyedUnarchiver.unarchiveTopLevelObjectWithData(privateKey) as? Data,
           let decodedPublicKey = try? NSKeyedUnarchiver.unarchiveTopLevelObjectWithData(publicKey) as? Data,
           decodedPrivateKey.count == 32, decodedPublicKey.count == 65 {
            return KeyPair(privateKey: decodedPrivateKey, publicKey: decodedPublicKey)
        }
        
        return KeyPair(privateKey: privateKey, publicKey: publicKey)
    }()
}
