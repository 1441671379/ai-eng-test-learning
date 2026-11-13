---
version: 1
slug: "c-components-writing-writingworkspace-tsx-90ef2980"
primary_target: "apps/web/src/components/writing/WritingWorkspace.tsx"
related_targets: ["apps/web/src/app/(dashboard)/writing/page.tsx","apps/web/src/components/writing/WritingReport.tsx","apps/web/src/app/writing.css"]
---

# Writing workspace

Scope: standalone Writing route, draft editor, immutable annotated submissions, linked corrections, full review, history and revision. Mode: Operate. User confirmed all existing functionality unchanged and selected writing-linked-comments, code-led.

## Direction contract

THESIS: Make the original phrase and its actionable correction legible together. Replace the old tall form/card preamble with direct access to writing and evidence.

OWN-WORLD: Inherit Piano Workspace: white canvas, black global rail, neutral fine rules, square controls and the existing interface type. Original learning content and AI explanations keep their language.

STORY: Write and save a draft, submit, inspect an immutable original beside its corrections, understand full criteria feedback, then revise and submit again. Draft edits never rewrite submitted originals or their scores.

FIRST VIEWPORT: Compact title/actions and document/version controls; three work views. Annotated view places original text at60% and linked comments at40%, with a small real score/criteria row above. Draft view prioritizes the actual editor; long content remains complete and narrow viewports stack with a return-to-original action.

FORM: Linked original and comments, candidate4 in the ordered structures, dealt lead and user-selected first card. seed:d884d8a69eda149a. Approved HTML: .impeccable/mocks/decision/writing-linked-comments.html; no PNG comp generated. Example numbers in the sketch do not create new API fields.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Preserve autosave/recovery, timer, limits, model/prompt failure states, immutable versions, position-checked apply/ignore/undo and manual-edit conflict guards, assisted lineage, partial/unavailable feedback, all four criterion evidence/reasons/next steps, optional expressions/exercises, score-comparison qualifiers, source metadata and word collection. No model/scoring/schema changes or production data fixtures.
