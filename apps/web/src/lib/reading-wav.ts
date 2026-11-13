/** Join PCM WAVs without changing pitch, speed or the original sample rate. */
export function joinReadingWav(inputs: Buffer[]): Buffer {
  if (!inputs.length) throw new Error("没有可播放的音频。");
  let format: Buffer | undefined;
  const frames: Buffer[] = [];
  for (const input of inputs) {
    if (input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WAVE") throw new Error("语音服务返回无效 WAV。");
    let localFormat: Buffer | undefined;
    let audio: Buffer | undefined;
    for (let offset = 12; offset + 8 <= input.length;) {
      const name = input.toString("ascii", offset, offset + 4);
      const size = input.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (start + size > input.length) throw new Error("音频不完整。");
      if (name === "fmt ") localFormat = input.subarray(start, start + size);
      if (name === "data") audio = input.subarray(start, start + size);
      offset = start + size + (size % 2);
    }
    if (!localFormat || localFormat.length < 16 || localFormat.readUInt16LE(0) !== 1 || !audio?.length) throw new Error("需要非空 PCM 音频。");
    const canonical = localFormat.subarray(0, 16);
    const channels = canonical.readUInt16LE(2), rate = canonical.readUInt32LE(4);
    const bytesPerSecond = canonical.readUInt32LE(8), alignment = canonical.readUInt16LE(12), bits = canonical.readUInt16LE(14);
    if (!channels || !rate || ![8, 16, 24, 32].includes(bits) || alignment !== channels * bits / 8 || bytesPerSecond !== rate * alignment) throw new Error("PCM 音频格式无效。");
    if (format && !format.equals(canonical)) throw new Error("各段音频格式不同，请重试。");
    format = canonical;
    if (audio.length % alignment) throw new Error("音频帧不完整。");
    frames.push(audio);
  }
  const pcm = Buffer.concat(frames);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); format!.copy(header, 20);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
