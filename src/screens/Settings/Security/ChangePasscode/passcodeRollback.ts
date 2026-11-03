/** The settings passcode is already hashed. Rollback must store that value unchanged. */
export const passcodeWrittenOnRollback = (storedHash: string): string => storedHash;
