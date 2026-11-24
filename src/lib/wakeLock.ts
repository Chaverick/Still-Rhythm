/**
 * Screen Wake Lock helper with automatic re-acquisition on visibilitychange
 * so iPad Safari/Chrome stays awake cleanly while a Still session is active.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (event: string, cb: () => void) => void;
}

export class WakeLockController {
  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;
  private onChange?: (active: boolean) => void;

  constructor(onChange?: (active: boolean) => void) {
    this.onChange = onChange;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private handleVisibility = (): void => {
    if (document.visibilityState === 'visible' && this.wanted) {
      void this.acquire();
    }
  };

  async enable(): Promise<boolean> {
    this.wanted = true;
    return this.acquire();
  }

  private async acquire(): Promise<boolean> {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock) {
      this.onChange?.(false);
      return false;
    }
    try {
      if (this.sentinel && !this.sentinel.released) {
        this.onChange?.(true);
        return true;
      }
      this.sentinel = await nav.wakeLock.request('screen');
      this.sentinel.addEventListener?.('release', () => {
        this.onChange?.(false);
      });
      this.onChange?.(true);
      return true;
    } catch {
      this.onChange?.(false);
      return false;
    }
  }

  async disable(): Promise<void> {
    this.wanted = false;
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // ignore
      }
      this.sentinel = null;
    }
    this.onChange?.(false);
  }

  dispose(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
    void this.disable();
  }
}
