/**
 * What a text field holds after text was typed into it, against what was typed.
 *
 * The read-back is there to catch lost characters (fast typing lost some). But the app may change
 * the text itself: the recipient search of Send takes the spaces off an address and replaces a
 * Bithomp URL by the account in it. That is not a typing fault, and typing again gives the same.
 *
 *   'same'       the field holds what was typed (spaces around it do not count)
 *   'rewritten'  the field holds a part of what was typed, and held the same after the try before:
 *                the app made this of it. A lost character does not leave one unbroken part twice.
 *   'again'      anything else: type it again
 *
 * A wrong 'rewritten' can not make a scenario pass: this only decides whether the step types
 * again. What the scenario expects of the screen is checked by its own steps.
 */
const MIN_PART = 4;

const readBack = (typed, held, heldBefore) => {
    const want = String(typed);
    const got = String(held === null || held === undefined ? '' : held);
    if (got === want || got === want.trim()) {
        return 'same';
    }
    if (got.length >= MIN_PART && want.indexOf(got) !== -1 && heldBefore !== undefined && got === String(heldBefore)) {
        return 'rewritten';
    }
    return 'again';
};

module.exports = { readBack };
