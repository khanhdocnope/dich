/**
 * Mobile Haptic Feedback Service for Capacitor Android & Mobile Web
 * Uses Web Vibration API (navigator.vibrate) with safe fallbacks.
 */

export const triggerSelectionHaptic = () => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(14);
    }
  } catch {}
};

export const triggerImpactHaptic = () => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(22);
    }
  } catch {}
};

export const triggerSuccessHaptic = () => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([20, 50, 25]);
    }
  } catch {}
};
