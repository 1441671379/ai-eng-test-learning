import { ExperimentError } from "../types";

export const MAX_COMPARISON_SECONDS = 30;
export const MAX_COMPARISON_BYTES = 44 + 16000 * 2 * MAX_COMPARISON_SECONDS;

/** Canonical WAV only: the exact validated bytes are persisted and sent to both providers. */
export function validateComparisonWav(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, value: string) => [...value].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  if (bytes.length < 46 || bytes.length > MAX_COMPARISON_BYTES || !tag(0, "RIFF") || !tag(8, "WAVE") || !tag(12, "fmt ") || !tag(36, "data") ||
      view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 ||
      view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 || view.getUint32(28, true) !== 32000 ||
      view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 || view.getUint32(40, true) !== bytes.length - 44 || (bytes.length - 44) % 2) {
    throw new ExperimentError("对照录音必须是 30 秒内的 16 kHz / 16 bit / 单声道 PCM WAV，请从对照实验页面重新提交。", 422);
  }
  return (bytes.length - 44) / 32;
}

export function encodeComparisonWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => { const n = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + i * 2, n < 0 ? n * 32768 : n * 32767, true); });
  return buffer;
}
