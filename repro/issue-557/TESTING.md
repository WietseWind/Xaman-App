# Android fold handover — #557

Review [PR #561](https://github.com/WietseWind/Xaman-App/pull/561) against the one-phone-column decisions in
[#544](https://github.com/WietseWind/Xaman-App/issues/544). The PR targets `release/5.5.0`, build 561.
Use a new native Android build. An OTA update alone cannot enable the window behaviour.

The separate [SDK recovery PR #560](https://github.com/WietseWind/Xaman-App/pull/560) preserves the pinned Tangem
files and checks clean recovery. Review and merge that build change before making a clean build of #561.
Neither PR has been merged by this task.

## Device check

Record the Galaxy model, Android version, One UI version, app build, font size and navigation mode. Check whether
the public hinge feature or sensor exists. Early Galaxy Fold models can lack this interface even after an OS
update; the new fold layout does not activate there. Do not treat the emulator as proof for those models.

Use a spare, unfunded test account. Keep secrets, passcodes and device IDs out of screenshots and issue logs.

## Required hardware checks

| Flow | Actions | Pass condition |
|---|---|---|
| Cover | Cold start, unlock, open all five native tab controls | Phone layout fits; every control responds |
| Inner | Cold start while open, unlock, visit Home and Settings | One phone column; no stretched content or Android restart control |
| Live fold | Open and close on Home, Settings and a sheet | Same account and screen; no input or draft loss |
| Rotation | Turn the open device in each supported direction | Content and native tabs share one column; no clipped controls |
| Cold landscape → portrait | Start on the short landscape cover, return to portrait, unfold, open another stack screen and return Home | Phone column and native tab width restore; no retained landscape height |
| Split left/right | Use Android's split action; resize and swap both panes | Column fits inside the app pane; no late width from a hidden screen |
| Return to full | Leave split with another stack screen open, then return Home | Full width and native tabs restore |
| Sheets | Open network/account sheets; tap free area, drag down, Cancel/Back | Backdrop covers the full app window; only the intended sheet closes |
| Lock | Lock while open or in split; tap the free area and tab positions | Nothing behind Lock responds; correct passcode restores the screen |
| PIN state | Start PIN entry, swap split sides, finish | Entered digits remain; no reset or incorrect unlock |
| Keyboard | Open Add Contact full size; enter safe draft, resize, focus bottom tag | Field stays above the real keyboard; draft remains; Cancel saves nothing |
| Refocus | While keyboard is open, move Name → destination tag; dismiss it | Focused field stays visible; padding clears after hide |
| Fresh split form | Enter split first, open Add Contact, focus Name only, then swipe to the bottom tag with the same keyboard open | Scroll range exists before a lower field has focus; Name does not jump; tag is reachable; Cancel saves nothing |
| First overlay tap | Enter real split, open the tag sheet or empty PIN sheet, then press Cancel before touching any input | Cancel works on the first tap; no second tap is needed |
| Tag/password overlays | In split, open the tag sheet and empty password/Vault forms; focus fields, dismiss keyboard, Cancel | Inputs and Cancel remain usable; no late jump or action after close |
| Token filter | Home → token filter → Search; type, resize, hide keyboard, close and reopen; then Add Token/Reorder | Search remains visible; filter actions and first action after close still run once |
| Return with keyboard | Keep the same form open, return from split to full size, focus the bottom tag | Field remains above the keyboard; no draft loss |
| Fast close/resize | Close or resize during keyboard entry and sheet movement; background/resume | No late jump, reopened sheet, hidden input cover or background callback |
| Theme | Unfold, switch Light → Dark → Light without restarting | Native tab background and labels remain readable |
| Text/navigation | Test larger text and three-button navigation; then restore settings | Buttons remain reachable; bottom inset is applied once |
| Camera | Open QR scanner, allow/deny permission, background/resume, lock/unlock, Close | Correct permission flow; scanner or Home stays usable |
| Sensitive flows | Passcode change/restore and authentication on a test account | Full-window input cover; no taps reach the underlying screen |
| Regular phone | Repeat ordinary full-screen navigation and keyboard flows | Existing layout and behaviour remain correct |

## Audit points

| Area | Review |
|---|---|
| Hardware gate | Positive public hinge capability, process-stable phone model, no model-name or aspect-ratio guess |
| Resizing | Same screen instance and state across changes; native tabs use the global window width |
| Blur | Bounded bitmap; correct input positions; React controls excluded from capture |
| Keyboard | Current window coordinates, transformed input height, stale-request cancellation, old-native fallback; invisible observer window cannot receive touches |
| Theme | Opaque native tab background follows live theme; transparent/default paths retain existing behaviour |
| Compatibility | Ordinary Android full-size and iOS paths keep their existing formulas and keyboard protocol |
| SDK recovery | Clean checkout/npm ci/Pod cleanup can recover pinned files; corruption fails clearly |

## Scope and known limits

The committed gallery and validation report state the exact APK/source for each test stage. Native tests use
Android emulators and Debug builds. Direct tag/password overlay checks use programmatic entry into production
components with synthetic public data; they are not end-to-end Send or signing tests. They do not establish Samsung One UI, physical hinge/camera/NFC behaviour,
funded transaction results, iOS app behaviour or Release performance.

An existing developer Reload registration warning was reproduced with the unchanged baseline APK and frozen
baseline JavaScript. It is not a clean Reload pass. A process kill removed the Android split task, so cold-process
startup while still in split remains unproven. Rapid live font/navigation changes also need a controlled hardware
check; cold startup with OS font scale 1.3 and three-button navigation was tested. The app retains its existing native font-scale override of 1.0; this is not proof of larger app text.

Keep #557 open until the target Galaxy hardware checks are recorded. For a failure, add the exact build, model,
OS, prior screen, fold/split sequence and a safe screenshot. Link the relevant commit in #561 or #560.
