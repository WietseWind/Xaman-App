//
//  StartBackupCardLinkingCommand.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 24.08.2021.
//  Copyright © 2021 Tangem AG. All rights reserved.
//

import Foundation


@available(iOS 13.0, *)
final class StartBackupCardLinkingCommand: Command {
    var requiresPasscode: Bool { return false }
    
    private let primaryCardLinkingKey: Data
    
    init(primaryCardLinkingKey: Data) {
        self.primaryCardLinkingKey = primaryCardLinkingKey
    }
    
    deinit {
        Log.debug("StartBackupCardLinkingCommand deinit")
    }
    
    func performPreCheck(_ card: Card) -> TangemSdkError? {
        if card.firmwareVersion < .backupAvailable {
            return .backupFailedFirmware
        }
        
        if !card.settings.isBackupAllowed {
            return .backupNotAllowed
        }
        
        if !card.wallets.isEmpty {
            return .backupFailedNotEmptyWallets
        }
        
        return nil
    }
    
    func serialize(with environment: SessionEnvironment) throws -> CommandApdu {
        let tlvBuilder = try createTlvBuilder(legacyMode: environment.legacyMode)
            .append(.pin, value: environment.accessCode.value)
            .append(.cardId, value: environment.card?.cardId)
            .append(.primaryCardLinkingKey, value: primaryCardLinkingKey)
        
        return CommandApdu(.startBackupCardLinking, tlv: tlvBuilder.serialize())
    }
    
    func deserialize(with environment: SessionEnvironment, from apdu: ResponseApdu) throws -> RawBackupCard {
        guard let tlv = apdu.getTlvData(encryptionKey: environment.encryptionKey) else {
            throw TangemSdkError.deserializeApduFailed
        }
        
        guard let cardKey = environment.card?.cardPublicKey else {
            throw TangemSdkError.unknownError
        }
        
        let decoder = TlvDecoder(tlv: tlv)
        
        return RawBackupCard(cardId: try decoder.decode(.cardId),
                             cardPublicKey: cardKey,
                             linkingKey: try decoder.decode(.backupCardLinkingKey),
                             attestSignature: try decoder.decode(.cardSignature))
    }
}
