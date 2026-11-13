---
version: 1
slug: "apps-web-src-components-knowledge-knowledgeworkspace-tsx"
primary_target: "apps/web/src/components/knowledge/KnowledgeWorkspace.tsx"
related_targets: ["apps/web/src/app/(dashboard)/knowledge/page.tsx","apps/web/src/components/knowledge/PhraseWorkspace.tsx","apps/web/src/components/knowledge/PhraseCourses.tsx","apps/web/src/app/phrases.css","apps/web/src/app/vocabulary.css","apps/web/src/lib/learning-modules.ts","apps/web/src/lib/practice-continuity.ts"]
---

# Knowledge workspace

Scope: standalone Knowledge route, its existing phrase courses and expression practice, and the new home/sidebar/mobile entrance. Mode: Operate, with Read inside a topic. This is the shipped 2026-10-28 relocation of the former Vocabulary phrase interface; it preserves the Piano Workspace rather than introducing a new visual world. `PRODUCT.md` remains the functional authority.

## Direction contract

THESIS: Give knowledge reading and expression courses their own home while preserving the familiar course, topic and expression flow.

OWN-WORLD: Inherit Piano Workspace: black global rail, white content, neutral fine rules, inherited system sans, square actions and visible keyboard focus. Existing Chinese teaching explanations remain independent of interface language.

STORY: Enter Knowledge alongside Listening, Speaking, Reading, Writing and Vocabulary; choose or resume a course, read a topic, inspect its expressions and practise recall, cloze or sentence writing. Manual notes, saved expressions and optional feedback remain in the same learner database.

FIRST VIEWPORT: Knowledge heading, the selected Phrases & collocations work area, then the existing course directory. Search, subject filtering and ruled rows show real topic/read counts. Narrow screens stack fields and row metadata. Within a course, the bounded desktop outline stays beside the passage; at ≤700px it becomes a horizontal strip above natural reading.

FORM: Code-led ordinary extension and relocation of the shipped course interface. No new comp, seed or concept roll. Root `DESIGN.md` supplies the visual quality bar; no global tokens or primitives change.

## Delivered relocation

Knowledge is the sixth independent learning area at `/knowledge`, with an authenticated route, localized heading and navigation, and an equal home entry. The moved `PhraseWorkspace` and `PhraseCourses` retain search, subject filters, twelve-course pages, course/topic/expression focus destinations and directory return state. The route reuses existing Vocabulary/phrase styles; it does not inherit the word-card 42/58 composition as a Knowledge layout.

The 103 courses, 722 topics and 3,213 expressions retain stable IDs and the existing private phrase database. A pure idempotent checkpoint conversion moves `phrase-*` details out of Vocabulary, carries phrase-page scroll when applicable, preserves ordinary word state and prefers already-existing Knowledge progress. Vocabulary retains its four word-tool tabs and independent FSRS.

Expression details retain reading, usage, English recall, cloze, sentence practice, optional AI sentence feedback, collection, audio and manual notes. The action replacing existing notes with an AI version is removed. An entry without teaching content may still be explicitly prepared or filled manually. Phrase cards, ratings, daily quotas and FSRS remain retired as established by the preceding course extension.

Local type roles remain the inherited 28px route title, 22px course/topic headings, 34px expression heading and 19px / 1.95 prose. Existing narrow roles use 20px course headings, 27px expression headings and 18px prose at ≤700px. White/neutral rules, black selected topics, square shared controls and native disclosures remain; no fonts, palette, imagery or motion were added.

The associated Reading change uses six four-option questions for new practice and explicitly updated unfinished legacy articles. Completed history retains its original questions and scores. It reuses the existing reader controls and evidence layout; functional details belong to `docs/READING-CHOICES.md`, not new global design rules.

## Finish and evidence

Fresh bounded `REVIEW.md` returns ship with no material fixes. All nine required captures, the source/system comparison, actual saved automated outcomes, production bundle checks and isolated test limits are recorded in `.impeccable/review/knowledge-20261028/DOCUMENTATION.md` and `ACCEPTANCE.md`. Existing Electron files were refreshed; there was no fresh native-window launch or installer rebuild. Root `DESIGN.md` and `.impeccable/design.json` remain byte-identical. This scope does not certify teaching accuracy, live model operation or unchanged management/import internals.

## 2026-10-28 correction: directory entry and completed courses

This bounded behavior change supersedes the earlier choose-or-resume and checkpoint-restoration descriptions above. Every Knowledge visit now starts at the unfinished course directory, including reload, leave/re-entry and activating its current entrance. The local Phrases & collocations entrance also resets the directory. Knowledge UI state is visit-local; legacy checkpoints are retained but ignored. Same-route SPA entry remounts the phrase workspace, resets content scroll and focuses the Knowledge heading. Knowledge no longer registers End this practice; the other five areas retain practice resume.

Courses lists unfinished courses only. Completed lists a nonempty course once every topic is marked read; partial courses remain unfinished and open their next unread topic. Completed retains search, subject filtering, pagination and course/topic/expression access. Completing the last topic keeps the current lesson usable. Reading markers indicate progress rather than mastery. Existing SQLite reading progress, manual notes, saved expressions and submitted attempts remain, as do the stable 103 courses, 722 topics and 3,213 expressions.

The five required captures retain the existing Piano canvas, ruled lists, inherited type, square controls and visible focus; no CSS, fonts or global tokens changed. REVIEW.md returns ship with no material fixes. Evidence, the 13 passing UI cases, recorded 228-test/type/lint/build results and Electron refresh limits are bounded in `.impeccable/review/knowledge-completion-20261028/DOCUMENTATION.md` and `ACCEPTANCE.md`. Root DESIGN.md and its sidecar remain byte-identical. This correction does not add installer, native-window, live model or teaching-accuracy validation.
