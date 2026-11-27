//
//  StartPrimaryCardLinkingCommand.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 23.08.2021.
//  Copyright © 2021 Tangem AG. All rights reserved.
//

import Foundation

@available(iOS 13.0, *)
public final class StartPrimaryCardLinkingCommand: Command {
    var requiresPasscode: Bool { return false }
    
    public init() {}
    
    deinit {
        Log.debug("StartPrimaryCardLinkingCommand deinit")
    }
    
    func performPreCheck(_ card: Card) -> TangemSdkError? {
        if card.firmwareVersion < .backupAvailable {
            return .backupFailedFirmware
        }
        
        if !card.settings.isBackupAllowed {
            return .backupNotAllowed
        }
        
        if card.wallets.isEmpty {
            return .backupFailedEmptyWallets
        }
        
        return nil
    }
    
    func serialize(with environment: SessionEnvironment) throws -> CommandApdu {
        let tlvBuilder = try createTlvBuilder(legacyMode: environment.legacyMode)
            .append(.pin, value: environment.accessCode.value)
            .append(.cardId, value: environment.card?.cardId)
        
        return CommandApdu(.startPrimaryCardLinking, tlv: tlvBuilder.serialize())
    }
    
    func deserialize(with environment: SessionEnvironment, from apdu: ResponseApdu) throws -> RawPrimaryCard {
        guard let tlv = apdu.getTlvData(encryptionKey: environment.encryptionKey) else {
            throw TangemSdkError.deserializeApduFailed
        }
        
        let decoder = TlvDecoder(tlv: tlv)
        
        guard let cardPublicKey = environment.card?.cardPublicKey else {
            throw TangemSdkError.unknownError
        }
        
        guard let card = environment.card else {
            throw TangemSdkError.missingPreflightRead
        }
        
        return RawPrimaryCard(cardId: try decoder.decode(.cardId),
                              cardPublicKey: cardPublicKey,
                              linkingKey: try decoder.decode(.primaryCardLinkingKey),
                              existingWalletsCount: card.wallets.count,
                              isHDWalletAllowed: card.settings.isHDWalletAllowed,
                              issuer: card.issuer,
                              walletCurves: card.wallets.map { $0.curve },
                              batchId: card.batchId)
    }
}
