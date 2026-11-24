# Still Rhythm

A calm, **100% on-device** workday companion built in parallel with **Still** — preserving all of Still's eyebrow-plucking awareness features while adding restlessness resets, quiet sitting & standing rhythm, silent neck & shoulder comfort tracking, silent face-touch logging, and plain-English next-day pattern summaries.

Live app: **https://chaverick.github.io/Still-Rhythm/**

## What It Does (All 100% Local)
- **Classic Still Eyebrow Awareness**: Gentle Stage 1 warm peripheral glow + singing-bowl chime (~1.2s), Stage 2 60-second hand-reset pause sheet (~2.6s), Grace recovery, False alarm tuning, Notes, and Floating Mini-Window (Picture-in-Picture).
- **Restlessness & Proven Calming Resets**: Quietly tracks sustained restlessness and gently suggests an evidence-based reset (including a built-in 60-second guided Double-Inhale Sigh / Cyclic Sighing pacer, neck-safe Hands & Jaw Release, or a short posture break).
- **Quiet Sitting & Standing Guide (No Notifications)**: Tracks sitting vs. standing balance at your desk with a calm ambient rhythm bar (no popups or alarms). Supports switching between a desk Logitech webcam and a built-in laptop camera (with a **Meeting / Bed** mode that pauses sit/stand tracking automatically).
- **Silent Neck & Shoulder Comfort Tracking**: Quietly observes forward leaning and comfort adjustments (shoulder rolls, neck tilts, back shifts, neck rubs) — zero alerts, designed with cervical disc comfort in mind.
- **Silent Face-Touch Tracking**: Quietly counts touches by region (chin/jaw, cheek, nose/mouth, forehead) without alerts, purely to spot connections with focus strain, restlessness, and urges.
- **Plain-English Next-Day Summary**: Starting the next day, greets you with a clear, jargon-free story of which signals came together yesterday, plus an interactive hourly timeline and a 1-click copyable summary.

## Privacy
- **100% On-Device Vision**: Runs bundled MediaPipe `FaceLandmarker`, `HandLandmarker`, and `PoseLandmarker Lite` locally in your browser (`public/models/*.task` + `public/wasm/*`).
- **Zero Cloud Calls**: Video frames and history never leave your device.

## Development

```bash
npm install
npm run dev
npm run build
```
