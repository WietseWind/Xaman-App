/**
 * Stop iOS/Android from treating r-address / secret fields as postal addresses.
 * iOS infers street-address autofill from placeholders like "address" unless
 * textContentType is set explicitly. Never use this on a real street-address form.
 */
export const noAutofillProps = {
    autoComplete: 'off' as const,
    textContentType: 'none' as const,
    importantForAutofill: 'no' as const,
    autoCorrect: false,
    spellCheck: false,
};
