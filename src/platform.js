/* NEXA Drive Connect — shared platform awareness, safe for Obsidian mobile and desktop. */
const NEXA_PLATFORM = (() => {
  'use strict';
  function classify(flags = {}) {
    if (flags.isDesktopApp && flags.isWin) return 'windows';
    if (flags.isDesktopApp) return 'desktop';
    if (flags.isIosApp) return 'ios';
    if (flags.isAndroidApp) return 'android';
    if (flags.isMobileApp) return 'mobile';
    return 'unknown';
  }
  function audit(app, flags = {}) {
    const target = classify(flags);
    if (target !== 'windows') return {target, hasLocalPath: false, cloudPathHint: false};
    const adapter = app && app.vault && app.vault.adapter;
    let basePath = '';
    if (adapter && typeof adapter.getBasePath === 'function') {
      try { basePath = String(adapter.getBasePath() || ''); } catch (_) { basePath = ''; }
    }
    // Path hints are NOT a guarantee: a Google Drive virtual mount may be only a drive letter.
    const cloudPathHint = /(?:^|[\\/])(?:google drive|meu drive|my drive|onedrive|dropbox|icloud drive)(?:[\\/]|$)/i.test(basePath);
    // Never return or log the user's absolute path.
    return {target, hasLocalPath: Boolean(basePath), cloudPathHint};
  }
  return {classify, audit};
})();
