import { useSyncExternalStore } from 'react';

/**
 * Detects if the user is on a true mobile browser (iOS/Android).
 * This is different from just checking viewport width - it checks the actual device.
 * Useful for hiding features that don't make sense on mobile (like keyboard shortcuts).
 */
export function useIsMobileBrowser(): boolean {
  // useSyncExternalStore with a no-op subscribe is the recommended way
  // to read a value that never changes during the component lifecycle
  return useSyncExternalStore(
    () => () => {},
    checkIsMobileBrowser,
    () => false, // Server snapshot
  );
}

function checkIsMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();

  // Check for iOS devices (iPhone, iPad, iPod)
  const isIOS =
    /iphone|ipad|ipod/.test(userAgent) ||
    // iPad on iOS 13+ reports as Mac, so also check for touch + Mac
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Check for Android devices
  const isAndroid = /android/.test(userAgent);

  return isIOS || isAndroid;
}
