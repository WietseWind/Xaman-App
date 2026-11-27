//
//  StartPrimaryCardLinkingTask.swift
//  TangemSdk
//
//  Created by Alexander Osokin on 30.11.2021.
//  Copyright © 2021 Tangem AG. All rights reserved.
//

import Foundation
import Combine

@available(iOS 13.0, *)
public class StartPrimaryCardLinkingTask: CardSessionRunnable {
    public var shouldAskForAccessCode: Bool { false }
    
    private var attestationTask: AttestationTask? = nil
    private let onlineCardVerifier = OnlineCardVerifier()
    private var cancellable: AnyCancellable? = nil
    private var linkingCommand: StartPrimaryCardLinkingCommand? = nil
    
    public init() {}
    
    deinit {
        Log.debug("StartPrimaryCardLinkingTask deinit")
    }
    
    public func run(in session: CardSession, completion: @escaping CompletionResult<PrimaryCard>) {
        linkingCommand = StartPrimaryCardLinkingCommand()
        linkingCommand!.run(in: session) { result in
            switch result {
            case .success(let rawCard):
                self.loadIssuerSignature(rawCard, session, completion)
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }
    
    private func loadIssuerSignature(_ rawCard: RawPrimaryCard, _ session: CardSession, _ completion: @escaping CompletionResult<PrimaryCard>) {
        if session.environment.card?.firmwareVersion.type == .sdk {
            let issuerPrivateKey = Data(hexString: "11121314151617184771ED81F2BACF57479E4735EB1405083927372D40DA9E92")
            do {
                let issuerSignature = try rawCard.cardPublicKey.sign(privateKey: issuerPrivateKey)
                completion(.success(PrimaryCard(rawCard, issuerSignature: issuerSignature)))
            } catch {
                completion(.failure(error.toTangemSdkError()))
            }
            return
        }
        
        cancellable = onlineCardVerifier
            .getCardData(cardId: rawCard.cardId, cardPublicKey: rawCard.cardPublicKey)
            .sink(receiveCompletion: { receivedCompletion in
                if case .failure = receivedCompletion {
                    completion(.failure(.issuerSignatureLoadingFailed))
                }
            }, receiveValue: { response in
                guard let signature = response.issuerSignature else {
                    completion(.failure(.issuerSignatureLoadingFailed))
                    return
                }
                
                let primaryCard = PrimaryCard(rawCard, issuerSignature: signature)
                completion(.success(primaryCard))
            })
    }
}
