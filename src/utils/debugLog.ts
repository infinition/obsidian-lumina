/**
 * Debug logging utility - only logs when showDebugLogs setting is enabled.
 * Call initDebugLog() once with a getter, then use debugLog() everywhere.
 */

let _getEnabled: (() => boolean) | null = null;

export function initDebugLog(getEnabled: () => boolean): void {
  _getEnabled = getEnabled;
}

export function debugLog(...args: unknown[]): void {
  if (_getEnabled && _getEnabled()) {
    console.log('[Lumina]', ...args);
  }
}
