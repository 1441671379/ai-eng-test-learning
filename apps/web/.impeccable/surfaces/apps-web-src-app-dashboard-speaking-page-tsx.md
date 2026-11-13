---
version: 1
slug: "apps-web-src-app-dashboard-speaking-page-tsx"
primary_target: "apps/web/src/app/(dashboard)/speaking/page.tsx"
related_targets: ["--related","apps/web/src/app/(dashboard)/speaking/coach/page.tsx","apps/web/src/app/(dashboard)/speaking/pronunciation/page.tsx","apps/web/src/app/(dashboard)/speaking/article-reading/page.tsx","apps/web/src/app/speaking.css","apps/web/src/components/experiments/SpeakingFrame.tsx"]
---

# Speaking / Operate

Scope: speaking overview, AI coach, sentence pronunciation and article read-aloud. Adult independent learners practice, inspect original feedback and retry. The user approved the completed previews on 2026-10-20; this pass migrates them into the production web/Electron interface.

## Direction contract

THESIS: Continuous conversation with feedback beside each turn in reading order. The current turn and recording remain easy to reach; prior turns may collapse without losing their evidence.

OWN-WORLD: Inherit the piano shell, white canvas, black rail, neutral rules, square controls and established type. Semantic word verdict colors retain written labels.

STORY: Choose practice, listen, record and stop manually, inspect the score and actual phonemes, then retry or continue. History and reference pronunciation remain available.

FIRST VIEWPORT: Existing rail/header and compact tool navigation surround one broad notebook; a bottom recording dock stays visible. Selecting a word reveals dictionary IPA, target and actual recognized phones inline; a disclosure holds longer per-phone details. The notebook scrolls above the dock; narrower views stack the two sequences.

FORM: Continuous notebook, candidate2 of the ordered six, third presented card, user locked speaking-notebook. seed:9f05ca2879cfdff7. Code-led selected HTML: .impeccable/mocks/decision/speaking-notebook.html. The user specifically requires original actual-phone evidence to survive the redesign.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Information boundary

speaking-information-audit.md records the original response bindings. Never replace expected/actual sequences with three summary percentages. Keep dictionary IPA, selected scoring reference, recognized phones, operations, confidence, ownership and reasons distinct. No scoring or model changes are part of the visual migration. Preview values are explicitly illustrative.

## Additional preview scope · 2026-10-20

The user requested overview, sentence pronunciation analysis and article reading previews alongside the chosen coach. Extend the selected notebook composition and piano shell, without another concept round. Files: speaking-overview.html, speaking-sentence.html, speaking-article.html, with shared speaking-preview.css/js. All four module links navigate between previews. This remains a static design preview, not an Electron or backend migration.

Overview presents three equally weighted practice rows and filterable example history. Sentence analysis keeps the input and summary followed by selectable words, target/recognized sequences and per-phone evidence. Article reading keeps continuous paragraphs, segment selection, partial coverage, a separate last-submission state and per-word details. Pending words have no fabricated score or recognized sequence; repeated words in different segments remain distinct. A failed submission preserves the previous successful result with an explicit notice. The recording dock is a layout demonstration and makes no microphone or model calls. Examples are labeled throughout. History filtering, native disclosures, word selection and navigation are working preview interactions.

## Production migration · 2026-10-20

Apply the accepted four previews to the real Speaking routes inside the shared LearningShell. SpeakingFrame owns route heading/navigation and a reserved recording-dock region. Coach turns form one continuous notebook, with native collapse for earlier turns and the original assessment/feedback for each turn. Sentence input and Article paragraphs share the evidence hierarchy: dictionary, matching/ownership/confidence, target and recognized phones, then disclosed original operations. Article partial results, latest-failure diagnostics, transcript correction and omission confirmation remain intact. Real recording/import, GPT-SoVITS, model calls, exports, vocabulary collection and saved records use their existing handlers/APIs. Shared audio controls receive an opt-in piano appearance; other modules keep their default controls. No backend scoring/model/data migration is included. UI language may change; model-generated explanations and practice content retain their original language. The isolated acceptance fixtures are marked UI verification and never ship or enter learner data.


## Feedback simplification · 2026-10-21

User requested a quieter default Speaking surface. Per-phone pairing/confidence, transcript correction and per-paragraph history are independently opt-in through Settings. Target and recognized arrays remain visible. Article content aligns left; each segment heading shows its own phone-operation-weighted score (or pending dash), preserving partial coverage and prior-success state after failure. Remove routine latest-submission timestamp/status, repeated partial-result notice and automatic transcription disclosure. This is presentation/configuration only; existing evaluation, omissions, recordings and attempt persistence are retained.
