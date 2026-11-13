# Runtime and model source references

The installed app retains the Python/package licenses under `runtime/python` and
Electron/Chromium notices next to `EnglishLearning.exe`. Public wordbook sources
and their GPL/BSD licenses are included under `licenses/wordbook-sources` and in
the Git repository. IPA lexical sources and their notices remain in services.

- Node.js: bundled version recorded in `runtime/NODE_VERSION.txt`; full matching
  license is `Node-LICENSE.txt`. Source: https://github.com/nodejs/node/tags.
- Whisper base.en model: https://huggingface.co/openai/whisper-base.en;
  code/model source: https://github.com/openai/whisper, MIT (`Whisper-MIT.txt`).
- Phoneme model: https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft,
  Apache-2.0; full license is `../Wav2Vec2-phoneme-Apache-2.0.txt`.
- Word alignment model: torchaudio `WAV2VEC2_ASR_BASE_960H`, redistributed under
  MIT, with Fairseq notice in `Wav2Vec2-alignment-MIT.txt`. Model documentation:
  https://docs.pytorch.org/audio/stable/generated/torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H.html.
- Kokoro: https://huggingface.co/hexgrad/Kokoro-82M, Apache-2.0; model card and
  license are retained under the parent licenses directory.
- FFmpeg executable: Gyan's `7.1-essentials_build-www.gyan.dev`, GPLv3, separate
  executable used to decode audio. Notice: `FFmpeg-GPL-3.0.txt`. Upstream source
  for this version: https://github.com/FFmpeg/FFmpeg/tree/n7.1. Binary distributor,
  versioned archive and source references: https://www.gyan.dev/ffmpeg/builds/
  and https://github.com/GyanD/codexffmpeg/releases/tag/7.1.

These notices do not grant a new license for unrelated code or course content.
