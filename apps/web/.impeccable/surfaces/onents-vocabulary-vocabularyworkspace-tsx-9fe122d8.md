---
version: 1
slug: "onents-vocabulary-vocabularyworkspace-tsx-9fe122d8"
primary_target: "apps/web/src/components/vocabulary/VocabularyWorkspace.tsx"
related_targets: ["apps/web/src/app/(dashboard)/vocabulary/page.tsx","apps/web/src/app/vocabulary.css","apps/web/src/components/vocabulary/DeckImporter.tsx","apps/web/src/components/vocabulary/WordbookShelf.tsx","apps/web/src/components/vocabulary/WordPronunciationPractice.tsx"]
---

# Vocabulary workspace

Scope: the standalone Vocabulary route and its review, personal/all-word library, local wordbook shelf, text import, settings and on-demand pronunciation states. Mode: Operate. The user's confirmed existing workflows and data contracts remain in force.

## Direction contract

THESIS: Separate recall from reference while keeping the word in view. Remove the old banner/metric-card preamble so the opening viewport reaches the learning task.

OWN-WORLD: Inherit Piano Workspace: black global rail, white canvas, dark system-sans text, neutral hairline divisions, square controls. Pronunciation verdict colours retain their semantic meaning; memory ratings are equal neutral actions.

STORY: Choose a deck, recall the word, reveal the complete supplied meaning/example, then rate recall. Personal vocabulary, wordbooks, import and settings remain discoverable. Pronunciation is optional and independent from scheduling.

FIRST VIEWPORT: Compact heading and four local work areas; deck selector plus real due/new/today figures; a 42% word area and 58% revealed-reference area separated by one rule. Four equal recall controls follow the work area. At narrower widths the areas stack without truncating content. Signature interaction: revealing the answer fills the reference side while preserving the word and its controls; reduced motion is immediate.

FORM: Parallel recall and reference, candidate 2, user-selected second card. `seed:c43a01139513da97`. Approved sketch: `.impeccable/mocks/decision/vocabulary-parallel.html`. Code-led; no raster comp was generated. Sample progress, example translation and parsed sense fields in the sketch are illustrative, not API capabilities; production uses the actual fields and actual counts.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: preserve full meaning strings, examples, dictionary spelling, source/context, actual target/recognised phones, retry/save states and all library/import functions. No dictionary enrichment, model changes, database migration or production data edits as a side effect. Input shortcuts stay scoped; the audio recording stops manually and submits automatically.


## Implemented extension

The source uses the full saved meaning/example/phonetic fields and actual FSRS preview intervals. Desktop preserves the42/58 word/reference composition. At widths≤900px DOM and visual order is word → reference → rating → optional pronunciation. At desktop heights≤800px compact spacing removes the reference height reserve; all four ordinary short-answer ratings were visible at1280×720 and1000×700 in both languages. Long text grows naturally. Keyboard reveal/next-card focus and asynchronous snapshot guards preserve task continuity.

Full review returned fix; the same reviewer scored both listed fixes resolved in `VERDICT.md` at Verdict Pass scope. See `.impeccable/review/vocabulary/` for captures, preserved-function tests and actual delivery evidence. No change to global design tokens, FSRS/model thresholds or production learning data.

## Phrase-learning extension · 2026-10-27

User-confirmed placement: inside Vocabulary, alongside the existing word areas. Preserve the incumbent Piano Workspace. Mode: Operate, with Read inside a lesson. This extension is code-led and does not replace the approved word-card composition.

Contract: topic reading leads to six usable expressions; an expression keeps one stable identity across source lists, private notes, recall, cloze, sentence attempts and independent FSRS. The first viewport offers a lesson selector and a readable original passage, followed by the actual target expressions. Narrow layouts use a horizontal lesson strip and natural vertical reading. Recall hides the English target; revealing and rating do not invent correctness scores. Alternate natural answers remain distinguishable from matching the taught target. Optional model work is explicit, labelled and recoverable. Source lists are references, not publisher-authored Chinese lessons.

Scope: PhraseWorkspace.tsx, phrases.css, phrase API/data services and the existing Vocabulary navigation. No word scheduling, speech models, global palette or learner-data migration changes. Acceptance captures and verification: `.impeccable/review/phrases-20261027/`.

### Delivered phrase extension

The implemented lesson composition pairs a ruled selector with a readable original passage and six actual expressions. At widths at or below 700px the selector becomes a horizontal strip above natural vertical reading. Local expression headings are 34px, stepping to 27px; passage and example text are 19px, with the passage stepping to 18px on narrow screens. These scoped content roles reuse the existing system-sans stack, white canvas, neutral rules and square Piano controls. Four equal neutral ratings wrap to two columns on narrow screens. No new global design tokens, fonts, palette, imagery or motion were added, and the existing word-card 42/58 composition remains its own reference.

Delivered content distinguishes 3,213 unique source entries from eight original topic units / 48 complete teaching notes; remaining notes require an explicit preparation or manual-edit action. Phrase scheduling and private data are independent from word cards. English interface labels preserve Chinese teaching fields with `lang="zh-CN"` and English passages/examples/answers with `lang="en"`. Fresh activity changes hide prior revealed answers; staying in the same activity preserves resume state. Target matching, natural alternatives and optional model feedback retain separate written meanings.

The full review returned fix; `VERDICT.md` subsequently returned ship for the two listed fixes (reveal-state isolation and language-of-parts tags), with no visible regression from that fix batch. That verdict is scoped to those fixes, not a new full-surface or pedagogical review. Acceptance, final production/Electron preparation, isolated QA limits and the ordinary-extension documentation comparison are in `.impeccable/review/phrases-20261027/`. Root `DESIGN.md` and its sidecar were preserved; `DOCUMENTATION.md` records the evidence and an unrelated pre-existing narrative mismatch without repairing it.

### Bounded content pilot · 2026-10-28

User requested 50–100 more expressions. Delivered data adds 60 AI-drafted, contract-checked and editorially revised expressions in ten six-item themes; original 48 rows remain byte-equivalent as JSON values. The complete course set is now 108 expressions across 18 themes, with AI provenance preserved in the loader and visible labels. Counters derive from the actual course data.

Hardening contract for growth: the desktop theme selector scrolls within a viewport-bounded height so choosing the last of eighteen topics keeps the passage visible. At ≤700px it retains the existing horizontal strip with no vertical height clamp. Preserve the piano world, natural article flow, recalled-answer isolation, language tags, independent FSRS and learner data. This is a local content/list-size extension, not a new visual world or navigation redesign. Evidence: `.impeccable/review/phrases-pilot-20261028/`; actual generation/accounting: `outputs/pilot-20261027/`.

### Delivered bounded pilot

The delivered desktop selector uses a viewport-derived height limit with its own vertical scrolling; the 1280×720 evidence reaches the eighteenth topic while its passage remains visible alongside. The 1440×2043 tall viewport keeps the same bounded selector, and the 390×844 evidence preserves the unclamped horizontal strip at ≤700px. Published data contains 108 entries / 18 themes, including 60 AI entries / ten AI themes. Source validation preserves AI origin/provider/model, visible labels distinguish AI content, and course counts derive from actual units.

The fresh bounded-extension `REVIEW.md` records ship with no material fixes. `DOCUMENTATION.md` records the source/capture comparison, verification limits and unrelated pre-existing drift. No new global tokens, imagery, fonts, palette or motion were introduced; root `DESIGN.md` and its sidecar remain byte-identical. This scoped result does not certify the whole product, teaching accuracy or provider billing.

### Delivered course extension · 2026-10-28

The delivered directory organizes the existing 722 themes / 3,213 expressions into 103 related courses, each containing 6–10 themes. Search, subject filtering and twelve-course pages lead to ruled rows with actual reading counts. Inside a course, the bounded desktop topic outline remains beside the passage; at ≤700px it becomes a horizontal strip above natural reading. Narrow directory controls and row metadata stack. These local compositions retain Piano's white canvas, neutral rules, square controls, black selected topics and inherited system-sans type; no global tokens, imagery, font or motion were added.

Reading, usage, English recall, cloze, sentence practice, saved expressions and private notes remain. This delivered course model supersedes the historical phrase-FSRS and rating descriptions above: phrase cards, ratings, daily quotas and scheduling are retired; the independent word-card FSRS remains in force. Root `PRODUCT.md` and `docs/PHRASE-LEARNING.md` own the current functional scope.

Directory search preserves field focus through filter-driven page resets. Course entry, topic selection, expression entry and return actions focus their destinations and restore the originating directory row with its query, subject and page. `REVIEW.md` first returned fix; `VERDICT.md` scores both keyboard fixes resolved and returns ship only at that scoring scope. The six final saved captures, source comparison, recorded keyboard sequence, delivery limits and pre-existing documentation drift are documented in `.impeccable/review/phrases-courses-20261028/DOCUMENTATION.md`. Root `DESIGN.md` and `.impeccable/design.json` remain unchanged.

### Knowledge relocation correction · 2026-10-28

The user's latest decision supersedes the earlier placement of Phrases & collocations inside Vocabulary. The shipped course and expression interface now lives at `/knowledge`, the sixth independent learning area alongside the five language areas. Its current surface record is `apps/web/.impeccable/surfaces/apps-web-src-components-knowledge-knowledgeworkspace-tsx.md`. Earlier phrase implementation entries above remain historical evidence, not instructions to restore a Vocabulary phrase tab.

Vocabulary retains four word-tool tabs and its existing parallel recall/reference composition, word library, wordbooks, import and independent word FSRS. The 103 phrase courses, 722 topics, 3,213 expressions, stable IDs and private phrase database are reused in Knowledge. A pure idempotent checkpoint conversion moves only phrase details and relevant page scroll, preserves ordinary word state and prefers existing Knowledge progress. No bulk learner-data migration was performed for acceptance.

The moved expression interface removes the action replacing existing notes with an AI version, while retaining manual editing, reading, recall, cloze, sentence practice, optional sentence feedback, collection and audio. Initial preparation remains available only without teaching content. AI teaching explanations stay Chinese when the interface changes language. The preceding retirement of phrase ratings/FSRS remains in force; word scheduling is unchanged.

Fresh bounded review returns ship with no material fixes. Source comparison, nine rendered captures, synthetic verification limits and successful production-bundle refresh are recorded in `.impeccable/review/knowledge-20261028/`. There was no fresh native-window launch. This relocation adds no global visual tokens, fonts, palette, imagery or motion; root `DESIGN.md` and `.impeccable/design.json` remain byte-identical.
