---
version: 1
slug: "apps-web-src-app-dashboard-listening-page-tsx"
primary_target: "apps/web/src/app/(dashboard)/listening/page.tsx"
related_targets: ["apps/web/src/components/listening/ListeningWorkspace.tsx","apps/web/src/components/listening/ListeningAudio.tsx","apps/web/src/app/listening.css"]
---

# Listening / Operate

Scope: desktop listening page, including generation, history, playback, six-question sheet, transcript/evidence and post-listening discussion. Preserve APIs, drafts, records, vocabulary sources and AI explanation language.

## Direction contract

THESIS: A continuous listening answer sheet, with sound as its authored moment; generation and history unfold only when needed.

OWN-WORLD: Inherit the implemented piano shell, white paper, black ink, neutral rules, square controls and Segoe UI/Microsoft YaHei. Extend through a measured black-and-white sound-column visualization, not a new visual identity.

STORY: Choose or reopen a topic, preview every question, listen and answer, submit to inspect evidence, then discuss in English. The transcript remains explicitly available before submission and retains assisted-practice tracking.

FIRST VIEWPORT: Existing 208px rail and 52px header. Lesson title leads; provenance and topic follow. New/history actions sit at top right. A full-width sticky player with a 64px real-audio visualization sits above the continuous question sheet. Two-column choice options; transcript/evidence opens from the right in a native nonmodal popover. On narrow screens choices stack and the transcript spans the viewport. Empty state leads with the generation form.

FORM: Continuous answer sheet, candidate 2 (zero-based), user locked listening-sheet; seed:705d31998d8bdd74. Approved sketch: .impeccable/mocks/decision/listening-sheet.html. Code-led; no approved raster comp exists. User subsequently approved real-audio visualization, a compact sticky player, transcript transition, and rewind five seconds. A–B looping is deferred.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Motion thesis

Focal moment: 48 slender columns respond to actual analyser frequency data while audio plays. Pause settles columns; hidden/offscreen/compact/reduced-motion states stop drawing. No synthetic random bars.

Continuity: the sticky player's compact state frees room for questions; the transcript enters from the right with a 240ms ease-out transition (keyboard opening is immediate), with native Escape/light-dismiss and focus restoration.

Feedback: 120ms neutral answer surface change; all content stays visible by default. Audio controls never await visual effects.

Budget: no added package, model or TTS request. One lazily created AudioContext per used player, bounded analyser work at 30fps, direct column transforms outside React rendering. Reduced motion retains ordinary audio progress and controls. Graph failures fall back to normal playback.

## Verification

1440x960, 1000x700, 800px and 390x844; empty and saved lesson, draft reload, reveal before/after submit, complete six answers, result reload, quote location/return focus, vocabulary collection, English/Chinese UI, audio play/pause/seek/speed/rewind/compact, real sound columns, hidden document, reduced motion, failed audio/retry, discussion text/recording states.
