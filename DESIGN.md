---
name: "英语学习空间 / English Learning"
description: "A quiet piano-inspired workspace for local English learning."
colors:
  ink: "#161616"
  muted: "#595959"
  line: "#d6d6d6"
  paper: "#fff"
  soft: "#f5f5f5"
  key-black: "#111"
  control-ink: "#222"
  control-border: "#aaa"
  control-state: "#f2f2f2"
  primary-fill: "#151515"
  primary-hover: "#333"
  sidebar-text: "#ddd"
  sidebar-muted: "#bcbcbc"
  sidebar-rule: "#3c3c3c"
  sidebar-hover: "#242424"
  prose-ink: "#303030"
typography:
  display:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "38px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
  section:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.5
  question:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  reading:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  square: "0"
spacing:
  compact: "8px"
  control: "12px"
  standard: "16px"
  section: "18px"
  roomy: "24px"
  workspace: "32px"
  page-inline: "36px"
components:
  button-primary:
    backgroundColor: "{colors.primary-fill}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.control-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "9px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.control-state}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.control-ink}"
    typography: "{typography.body}"
    padding: "4px 0"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.control-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "9px 12px"
    width: "100%"
  navigation-item:
    textColor: "{colors.sidebar-text}"
    padding: "10px 24px"
  navigation-item-current:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.key-black}"
  skill-entry:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.control-ink}"
    padding: "18px 16px"
  question-step:
    backgroundColor: "{colors.paper}"
    textColor: "#444"
    rounded: "{rounded.square}"
    padding: "4px 8px"
  question-step-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  answer-option:
    textColor: "#444"
    rounded: "{rounded.square}"
    padding: "12px"
  answer-option-selected:
    backgroundColor: "{colors.control-state}"
    textColor: "{colors.key-black}"
  audio-play:
    backgroundColor: "{colors.key-black}"
    textColor: "{colors.paper}"
    rounded: "{rounded.square}"
    size: "38px"
  history-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.control-ink}"
    padding: "14px 12px"
  history-row-current:
    backgroundColor: "{colors.control-state}"
  listening-play:
    backgroundColor: "{colors.key-black}"
    textColor: "{colors.paper}"
    rounded: "{rounded.square}"
    size: "42px"
---

# Design System: 英语学习空间 / English Learning

## Overview

**Creative North Star: "The Piano Workspace"**

A quiet local learning workspace, organized through the relationship between black piano keys and white paper. Simple lines, square controls, and restrained interface type make choosing a skill, reading, answering, and understanding evidence feel like one continuous activity. The five skills retain equal standing; the interface does not prescribe a learning order.

This record describes the implemented common Web/Electron learning shell, home, reading workspace, listening workspace, four Speaking routes (overview, AI coach, sentence pronunciation and article read-aloud), the standalone Vocabulary and Writing workspaces, and the Records and Settings utility pages including model configuration. Listening extends the same piano world through a continuous answer sheet, a compact sticky player, sound columns, and a nonmodal transcript. Speaking extends it through a continuous notebook, inline pronunciation evidence and a reserved recording dock. Vocabulary extends it through parallel recall and reference, equal memory ratings and optional pronunciation. Writing extends it through an immutable original linked to a correction margin, a separate draft and complete review evidence. Records and Settings extend it through ruled history rows, native filters, section links and grouped forms using the existing controls. The contextual vocabulary collector in Listening and Speaking retains its own existing flow. The Windows native titlebar remains intact; unused drag-strip and window-strip CSS does not establish a custom titlebar behavior.

**Key Characteristics:**

- True white learning surfaces with a black sidebar and white current item.
- Thin neutral rules and square, plainly labeled controls.
- Five equal home entries with a temporary sweeping inversion.
- Readable article prose beside questions and answer evidence.
- A continuous listening sheet with real-audio columns and an explicitly opened transcript.
- A continuous speaking notebook with evidence owned by each turn or paragraph.
- Parallel word recall and reference, with pronunciation separate from memory ratings.
- Visible keyboard focus, responsive stacking, and reduced-motion support.

## Colors

The palette is neutral: white creates reading space, black establishes location and action, and gray distinguishes structure from secondary information. The frontmatter is the normative color source.

### Primary

- **Key Black** (`key-black`): sidebar ground, strong section rules, and the audio play control.
- **Primary Fill / Primary Hover** (`primary-fill`, `primary-hover`): filled actions such as continuing reading, generating practice, and submitting answers.

### Neutral

- **Paper / Ink** (`paper`, `ink`): the shared canvas, inherited interface text, native form accent, and current question step.
- **Muted** (`muted`): metadata, explanations, paragraph numbers, generation details, and helper copy.
- **Line** (`line`): light section, list, answer-option, and workspace divisions.
- **Soft** (`soft`): quiet status or error surfaces where a boundary and explanatory text carry meaning.
- **Control Ink / Border / State** (`control-ink`, `control-border`, `control-state`): outlined actions and fields, with a light gray hover or selected surface.
- **Sidebar Text / Muted / Rule / Hover** (`sidebar-text`, `sidebar-muted`, `sidebar-rule`, `sidebar-hover`): the inverted navigation's secondary hierarchy.
- **Prose Ink** (`prose-ink`): sustained English article reading.

**The Neutral Canvas Rule.** The piano learning canvas stays true white. Color is not added to imply skill priority or to replace an answer's written result and evidence.

Speaking retains local semantic feedback colors: green for a word's positive verdict, orange for the coach/sentence practice verdict, and red for article practice verdicts and errors. Written verdicts, separate metrics and unavailable-evidence messages accompany them. Vocabulary pronunciation retains its existing local written word/phoneme verdicts with semantic colors as well. These feedback colors are scoped to pronunciation feedback and do not extend the global decorative palette; pending or unscored words remain neutral.

## Typography

**Display Font:** Segoe UI, with Microsoft YaHei and sans-serif fallbacks.
**Body Font:** the same stack, shared by English and Chinese interface text.

**Character:** restrained desktop interface typography. Weight, size, spacing, and rules establish hierarchy; the scoped shell overrides legacy decorative heading fonts.

### Hierarchy

- **Display:** the home's invitation to choose a practice.
- **Headline:** the English article title. It precedes AI provenance and reading tools.
- **Title:** the reading workspace heading.
- **Section:** section headings, panels, and analysis item titles.
- **Question:** the current English question prompt.
- **Body:** controls and the shared interface baseline.
- **Reading:** long article prose, with a maximum measure of (73ch). The reader can cycle the text size through (17px), (19px), and (21px) without changing the interface scale.
- **Label:** metadata, helper text, paragraph numbers, and audio timing. Numeric paragraph and time labels use tabular numerals.

Listening reuses the headline for its lesson title. Its continuous sheet uses medium-weight prompts (18px / 1.6), choice text (15px / 1.65), and quiet question-type labels (12px). Transcript prose uses (17px / 1.85), stepping to (16px) on small screens; transcript and discussion headings stay within the existing interface stack.

Speaking uses the existing title scale for route headings (28px / 1.25), section prompts and selected words (19px), and quiet metadata (12px). Learner replies use (17px / 1.85); article prose uses (17px / 2.1) with a maximum measure of (78ch). Target and recognized phone sequences use (19px / 1.7); dictionary IPA retains its existing monospace fallback. These are local evidence roles within the established interface stack.

Vocabulary uses a large English headword (58px / 1.15, weight500), stepping to (46px), (42px) and (38px) at its compact and narrow breakpoints. The complete saved meaning uses (21px / 1.7), with (20px) on short desktops and (19px) on small screens. Examples retain (17px / 1.85), or (16px / 1.7) on short desktops. These are local learning-content roles, not changes to the common interface type ramp.

At narrower or shorter desktop sizes, large headings step down rather than consuming the practice area. Article titles become (27px) below the (1150px) width threshold and (24px) in the short desktop layout. Home display text becomes (30px) in compact layouts and (28px) on small screens. Chinese skill names use (26px); English names use (20px), then (17px) on small screens.

**The Reading Measure Rule.** Preserve the article's generous line height and readable measure when extending the reader; compact metadata must not determine prose density.

## Layout

The shell fills the available viewport height (100dvh). A black left rail (208px) sits beside a flexible main column; the main column contains a breadcrumb/language header (52px) and a scrollable content region. Page padding is (28px 36px 24px). At wide widths, horizontal page and header padding becomes (48px). The shell is shared by the Web and Electron application, below the native desktop titlebar.

The home pairs a list of five horizontal skill entries with the actual most recent reading. The columns use (1.8fr / 1fr), with a minimum recent-reading width of (280px) and a gap of (42px). Each entry is a full-width row, not a card; the recent section uses the same line-led structure and handles loading, empty, and retry states.

The desktop reader places article and practice in (1.75fr / 1fr) columns, with a minimum practice width of (320px), a gap of (32px), and a light vertical rule. A compact generation-conditions row stays above the workspace. The article/question area scrolls within the reading page, leaving the audio row after it in the desktop flex layout. The audio is persistent within that layout, not a fixed overlay. Opening additional panels can make the outer reading page scroll.

Listening occupies a centered workspace with a maximum width of (1500px). New-practice and history controls unfold their sections above the lesson; the empty state exposes generation directly. The lesson title, topic and provenance precede a full-width player and continuous question sheet. The player sticks to the learning content's top (0px), beneath the shell header, and compacts after its sentinel leaves view. Choice options use two columns with a gap of (4px 28px); each question is separated by a thin rule. Discussion follows submission. The content region owns page scrolling.

The listening transcript occupies the native top layer at the right edge, with a width of `min(560px, 100vw)` below the shell header (52px, or 40px on short desktops). Its own scrolling keeps the transcript heading visible. At or below (940px), listening choices stack, generation becomes two columns and player controls wrap; at or below (650px), generation and history become one column, the seek row spans the player width and the transcript fills the viewport width below the header.

Speaking keeps a notebook with a maximum width of (1000px), centered for coach and sentence practice and left-aligned for article read-aloud beneath its route heading and four-link tool navigation. The notebook scrolls vertically above a separate flex recording region with a strong top rule (2px); the dock reserves layout space and may scroll internally rather than cover the evidence. Its maximum height is (42%), becoming (43%) on small screens. Speaking page gutters are (36px), (26px) at or below (1150px), and (18px) at or below (650px). At or below (1150px), the recording controls receive a full-width flex line rather than shrinking into a tall button column. At the small breakpoint, overview descriptions sit below their names, phone sequences stack, history becomes one column, the article score/qualifier sits below its title, and recording/import controls wrap onto their own lines. The compact tool navigation scrolls horizontally when necessary.

Vocabulary uses (42fr / 58fr) parallel word/reference columns with a neutral rule. Its page gutters are (36px), (26px) at or below (1150px), and (18px) at or below (650px). At or below (900px), the reading and keyboard order is word, reference, memory ratings, optional pronunciation. Four equal ratings become two columns at or below (650px). Above (900px) and no taller than (800px), tighter spacing removes the normal (380px) reference reserve so ordinary short answers expose all ratings in compact desktop windows. Complete meanings and examples grow naturally in the shared content scroller. These local Vocabulary rules override the earlier contextual vocabulary-list layout below.

Records and Settings use the same (36px), (26px) and (18px) gutters at the existing (1150px) and (650px) thresholds. Utility content grows in the shared scroller. Settings starts with wrapping section links; learner and language groups stack at or below (1150px). At or below (650px), record results follow their full text and the three role-voice fields stack. These are local utility layouts, not new shell or token rules.

Responsive behavior is explicit:

- Above (1500px), page gutters widen and the reader gap becomes (40px).
- At or below (1150px), the rail becomes (174px), gutters become (26px), the reader uses (1.4fr / 1fr) with a (280px) minimum practice column, and the generator becomes two columns.
- At or below (940px), the rail becomes (145px), gutters become (22px), home columns stack, and the reader becomes article followed by practice. The dividing rule becomes horizontal; the whole content region scrolls naturally, with audio following the reader. Vocabulary lists become two columns.
- At or below (650px), the rail becomes a (220px) drawer with a dark translucent backdrop. A menu button appears in the header, gutters become (18px), and generator, history, and vocabulary lists use one column.
- Above (940px) in viewports no taller than (800px), the header becomes (40px), top/bottom page padding becomes (18px), home entries become (78px) tall, and reading headings and gaps compact.

The drawer moves focus to the current navigation item, traps Tab within its links, closes with Escape or the backdrop, and returns focus to the menu. The main column is inert while it is open. Route changes focus the new page heading; a skip link reaches the learning content.

## Elevation & Depth

The documented surfaces use no box shadows. White space, thin rules, black/white inversion, and light gray state fills provide separation. The mobile drawer backdrop obscures the underlying content without adding a raised-card vocabulary. Paragraph location uses a thin outline; quoted evidence uses a neutral highlight and underline.

**The Flat Surface Rule.** Retain line and tone as the means of separation for piano surfaces; do not inherit decorative shadows from older module pages.

## Shapes

Controls, fields, answer options, and large content regions are square. Dividers and borders are generally (1px); the selected analysis tab adds a (2px) black underline. Small circular identity and native radio/range controls remain functional exceptions. Icons are inline SVG line drawings (18px in a 24-unit viewBox), with a stroke width of (1.6), rounded stroke caps, and no icon-font dependency.

## Components

### Buttons

Actions are compact and explicit. The primary variant uses a dark fill; the secondary variant uses a white surface and gray border. Both share a minimum height of (40px), a square shape, and room for a label plus a line icon. Text actions use an underline with a (4px) offset and a minimum height of (32px). Icon-only controls have a minimum target of (36px).

Hover changes the surface tone; the filled primary lightens to its hover token. Buttons animate background color over (120ms ease) only when reduced motion is not requested. Disabled filled/outlined buttons use opacity (0.5) and the disabled cursor.

Speaking, Vocabulary and utility-page disabled buttons keep full opacity with muted text, a soft neutral fill and a gray border, preserving readable recording, submission and save states. Selected word buttons use a (2px) underline and soft gray fill in addition to their written verdict. Records and all Settings forms reuse the existing square controls.

### Inputs / Fields

Fields are white, full-width, and square, with a gray stroke and a minimum height of (42px). Labels remain visible above the field; helper copy sits below rather than becoming a decorative badge. Native selects, checkboxes, radio controls, and the audio range retain their platform behavior and neutral accent. Errors use a neutral bordered message and readable explanatory text.

### Navigation

The sidebar is a single black plane. Current location is a full-width white key with dark text; hover uses a darker gray row. Primary skill links have a minimum height of (48px), while home and utility links use a compact (42px) row. Chinese navigation carries quieter English companions; English navigation uses its own labels without duplicate translations. A separate bottom group holds records, settings, and the local identity.

Pointer navigation reveals the current white key with a left-to-right clip over (160ms), using the existing `cubic-bezier(.23,1,.32,1)` ease-out. Text and paper invert together instead of crossing through gray. Keyboard and reduced-motion changes are immediate. Shared square buttons respond to a pointer press with (1px) downward movement over (100ms), then return over (160ms); keyboard activation keeps its position. The existing button-tone transition remains.

On small screens, pointer-opened navigation slides from the left over (220ms), with (160ms) opacity on the panel and backdrop. CSS discrete display transitions retain the exit only where supported; otherwise opening and closing are immediate. The closed panel and backdrop become inert immediately, main content becomes available on close, and focus returns without waiting for an animation. Escape, keyboard activation and reduced motion use immediate state changes. Motion does not delay routing, saving or learning content.

Keyboard focus uses a (2px) dark-ink outline on the white canvas, offset (4px) from normal controls and (2px) from fields. Filled controls retain this dark outline even when their label is white. Sidebar links use their current text color in a (2px) ring inset (4px); navigation rows paint that ring above the moving white key. Programmatically focused page headings and reading-question headings suppress that ring while preserving focus and visibility. Listening's unanswered-question prompt uses a quiet (1px) outline with a (5px) offset when focused.

### Home Skill Entries

All five home entries rest on equal white rows. Each row contains the skill name, a short purpose, and a right arrow; thin bottom rules provide rhythm. The base entry height is (88px), with language-specific name widths to preserve alignment.

**The Equal Keys Rule.** No skill is pre-inverted or permanently promoted. Fine-pointer hover and keyboard focus reveal a left-to-right inversion over (220ms), using `cubic-bezier(.4, 0, .2, 1)`. Touch has no sticky hover treatment. With reduced motion, the same state change is immediate.

### Lists / Containers

Recent reading, reading history, saved vocabulary, generation settings, and analysis sections are organized with rules and spacing rather than a decorative card grid. History rows use a quiet gray hover/current state. Loading placeholders are static neutral bars. The home continues an actual saved reading; the documented review captures use isolated fixtures, not migrated user records.

### Questions & Evidence

Numbered square question controls identify the current question through black fill and white text. Answered questions also have a dark bottom rule. Reading question groups are named by the English prompt and described by their question type; gap inputs include the question number and prompt in their accessible name. Answer options are bordered rows with native radio inputs; selection adds a light gray fill and darker border. Written answer summaries, check/close line icons, quotes, and explanations carry review meaning without relying on success/error colors.

Changing questions focuses the new prompt and scrolls it into view. Locating evidence focuses and reveals its paragraph, highlights the matching quote when present, and offers a return action that restores the question context. Evidence scrolling is smooth only when reduced motion is not requested. AI provenance sits below the article title, alongside the reading tools, so it does not displace the content's heading.

### Completed Practice & Return to Evidence

Reading and Listening share a quiet completion response after a saved submission. A ruled summary states the actual correct/total count and practice percentage, with white answer keys and check icons for correct answers, black keys and return arrows for answers to revisit. Every key has a written accessible verdict; the first missed answer has a plainly labeled shortcut. All-correct and all-incorrect messages reflect the stored answers, without claims of mastery. Keys are at least (44px × 52px), wrap naturally and retain visible keyboard focus. Reading marks the current question with an outer outline, replaces its duplicate review navigation with this key row, and shows the summary only in the questions view. Listening keys move within its continuous answer sheet. Selecting a key focuses the corresponding prompt; fresh submissions focus the result after the saved result is rendered. The response is immediate and static for all input and motion preferences, with no sound, extra request or celebration delay. AI evidence, scoring and learning-record persistence remain unchanged.

### Reading Audio

The audio row is separated by a strong top rule. A square play/pause control is followed by its label and voice, tabular time labels, a native seek range, and a speed select. Preparation and failure states occupy the same row with status text and a retry action. The row wraps on smaller screens. UI language changes labels independently from the existing AI explanation language; English article content remains identified as English.

### Listening Sheet & Evidence

All questions remain in one continuous sheet. Each fieldset is named by its English prompt and described by its number/type legend; gap inputs also include the question prompt in their accessible name. Native radio choices use a quiet hover surface and a selected gray fill with a visible border. Selection changes background and border over (120ms ease) only without reduced motion. Missing answers focus the first unanswered prompt; submitted results receive focus and scroll into view. Feedback uses written answers, line icons, explanations and quoted evidence.

The transcript is a native `popover="auto"` with dialog semantics and no modal backdrop or focus trap. Pointer opening enters from the right over (240ms), using `cubic-bezier(.23,1,.32,1)`; closing uses (180ms). Keyboard opening and reduced-motion changes are immediate. Escape, light dismissal and the return action close it and restore the original question control without moving the sheet's scroll position. Evidence paragraphs are revealed below the sticky transcript heading and use a neutral fill with an outline. Revealing the transcript before submission retains assisted-practice tracking.

Selecting text and opening the collector retains the existing vocabulary flow. Listening's `appearance="piano"` collector uses white, neutral borders, square controls and a dark text selection. Within the transcript it sticks to the panel bottom; elsewhere it is a centered bottom utility surface. This is a contextual collector variant, not a new card vocabulary.

### Listening Audio & Sound Columns

The listening player uses a strong top rule (2px), the square listening-play token, voice provenance, native seek and speed controls, a labeled five-second rewind and a visualization switch. Preparation, failure and retry occupy the same player. Compact mode hides the visualization and reduces vertical padding to (9px); controls remain usable. Reply audio uses the same compact control language and requests synthesis only when explicitly invoked.

The main visual is (48) slender columns in a (64px) region, with black and neutral-gray columns and a settled `scaleY(.035)` state. It reads actual analyser frequency bins from the speech band (0–8kHz, bounded by the audio sample rate). Updates are capped at (30fps) and write column transforms directly, outside React rendering. A single AudioContext per used player is created lazily on playback; the analyser uses an FFT size of (256) and smoothing of (0.8). Pause, compact mode, visualization removal, reduced motion, an offscreen visual and a hidden document stop drawing. Reduced motion hides the columns and keeps the ordinary media controls and progress.

**The Sound Follows Audio Rule.** Columns respond only to actual audio data; silence and pause do not generate decorative motion. Playback never waits for the visualization. A failed graph or resume operation disables the visual; when the media element has already been captured by Web Audio, a fresh ordinary media element restores its position and speed and resumes playback.

### Speaking Notebook & Pronunciation Evidence

The overview presents three equal ruled practice entries, filterable saved history and disclosed service status. Entry hover/focus inverts the row; its tone transition lasts (120ms ease) only without reduced motion. The four-link tool navigation marks the current route with a dark (2px) underline. Coach turns form one continuous reading order; native disclosures retain each earlier turn's reply, pronunciation result and coaching. The current turn starts open.

Word evidence stays inline beneath the sentence result or active article paragraph. Dictionary IPA is labeled as learning reference; matching, word ownership and recognition confidence remain separate metrics. Two phone columns show the actual target and recognized arrays, stacking on narrow screens. Per-phone operations/confidence, transcript correction and per-paragraph attempt history are hidden by default and independently enabled in Settings → Speaking feedback display; enabling them restores their existing disclosures and controls. The original target and recognized phone arrays remain visible. Parameters, timing and export disclosures retain their existing behavior. Article selection is scoped to its paragraph; pending words show unavailable evidence. Each paragraph heading pairs its own current reference score with the paragraph number; pending scores use an em dash and partial scores identify their assessed scope. Coverage and the assessed-portion qualifier remain. Routine submission timestamps, repeated partial-result notices and the automatic transcription disclosure are omitted; a failed latest submission retains the previous score with a short explicit message.

Recording, manual stop, file import, playback and submission remain in the reserved dock with written state. Coach and sentence AudioCapture retain playback before submission; article uses its existing independent recording player. Shared AudioCapture and ReferenceSpeech expose an optional piano appearance; other modules keep their default controls. Existing model, scoring, voice and persistence behavior is outside this visual extension. UI labels can switch language while practice text and model-generated coaching retain their original language.

Source references: `apps/web/src/app/speaking.css`, `components/experiments/SpeakingFrame.tsx`, `ExperimentOverview.tsx`, `ExperimentCoach.tsx`, `ExperimentPronunciation.tsx`, `ArticleReadingExperiment.tsx`, `SpeakingTimeFeedback.tsx`, `ExperimentFeedback.tsx` and `PronunciationReference.tsx` under `apps/web/src`. The Speaking route layout mounts the frame within the shared LearningShell. Acceptance and code-led design comparison are recorded in `.impeccable/review/speaking-production/`; legacy assessment fallback styles are retained for old records rather than promoted into this system.

### Vocabulary Recall & Reference

Four local work areas expose Review, Word library, Wordbooks and Import. Personal and all-word scopes share the library. A deck selector and real due/new/word/today counts lead directly into the review work area; no invented progress is shown. Full saved meanings, examples, dictionary spelling and source context remain original learning content.

Show answer or Space reveals the reference side, focuses the meaning and preserves the word. Only then do four equal neutral recall actions show their actual FSRS intervals. Answer reveal uses (180ms) opacity/vertical motion with `cubic-bezier(.23,1,.32,1)` only without reduced motion; the reduced-motion state is immediate. After a rating, focus returns to the next word. Shortcuts do not intercept fields, controls, the editor or pronunciation practice.

Word audio and collection remain beside the word. Optional pronunciation is on the left on desktop and after the primary recall/reference/rating sequence when stacked. Its manual record/stop lifecycle, automatic submission after stop and target/recognized phone evidence remain independent from scheduling. Native source, phoneme-detail and review-settings disclosures keep secondary material accessible. Library entries and wordbooks use ruled rows; imported fields have explicit mapping and a horizontally scrollable preview rather than a compressed table. Request loading and retry states remain visible.

Source references: `apps/web/src/app/vocabulary.css` and `apps/web/src/components/vocabulary/`. Review, code-led comparison, isolated functional verification and Electron delivery evidence are recorded under `.impeccable/review/vocabulary/`. No raster UI assets are shipped by this extension.

### Writing Original & Linked Corrections

Compact document and submission selectors lead to three work views: editable draft, annotated original and full feedback. The submitted original is immutable. On desktop, the original and selected correction share a ruled 60/40 workspace; the compact desktop uses 56/44, and narrow viewports stack complete content. Selecting a marked phrase focuses its matching correction; Locate in original returns focus to that exact phrase. The selected phrase uses black/white inversion, with written correction status retained.

The bounded draft keeps question settings in a native disclosure, with the timer, save status and submission controls beside the writing task. The full review retains criterion evidence, reasons, next steps, expressions, exercises and model/rubric metadata. Score estimates, incomplete checking and assisted comparisons remain explicit; interface language does not rewrite the essay or AI explanations. Autosave, immutable versions, revision guards and position-checked apply/ignore/undo retain their existing behavior.

Source references: `apps/web/src/app/writing.css`, `apps/web/src/components/writing/WritingWorkspace.tsx` and `WritingReport.tsx`. Code-led comparison, synthetic UI verification, review and delivery status are recorded under `.impeccable/review/writing/`; those records distinguish interface evidence from model-accuracy testing. This extension changes no global tokens and ships no raster UI assets.

### Records & Settings

Records use a compact strip of real counts, native module/source filters and ruled rows. Preserve complete saved text, written score context, unscored states, resource links and incremental history loading; a score's scale stays visible beside it. Settings use underlined section links and ruled groups with visible field labels, helper copy and explicit save actions. The model subpage retains its provider, API, explanation-language and protected-key controls; voice selection retains global and A/B/C roles with optional preview. Feedback-display options remain three independent switches. Status and failure messages use the existing neutral notice treatment.

Source references: `apps/web/src/app/utilities.css`, the Records and Settings routes under `apps/web/src/app/(dashboard)/`, and their existing learning, language, speech, experiment and model settings components. Scoped browser verification and delivery limits are recorded in `.impeccable/review/utilities/ACCEPTANCE.md`; synthetic fixtures do not establish external-provider operation or refreshed Electron delivery. This extension adds no global tokens or component primitives.

## Do's and Don'ts

### Do:

- **Do** build new piano surfaces from true white, black, and neutral rules with square controls.
- **Do** preserve equal resting emphasis for all five home skill entries.
- **Do** keep article prose spacious and make answer evidence easy to locate and return from.
- **Do** provide visible keyboard focus, meaningful labels, and immediate state changes for reduced motion.
- **Do** keep interface language independent from AI explanation language and learning content.
- **Do** treat the existing shell, home, reader, listening workspace, four Speaking routes, Vocabulary and Writing workspaces, Records and Settings as the implemented reference when extending this system.
- **Do** keep listening playback controls available when columns stop or the audio graph fails.
- **Do** preserve Speaking's original phone evidence, separate metrics, pending states and previous successful results alongside written feedback.

### Don't:

- **Don't** promote the older green/cream palette, decorative fonts, rounded cards, or shadows into piano tokens.
- **Don't** turn the home entries into a prioritized card grid or keep one entry inverted at rest.
- **Don't** replace written feedback and quoted evidence with color alone.
- **Don't** add custom desktop window controls or treat unused drag-strip CSS as implemented behavior.
- **Don't** turn Speaking's semantic verdict colors or legacy assessment fallback styles into global decorative tokens.
