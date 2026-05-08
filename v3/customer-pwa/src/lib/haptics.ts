export function haptic(type: 'light' | 'medium' | 'success' | 'error' = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  switch (type) {
    case 'success': navigator.vibrate([50, 50, 50]); break;
    case 'error':   navigator.vibrate([100, 50, 100]); break;
    case 'medium':  navigator.vibrate(20); break;
    default:        navigator.vibrate(15);
  }
}
