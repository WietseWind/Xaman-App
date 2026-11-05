//
//  XamanOta.swift
//  Xaman
//
//  Over-the-air JS updates. Starts expo-updates for the Objective-C app delegate, which
//  creates the React Native bridge itself (react-native-navigation), and keeps the
//  device-side safety net: revert to the store version, a launch watchdog and a list of
//  updates this device refuses.
//

import Foundation
import EXUpdates
import EXManifests

@objc(XamanOta)
public final class XamanOta: NSObject {
  /// Launches of the same downloaded update that may end without `markHealthy` before the
  /// next launch reverts to the store version.
  @objc public static let watchdogLimit = 3
  @objc public static let embeddedUpdateId = "embedded"

  private enum Key {
    static let revertPending = "XamanOtaRevertPending"
    static let blocked = "XamanOtaBlockedUpdateIds"
    static let blockedOtaIds = "XamanOtaBlockedOtaIds"
    static let lastLaunch = "XamanOtaLastLaunchUpdateId"
    static let lastLaunchOtaId = "XamanOtaLastLaunchOtaId"
    static let unhealthyLaunches = "XamanOtaUnhealthyLaunches"
    static let reverted = "XamanOtaRevertedUpdateId"
  }

  private static var defaults: UserDefaults { UserDefaults.standard }
  private static var onStart: ((Bool) -> Void)?
  private static let delegateProxy = DelegateProxy()

  private final class DelegateProxy: NSObject, AppControllerDelegate {
    func appController(_ appController: AppControllerInterface, didStartWithSuccess success: Bool) {
      let callback = XamanOta.onStart
      XamanOta.onStart = nil
      callback?(success)
    }
  }

  // MARK: - Startup (app delegate)

  /// Must run before `start`. Wipes every downloaded update when a revert is pending or the
  /// watchdog tripped, so expo-updates launches the bundle that shipped with the app.
  @objc public static func prepareBeforeStart() {
    let last = defaults.string(forKey: Key.lastLaunch) ?? embeddedUpdateId
    let watchdogTripped = last != embeddedUpdateId
      && defaults.integer(forKey: Key.unhealthyLaunches) >= watchdogLimit
    guard defaults.bool(forKey: Key.revertPending) || watchdogTripped else {
      return
    }
    if watchdogTripped {
      block(last, otaId: defaults.integer(forKey: Key.lastLaunchOtaId))
      defaults.set(last, forKey: Key.reverted)
    }
    if let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).last {
      // expo-updates keeps its database and all downloaded updates in this folder
      try? FileManager.default.removeItem(at: support.appendingPathComponent(".expo-internal"))
    }
    defaults.set(false, forKey: Key.revertPending)
    defaults.set(0, forKey: Key.unhealthyLaunches)
    defaults.set(embeddedUpdateId, forKey: Key.lastLaunch)
    persist()
  }

  /// UserDefaults writes reach disk asynchronously; a bundle that crashes seconds after launch
  /// would lose them, and with them the watchdog count. Flush every write that matters.
  private static func persist() {
    defaults.synchronize()
  }

  /// Initializes and starts expo-updates. `onReady` runs on the main queue once the bundle
  /// to launch is known; also in Debug, where expo-updates is disabled.
  @objc public static func start(_ onReady: @escaping (Bool) -> Void) {
    onStart = onReady
    AppController.initializeWithoutStarting()
    let controller = AppController.sharedInstance
    controller.delegate = delegateProxy
    controller.start()
  }

  /// The JS bundle to run, or nil for the bundle shipped with the app. Ask on every bridge
  /// (re)load: `Updates.reloadAsync` switches it.
  @objc public static func launchAssetUrl() -> URL? {
    guard AppController.isInitialized() else {
      return nil
    }
    return AppController.sharedInstance.launchAssetUrl()
  }

  /// Counts a launch for the watchdog. Call only when React Native starts for a screen: a process
  /// started in the background (silent push, background task) runs no JS and must not count.
  @objc public static func countLaunch() {
    let info = launchedUpdateInfo()
    let id = info["updateId"] as? String ?? embeddedUpdateId
    let last = defaults.string(forKey: Key.lastLaunch) ?? embeddedUpdateId
    if id == embeddedUpdateId {
      defaults.set(0, forKey: Key.unhealthyLaunches)
    } else if id == last {
      defaults.set(defaults.integer(forKey: Key.unhealthyLaunches) + 1, forKey: Key.unhealthyLaunches)
    } else {
      defaults.set(1, forKey: Key.unhealthyLaunches)
    }
    defaults.set(id, forKey: Key.lastLaunch)
    defaults.set((info["otaId"] as? NSNumber)?.intValue ?? 0, forKey: Key.lastLaunchOtaId)
    persist()
  }

  /// The update expo-updates picked for this launch: crash reporting and the version shown.
  @objc public static func launchedUpdateInfo() -> [String: Any] {
    var info: [String: Any] = ["updateId": embeddedUpdateId, "otaId": 0, "isEmbedded": true, "runtimeVersion": ""]
    guard AppController.isInitialized(), AppController.sharedInstance.isActiveController else {
      return info
    }
    // expo-updates 0.25 keeps the fields of UpdatesModuleConstants internal; read them by name.
    var launched: Update?
    var embedded: Update?
    for child in Mirror(reflecting: AppController.sharedInstance.getConstantsForModule()).children {
      switch child.label {
      case "launchedUpdate": launched = child.value as? Update
      case "embeddedUpdate": embedded = child.value as? Update
      case "runtimeVersion": info["runtimeVersion"] = child.value as? String ?? ""
      default: break
      }
    }
    guard let update = launched, update.updateId != embedded?.updateId else {
      return info
    }
    info["updateId"] = update.updateId.uuidString.lowercased()
    info["isEmbedded"] = false
    let xaman = (update.manifest.rawManifestJSON()["extra"] as? [String: Any])?["xaman"] as? [String: Any]
    if let otaId = xaman?["otaId"] as? NSNumber {
      info["otaId"] = otaId
    }
    return info
  }

  // MARK: - From JS (OtaRecoveryModule)

  /// The running bundle reached a usable screen: reset the watchdog.
  @objc public static func markHealthy() {
    defaults.set(0, forKey: Key.unhealthyLaunches)
    persist()
  }

  /// Revert to the store version on the next launch, and never accept `updateId` (or any other
  /// copy of update `otaId`) again.
  @objc public static func scheduleRevert(_ updateId: String?, otaId: Int) {
    if let updateId = updateId, !updateId.isEmpty, updateId != embeddedUpdateId {
      block(updateId, otaId: otaId)
      defaults.set(updateId, forKey: Key.reverted)
    }
    defaults.set(true, forKey: Key.revertPending)
    persist()
  }

  @objc public static func isRevertPending() -> Bool {
    return defaults.bool(forKey: Key.revertPending)
  }

  @objc public static func blockedUpdateIds() -> [String] {
    return defaults.stringArray(forKey: Key.blocked) ?? []
  }

  /// The same update can come back under a new uuid (a re-issued GA pointer): block its number too.
  @objc public static func blockedOtaIds() -> [Int] {
    return (defaults.array(forKey: Key.blockedOtaIds) as? [Int]) ?? []
  }

  @objc public static func unhealthyLaunches() -> Int {
    return defaults.integer(forKey: Key.unhealthyLaunches)
  }

  /// Launched by Detox: e2e runs test the build itself, not a published update.
  @objc public static func isAutomatedTest() -> Bool {
    return ProcessInfo.processInfo.arguments.contains("-detoxServer")
  }

  /// The update this device reverted since the last call, if any. Reported once.
  @objc public static func takeRevertedUpdateId() -> String? {
    let id = defaults.string(forKey: Key.reverted)
    defaults.removeObject(forKey: Key.reverted)
    persist()
    return id
  }

  private static func block(_ updateId: String, otaId: Int) {
    var ids = blockedUpdateIds().filter { $0 != updateId }
    ids.append(updateId)
    defaults.set(Array(ids.suffix(20)), forKey: Key.blocked)
    if otaId > 0 {
      var otaIds = blockedOtaIds().filter { $0 != otaId }
      otaIds.append(otaId)
      defaults.set(Array(otaIds.suffix(20)), forKey: Key.blockedOtaIds)
    }
  }
}
