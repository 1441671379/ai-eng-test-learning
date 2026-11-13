import type { ComparisonRecord } from "./types";
import { comparisonMode, comparisonPhones, detailedComparison } from "./details";

export const COMPARISON_NOTES = "Same canonical WAV for both providers; local phonemeMatch, decoder confidence, and Tencent accuracy have different definitions. All normalized scores use 0–100. Tencent sentence mode (1) overall/word/phone accuracy uses scale 100. Word correction (4) overall and phone accuracy uses documented scale 1, word accuracy scale 100; raw phone scores and scales are retained. Fluency/completion uses scale 1; correction-mode completion is inapplicable. Missing, negative, or out-of-range normalized values are null. Local coverage is not Tencent completion. Local phone peak times are not start/end boundaries. Missing ReferencePhone is never fabricated. Stress is mode-dependent; Chinese Tone is inapplicable to English. Word indexes are zero-based; sequence alignment may be ambiguous, inspect raw responses. Audio is downloadable by record id; audio.id is SHA-256 of the WAV. No score deltas or calibrated exam scores.";
function cell(value: unknown) {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Spreadsheet-safe even for filenames, error bodies, reference text, and later manual labels.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
const csv = (rows: unknown[][]) => "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
export function exportComparisons(input: ComparisonRecord[], format: "jsonl" | "csv" | "words" | "phones") {
  const records = input.map(detailedComparison);
  if (format === "jsonl") return records.map(record => JSON.stringify({ ...record, exportNotes: COMPARISON_NOTES })).join("\n") + (records.length ? "\n" : "");
  if (format === "phones") return csv([
    ["schema_version", "record_id", "created_at", "audio_id", "provider", "eval_mode", "provider_word_index", "target_word_index", "word", "phone_index", "reference_phone", "recognized_phone", "accuracy_0_100", "raw_accuracy", "raw_accuracy_scale", "decoder_confidence_0_100", "match_tag", "local_operation", "start_ms", "end_ms", "local_peak_ms", "reference_stress", "detected_stress", "reference_letter", "human_label", "human_notes"],
    ...records.flatMap(record => (["local", "tencent"] as const).flatMap(provider => (record[provider].metrics?.words || []).flatMap(word => comparisonPhones(word, provider, comparisonMode(record)).map(phone =>
      [record.schemaVersion, record.id, record.createdAt, record.audio.id, provider, comparisonMode(record), word.index, word.targetIndex, word.word, phone.index, phone.expected, phone.heard,
        phone.accuracy, phone.rawAccuracy, phone.accuracyScale, phone.confidence, phone.matchTag, phone.operation, phone.startMs, phone.endMs, phone.peakMs, phone.stress, phone.detectedStress, phone.referenceLetter, "", ""])))),
  ]);
  if (format === "words") return csv([
    ["schema_version", "record_id", "created_at", "text", "audio_id", "provider", "provider_status", "provider_word_index", "target_word_index", "alignment", "word", "start_ms", "end_ms", "accuracy_0_100", "phoneme_match_0_100", "fluency_0_100", "decoder_confidence_0_100", "match_tag", "verdict", "phones_json", "human_label", "human_notes", "eval_mode", "tone_valid", "reference_tone", "detected_tone"],
    ...records.flatMap(record => (["local", "tencent"] as const).flatMap(provider => (record[provider].metrics?.words || []).map(word =>
      [record.schemaVersion, record.id, record.createdAt, record.text, record.audio.id, provider, record[provider].status, word.index, word.targetIndex, word.alignment, word.word, word.startMs, word.endMs, word.accuracy, word.phonemeMatch, word.fluency, word.confidence, word.matchTag, word.verdict, word.phones, "", "", comparisonMode(record), word.tone?.valid, word.tone?.reference, word.tone?.detected]))),
  ]);
  return csv([
    ["schema_version", "record_id", "created_at", "text", "audio_id", "audio_sha256", "audio_filename", "audio_bytes", "duration_ms", "local_status", "local_error", "local_phoneme_match_0_100", "local_scored_coverage_0_100", "tencent_status", "tencent_error", "tencent_request_id", "tencent_suggested_score_0_100", "tencent_accuracy_0_100", "tencent_fluency_0_100", "tencent_completion_0_100", "local_request_json", "tencent_request_json", "local_raw_response", "tencent_raw_response", "human_label", "human_notes"],
    ...records.map(r => [r.schemaVersion, r.id, r.createdAt, r.text, r.audio.id, r.audio.sha256, r.audio.filename, r.audio.bytes, r.audio.durationMs, r.local.status, r.local.error, r.local.metrics?.phonemeMatch, r.local.metrics?.coverage, r.tencent.status, r.tencent.error, r.tencent.requestId, r.tencent.metrics?.score, r.tencent.metrics?.accuracy, r.tencent.metrics?.fluency, r.tencent.metrics?.completion, r.request.local, r.request.tencent, r.local.rawResponse, r.tencent.rawResponse, r.annotation.label, r.annotation.notes]),
  ]);
}
