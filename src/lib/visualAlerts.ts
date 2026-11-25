/**
 * Silent-safe visual alert helpers for when speakers are muted or headphones are off:
 *  1. Dynamic glowing amber browser-tab favicon + title beacon (zero permission needed)
 *  2. Optional silent macOS/desktop visual banner via browser Notification API (works over all apps)
 */

const ALERT_FAVICON_DATA_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<circle cx="16" cy="16" r="15" fill="#E8843C" opacity="0.32"/>' +
      '<circle cx="16" cy="16" r="10.5" fill="#D96B27"/>' +
      '<circle cx="16" cy="16" r="5" fill="#FFF3E6"/>' +
    '</svg>'
  );

let originalFaviconHref: string | null = null;
let originalTitle: string | null = null;
let activeBanner: Notification | null = null;
let activeBannerTimer: number | null = null;

function getFaviconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

export function setTabAlertVisual(
  active: boolean,
  stage: 'stage1' | 'stage2' = 'stage1',
  pipWindow?: Window | null
): void {
  if (typeof document === 'undefined') return;
  const link = getFaviconLink();

  if (active) {
    if (originalTitle === null) originalTitle = document.title || 'Still Rhythm';
    if (link && originalFaviconHref === null) {
      originalFaviconHref = link.getAttribute('href') || './icons/favicon.svg';
    }
    if (link) link.href = ALERT_FAVICON_DATA_URL;
    const alertTitle =
      stage === 'stage2'
        ? '🟠 Hands down · Still Rhythm'
        : '🟠 Hand near brow · Still Rhythm';
    document.title = alertTitle;
    if (pipWindow && !pipWindow.closed) {
      try {
        pipWindow.document.title = alertTitle;
      } catch {
        // ignore
      }
    }
  } else {
    if (originalTitle !== null) {
      document.title = originalTitle;
      originalTitle = null;
    }
    if (link && originalFaviconHref !== null) {
      link.href = originalFaviconHref;
      originalFaviconHref = null;
    }
    if (pipWindow && !pipWindow.closed) {
      try {
        pipWindow.document.title = 'Still Rhythm';
      } catch {
        // ignore
      }
    }
  }
}

export function getDesktopBannerPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestDesktopBannerPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function fireVisualDesktopBanner(
  stage: 'stage1' | 'stage2',
  userName?: string
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if (activeBannerTimer) {
      window.clearTimeout(activeBannerTimer);
      activeBannerTimer = null;
    }
    if (activeBanner) {
      try {
        activeBanner.close();
      } catch {
        // ignore
      }
      activeBanner = null;
    }

    const name = userName?.trim();
    const title =
      stage === 'stage2'
        ? name
          ? `${name} — hands gently down`
          : 'Hands gently down'
        : name
          ? `${name}, hand near your brow`
          : 'Hand near your brow';

    const body =
      stage === 'stage2'
        ? 'Take one slow exhale and rest both palms flat for a moment.'
        : 'Lower your hand gently to redirect — no rush.';

    const n = new Notification(title, {
      body,
      tag: 'still-rhythm-visual-cue',
      silent: true,
      icon: './icons/icon-192.png',
    });

    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      n.close();
    };

    activeBanner = n;
    activeBannerTimer = window.setTimeout(() => {
      try {
        n.close();
      } catch {
        // ignore
      }
      if (activeBanner === n) activeBanner = null;
      activeBannerTimer = null;
    }, 4500);
  } catch {
    // ignore browser notification errors
  }
}
