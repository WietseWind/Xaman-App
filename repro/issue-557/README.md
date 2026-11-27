# Android fold evidence — #557

The fix keeps one phone column, its native tabs and full-window backdrops when Android folds, turns or enters
split mode. It follows [Duo #544](https://github.com/WietseWind/Xaman-App/issues/544). Work uses a separate full
folder copy and branch. The original `16kb` folder is unchanged.

| Revision | Build / purpose |
|---|---|
| Baseline `68a7e821cf2e77a65115e4e3c36f5507034d4d4a` | 5.5.0 (554), frozen APK and JavaScript |
| Native `8eb32fceb2446dc4a459eaf5d7f8ac70e8656591` | v6, 5.5.0 (561), ARM64 Android code 3176289, Debug |
| JavaScript `859a42bde67fc130ae95de45ede5ad815932acff` | Final live-height fix; native v6 inputs and APKs unchanged |
| Core gallery native `0ea9e1da4835b3d9b092e9b6c969663d49a67d5e` / JS `2bc5853b…` | v5 fold matrix; v6 adds the invisible observer touch policy |

The two v6 APKs have identical 32 DEX files and 55 native libraries. Their Metro-port resource differs so each
emulator has its own debugger connection. APK, runtime-bundle and photo hashes are in [validation.json](validation.json).
All photos are unedited native captures, reviewed before publication. Each photo has its test stage in that report.

## Before and after

| App window | Before | After (v5 core gallery) |
|---|---|---|
| Cover | [Phone layout fits](before-cover-home.png) | [Phone layout retained](after-cover-home.png) |
| Cold inner start | [Content stretches](before-cold-inner-home.png) | [One phone column](after-cold-inner-home.png) |
| Right split | [Android letterbox / expand control](before-split-right-home.png) | [Column and five native controls fit](after-split-right-home.png) |

Also see [left split](after-split-left-home.png), [live dark theme](after-live-dark-inner-home.png),
[retained tag and real keyboard](after-retained-tag-keyboard.png) and
[empty password field and real keyboard](after-password-keyboard.png).
The password image proves field visibility; Back hides the keyboard before Cancel.

These current v6 / JS859 photos show the two final fixes:

| Flow | Photo |
|---|---|
| Name → normal swipe → tag, same open keyboard | [Fresh split form](after-fresh-split-keyboard.png) |
| Same form → full size → hide/refocus, no extra scroll | [All fields remain visible](after-full-return-keyboard.png) |
| Untouched tag sheet → first Cancel | [Before the one Cancel tap](final-tag-before-first-cancel.png) |
| Home after IME/Cancel, physical origin restored | [Final inner Home](final-inner-home.png) |

## Validation

| Check | Result |
|---|---|
| Full Jest at JS859 | 4,041 passed; 60 snapshots passed; 7 existing skipped tests / 2 skipped suites |
| Adaptive-scroll checks | 66 passed; two lifecycle regressions fail with the old class |
| Actual-source Java host checks | 284 assertions: 118 window/tab/blur, 42 coordinates, 55 observer lifecycle, 44 configuration delta, 25 popup touch/lifecycle |
| TypeScript and normal commit checks | Passed |
| Lint | Zero errors; one context-value allocation warning in `androidWindowLayout` |
| Authentication/signing source audit | 17 existing methods byte-identical |
| Native/source integrity | APK hashes/certificates, restored dependency files and native inputs verified |

The Java harnesses compile production code against public-API/view doubles. They do not run Android's layout
engine. The emulator checks use actual rendering, native taps, Android's split action and the real keyboard.

| Fixed fault | Native result |
|---|---|
| Full startup configuration pinned the landscape window | Same-process short → portrait cover → inner reports the actual window and correct column |
| Early IME event had an unfinished inset | Independent geometry observer corrects the field on the settled frame |
| Fresh Name focus left no manual scroll range | A normal swipe reaches Tag with the same keyboard open; Name does not jump |
| Invisible height popup took the first touch | First Cancel works in production Tag and the empty PIN component host; first Tag input touch opens the keyboard |
| Split-created form kept its startup height after full return | Hide/refocus leaves Tag in place; the old code moved it 522 px unnecessarily |

The popup can be disposed after a successful close: the last keyboard listener owns its cleanup. Its old failure
was different: the first tap removed the popup while the sheet stayed open and received no React Native touch.
That capture pattern was also measured on the unchanged baseline in OS-forced split mode. The baseline panel was
offscreen there, so this is a native-window control, not a baseline functional Cancel pass.

Direct tag/password/filter entry is programmatic where the unfunded test account cannot enter a normal Send or
signing flow. Vault method hosts use a synthetic MethodsContext and inert callbacks. No password or PIN digit,
authentication or signing action is used in those component checks. Vault's passcode uses its real custom numeric
pad, not the native IME. Where needed, Android Back hides the keyboard before actual Cancel.

## Profiles and test stages

| Profile | Evidence |
|---|---|
| Narrow fold | Android 16 stock Pixel Fold display/state mechanism; cover 884 × 2208, inner 1768 × 2208, 420 dpi |
| Stock Pixel Fold | Unmodified 2208 × 1840 inner display; fresh cold-inner setup through empty Home at the earlier stage |
| Regular Pixel 7 | Android 16, 1080 × 2400, 420 dpi; before/after comparison and real split/keyboard checks |

The narrow profile uses genuine separate displays. Its vendor hinge overlay retains the stock Pixel Fold
position. Split uses Recents → Split beside Android Settings and the real divider. No forced task bounds,
crops or mirrored photos are used.

The broad matrix first ran with native APK `04f5e19b…` / JS `865fca0a…`: Lock and free-area input protection,
partial PIN entry across a real split-side swap, native controls, sheets, rotation, passcode change/restore,
authentication, scanner background/Lock/PIN/resume, dark mode and OS font/navigation changes. v5 repeated the
fold/window/theme/keyboard/control/scanner/cold-inner targets. v6 and JS859 check the changed touch/keyboard paths
and physical Home origin. The earlier matrix is retained with its own stage; it was not repeated in full after
every small correction.

| Earlier supplemental flow | Native photo |
|---|---|
| Passcode change/restore | [Critical processing](prior-critical-processing.png) |
| OS font scale 1.3 and three-button navigation | [Empty Lock](prior-large-text-three-button-lock.png) |
| Actual inner landscape | [Network sheet and full-window backdrop](prior-rotated-network-sheet.png) |
| Fresh stock cold-inner setup | [Start](stock-cold-inner-start.png), [empty PIN](stock-cold-inner-pin-empty.png), [empty Home](stock-cold-inner-home.png) |

The app retains its existing native font-scale override of 1.0; the OS setting check is not proof of larger app
text. The initial regular-phone comparison has 15 screen pairs with no unexplained app-pixel changes. Expected
differences are system activity, build text and the generated test-install UUID on Advanced. Advanced photos stay
private. Later normal-screen checks are reported separately.

The v5 cover matches the unchanged baseline's same Light/Dark/Light control at all 1,768,884 app pixels. Against
the first cold baseline, 266 glyph-rendering pixels differ; the matching control has zero differences and no
QR-shadow difference. Final v6/JS859 inner Home, after IME and after Cancel each match the full phone app region
including native tabs at all 1,750,320 pixels, with physical/input origin Y=0.

## Limits and team checks

A target Galaxy hardware check is still required. Early Galaxy Fold models can lack the public hinge
feature/sensor and retain the compatibility path even after an OS update. See [the layout contract](../../docs/android-fold.md)
and [the test handover](TESTING.md). Keep #557 open until that device check is recorded.

Developer Reload reproduced the same screen-registration warning with the unchanged baseline. A process kill
removed Android's split task, so cold-process split startup is unproven. Rapid live font/navigation changes need
a controlled hardware check; cold OS-font-1.3/three-button startup was tested. Short landscape Gboard can use its
own fullscreen editor; in-app scroll proof uses a non-extract keyboard. Back restores the draft before Cancel.

One debug startup retained an OS starting-reveal surface translation of 53 px. Those photos are excluded from
final parity evidence. On a fresh awake/network-ready v6 run, the origin is zero before and after IME/Cancel,
with no animation leash. No app geometry compensation or source-cause claim was made for that transient state.

No Samsung hardware, physical camera/NFC, funded transaction, iOS build or Release-performance result is claimed.
The pinned SDK recovery is separate [PR #560](https://github.com/WietseWind/Xaman-App/pull/560); review it before a
clean build of [PR #561](https://github.com/WietseWind/Xaman-App/pull/561). Both PRs remain open for review.
