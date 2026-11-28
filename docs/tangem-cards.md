# Tangem cards: the right card

How the app makes sure that a card operation runs on the card it asked for, and what happens when the user holds
another card to the phone. Issue #564, app 5.5.0.

## The rule

**The app does not give the card id of the expected card to the session of the Tangem SDK.**

With a card id, the SDK handles another card itself: it shows its own "wrong card" text, keeps the NFC session
open, waits, and starts the NFC polling again. On some Android phones that restarted polling never finds the next
card: the prompt spins until the user closes it (issue #564). The app gets no event in that state.

Without a card id, another card **ends the session**. The app then shows its own alert ("Different card", with the
name of the card it asked for), and the user starts a new scan with the button they came from. A new scan is a new,
clean NFC session.

## How each operation knows the card

| Operation | Where | How the card is checked |
|---|---|---|
| Scan | add account, import, identify, back-up set-up | Nothing is asked of a specific card. The app checks the answer |
| Sign | vault overlay (every signature), import verify step, back-up (the original card signs) | The sign names the wallet key. A card without that wallet answers "wallet not found" (30008) and the session ends. The app also compares the card id in the answer (`TangemCard.sign`) |
| Create wallet | add account, back-up set-up (after a scan) | Native check, see below |
| Set access code, set passcode, reset codes | card security screen | Native check, see below |

### The native check (operations that write to the card)

A write cannot be checked afterwards, so the card id is checked before it. `patches/tangem-sdk-react-native+2.3.1.patch`
adds `ExpectedCard` (Kotlin and Swift): it wraps the operation of the SDK, the session starts without a card id, and
after the SDK read the card, `ExpectedCard` compares the card id. Another card ends the session with "wrong card
number" (50005) and nothing is sent to that card. The operation itself is the unchanged operation of the SDK.

On Android the same patch closes the sheet of the SDK when a session ends with one of these two errors, so the
alert of the app is not under it.

iOS `resetUserCodes` is the one operation that still gives the card id to the SDK: the SDK does not make the reset
command public. iOS does not have the problem of issue #564.

## Where the code is

| File | Part |
|---|---|
| `src/common/utils/tangemSession.ts` | `TangemCard` (every card operation goes through it), `TangemWrongCardError`, `isTangemWrongCard`, `stopTangemSessionLater` |
| `src/common/helpers/tangemWrongCard.ts` | `showTangemWrongCard(name)`: the alert |
| `patches/tangem-sdk-react-native+2.3.1.patch` | `ExpectedCard`, sign without a card id, the sheet closes on Android |
| `src/common/libs/tangemBackup/native.ts` | Back-up flow: another card at the sign is `wrongSource`, at the wallet creation `cardChanged` |

A new card operation: call it through `TangemCard`, and handle `isTangemWrongCard(error)` with
`showTangemWrongCard`. A test (`tangemSession.test.ts`) fails when a file calls the SDK directly.

### The stop of the session

On Android `RNTangemSdk.stopSession` turns the NFC reader off. The vault stops the session 10 seconds after a sign
(the prompt needs time to close). A plain timer would end the scan of a new try that starts inside those 10 seconds,
which is the normal thing to do after "Different card". `stopTangemSessionLater` drops the planned stop when a new
session starts.

## How to test

### Unit tests

```bash
npx jest --forceExit src/common/utils/__tests__/tangemSession.test.ts src/common/libs/tangemBackup src/screens/Overlay/Vault/__tests__/tangemSigning.test.tsx src/screens/Account/Edit/ChangeTangemSecurity src/common/helpers/__tests__/tangemWrongCard.test.ts
```

The mock card (`src/common/utils/__tests__/helpers/mockTangemCard.ts`) answers like the SDK does without a card id:
a card without the asked wallet rejects with code 30008.

### With real cards (two cards, A and B, both in Xaman)

No simulator or emulator has NFC: these checks need a phone and cards. Do them on Android and on iOS.

| Step | Expected |
|---|---|
| Sign a request of A, hold A | Signed, as before |
| Sign a request of A, hold B | The prompt closes. Alert "Different card" with the name of A. Sign again, hold A: signed |
| The same, and sign again inside 10 seconds | The second scan sees the card |
| Back-up card removal of A (the screen of the issue), hold B | Alert "Different card". The button starts a new scan, hold A: it continues |
| Card security of A (Settings → account → card security), hold B | Alert "Different card", nothing changed on B. Save again, hold A: changed |
| Add account, new card: scan card A, then hold B for the wallet creation | Alert "Different card", no wallet on B |
| A card with an access code or passcode | The code is asked as before |

## Known limits

- A card that is the right card but lost its wallet also answers "wallet not found", and gets the "Different card"
  alert.
- A card with an access code: the SDK asks for the code of the card that is held to the phone before it can read
  it, also when it is the wrong card.
- On iOS the system NFC sheet shows the text of the SDK for a moment before it closes; the alert of the app comes
  after it.
