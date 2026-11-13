# Components in this local desktop build

- Electron/Chromium: LICENSE and LICENSES.chromium.html alongside the application.
- Python: runtime/python/LICENSE.txt; package licenses remain in dist-info directories.
- Node.js 24: https://github.com/nodejs/node/blob/main/LICENSE
- Speech/language upstream MIT notices are preserved. The English CTC alignment adaptation retains its BSD license in licenses/alignment. The WhisperX package is not shipped.
- Kokoro-82M: Apache-2.0; model card and license are retained under licenses/. Misaki, spaCy, its English model and eSpeak keep their package notices.
- Lexical pronunciation alternatives: word-pronunciations/catalog.json; CMUdict and wordbook provenance notices are retained with the catalog. No old generated audio pack is shipped.
- Offline speech models: facebook/wav2vec2-xlsr-53-espeak-cv-ft; openai/whisper-base.en; torchaudio WAV2VEC2_ASR_BASE_960H.
- Wordbooks retain available sources and licenses in licenses/wordbook-sources. CET4/CET6 are the user's imported Anki books for this local build.
- ECDICT public dictionary: https://github.com/skywind3000/ECDICT, pinned commit bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b; repository MIT notice retained in licenses/ECDICT-MIT.txt. The separate lemma.en.txt file is not included. Its reference SQLite index contains no personal learning data.
- Recorded word audio: selected Wikimedia Commons recordings indexed via Wiktionary/Kaikki. Each recording retains its own author, source, licence and processing notice in licenses/word-audio/ATTRIBUTION.json and app/deployment/word-audio. No blanket licence is claimed for the collection; see licenses/word-audio/NOTICE.md.

No local LLM, author API key, recording history, or learning database is embedded.
