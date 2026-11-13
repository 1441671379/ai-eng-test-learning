import { encodeComparisonWav, MAX_COMPARISON_SECONDS } from "./audio";

export async function prepareComparisonAudio(blob: Blob): Promise<File> {
  if (!blob.size || blob.size > 25 * 1024 * 1024) throw new Error("请选择不超过 25 MB 的录音。");
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (!decoded.length || decoded.duration > MAX_COMPARISON_SECONDS) throw new Error("对照实验每次最多 30 秒，请缩短录音后重试。");
    const render = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const mono = render.createBuffer(1, decoded.length, decoded.sampleRate), samples = mono.getChannelData(0);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const source = decoded.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) samples[i] += source[i] / decoded.numberOfChannels;
    }
    const source = render.createBufferSource(); source.buffer = mono; source.connect(render.destination); source.start();
    const rendered = await render.startRendering();
    return new File([encodeComparisonWav(rendered.getChannelData(0))], blob instanceof File ? blob.name.replace(/\.[^.]+$/, "") + ".wav" : "recording.wav", { type: "audio/wav" });
  } finally { await context.close(); }
}
