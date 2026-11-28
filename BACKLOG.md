# Still Rhythm — Product & Feature Backlog

A living roadmap of ideas, check-ins, and design decisions for Still Rhythm. Updated as we learn from real daily use.

> **Core Safety Principle:** Any self-improving detection must stay **recall-first** — never silently suppress alerts until shadow-mode verification proves real urges aren't being missed.

---

## Active Data Collection (Next 1–2 Weeks)

| Priority | Item | Status | Notes |
| :--- | :--- | :--- | :--- |
| **High** | **Local Hand-Pose Sample Collection** | Active now (zero behavior change) | Silently saves lightweight 8-number hand-pose snapshots (no video or images) on both real catches (`Auto-catch`, `Caught it`, `Grace`) and 1-tap labeled false alarms (`Eye scratch`, `Drink`, `Ear`, `Other`). Builds a real personal dataset before turning on any adaptive filter. |
| **Medium** | **Evaluate Hand Resets for Brow Urges** | 1-week check-in | Review after ~1 week whether the rotating hand-reset cards on the `Calm` tab are actually getting used, or if guided breathing (currently the #1 tool) should stay front and center. |

---

## 2-Week Check-In (Target: Mid-December 2026)

### 1. Recall-Safe Self-Improving Local Detection (High Priority)
- **Activation Gate:** Only turn on once a critical mass of local examples is collected (e.g., at least **15 real catches** and **8 labeled false alarms**).
- **Shadow-Mode / Mid-Level Verification First:** Never silently suppress alerts right away. Start with a mid-level verification state that still prioritizes catching every real urge, showing a gentle prompt:
  > *"Predicted eye scratch — was that right? `[Yes, false alarm]` `[No, real urge]`"*
- **Safe Personal Tuning & Escape Hatch:** Compare confirmed false alarms, predicted false alarms, and corrected real urges to safely refine personal thresholds (for example, adding `+0.6s` extra grace time over the eyelid on brief eye rubs). Always include a **1-click Reset** to return to defaults.

### 2. Per-Microphone Auto-Calibration (Medium Priority)
- **Automatic Per-Mic Offsets (`deviceId`-keyed):** Save a separate voice volume (dB) calibration offset for each microphone automatically (MacBook Built-in vs. AirPods vs. Logitech webcam mic).
- **Visible Active Mic:** Display the currently active microphone name so switching headphones or mics never throws off the comfort meter.

---

## Longer-Term Exploration (After 1+ Month of Daily Use)

- **Native macOS Menu-Bar App (Swift + Apple Vision):** If Still Rhythm becomes an everyday staple, evaluate wrapping or porting it to a lightweight native Mac menu-bar app:
  - No Chrome tab required and no `chaverick.github.io` title bar.
  - ~4x lower battery usage.
  - Subtle native screen-edge tint visible over full-screen apps when muted.
- **Away-from-Desk Companion (Apple Watch):** Explore an Apple Watch companion for catching urges away from the desk (couch, bed, watching TV) if needed.
- **Original `Still` App Sync:** Optionally port the silent muted-audio visual cues and progressive soft glow back to the original `Chaverick/Still` app if desired.
