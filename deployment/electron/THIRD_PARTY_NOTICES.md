# Components in the public Windows desktop build

- Electron/Chromium: LICENSE and LICENSES.chromium.html alongside the application.
- Python: runtime/python/LICENSE.txt; package licenses remain in dist-info directories.
- Node.js 24: https://github.com/nodejs/node/blob/main/LICENSE
- Speech/language upstream MIT notices are preserved. The English CTC alignment adaptation retains its BSD license in licenses/alignment. The WhisperX package is not shipped.
- Kokoro-82M: Apache-2.0; model card and license are retained under licenses/. Misaki, spaCy, its English model and eSpeak keep their package notices.
- Lexical pronunciation alternatives: word-pronunciations/catalog.json; CMUdict and wordbook provenance notices are retained with the catalog. No old generated audio pack is shipped.
- Offline speech models: facebook/wav2vec2-xlsr-53-espeak-cv-ft; openai/whisper-base.en; torchaudio WAV2VEC2_ASR_BASE_960H.
- The five public wordbooks (primary, junior, senior, IELTS core and extension) retain editable sources and GPL-3.0/BSD-3-Clause notices in licenses/wordbook-sources. Personal Anki books are not included.
- ECDICT public dictionary: https://github.com/skywind3000/ECDICT, pinned commit bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b; repository MIT notice retained in licenses/ECDICT-MIT.txt. The separate lemma.en.txt file is not included. Its reference SQLite index contains no personal learning data.
- Reference word audio is generated locally using Kokoro; no downloaded recording collection is included.
- Oxford/Pearson source lists and the complete derived knowledge course pack are not included. The knowledge module displays a missing-resource notice until the user prepares permitted course resources.

No local LLM, author API key, recording history, or learning database is embedded.
