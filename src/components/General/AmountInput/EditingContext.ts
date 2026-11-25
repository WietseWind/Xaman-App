import React from 'react';

// Authentication overlays are separate navigation roots. Only the review's
// amount inputs inherit this lock; the password field remains usable.
export const AmountInputEditingContext = React.createContext<() => boolean>(() => true);
