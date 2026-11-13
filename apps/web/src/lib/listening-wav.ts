/** Match sample rates without changing playback speed or pitch before joining voices. */
import { joinReadingWav } from "./reading-wav";
function pcm(input: Buffer) {
  if (input.length < 44 || input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WAVE") throw new Error("语音服务返回无效 WAV。");
  let format: Buffer | undefined, data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= input.length;) {
    const name = input.toString("ascii", offset, offset + 4), size = input.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > input.length) throw new Error("音频不完整。");
    if (name === "fmt ") format = input.subarray(start, start + size);
    if (name === "data") data = input.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!format || format.length < 16 || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || format.readUInt16LE(14) !== 16 || format.readUInt16LE(12) !== 2 || !data?.length || data.length % 2) throw new Error("角色语音需要完整的单声道 16 位 PCM 音频。");
  const rate = format.readUInt32LE(4);
  if (rate < 8000 || rate > 192000 || format.readUInt32LE(8) !== rate * 2) throw new Error("角色语音采样率无效。");
  return { data, rate };
}
function wav(data: Buffer, rate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(36 + data.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
export function joinListeningWav(inputs: { audio: Buffer; pauseBefore: boolean }[]) {
  if (!inputs.length) throw new Error("没有可播放的音频。");
  const parts = inputs.map((part) => ({ ...pcm(part.audio), pauseBefore: part.pauseBefore }));
  const rate = Math.max(...parts.map((part) => part.rate));
  return joinReadingWav(parts.map((part) => {
    let data = part.data;
    if (part.rate !== rate) {
      const frames = part.data.length / 2, count = Math.round(frames * rate / part.rate);
      data = Buffer.alloc(count * 2);
      for (let i = 0; i < count; i++) {
        const position = i * part.rate / rate, left = Math.min(Math.floor(position), frames - 1), right = Math.min(left + 1, frames - 1);
        const fraction = position - left, first = part.data.readInt16LE(left * 2), second = part.data.readInt16LE(right * 2);
        data.writeInt16LE(Math.round(first + (second - first) * fraction), i * 2);
      }
    }
    if (part.pauseBefore) data = Buffer.concat([Buffer.alloc(Math.round(rate * 0.2) * 2), data]);
    return wav(data, rate);
  }));
}
