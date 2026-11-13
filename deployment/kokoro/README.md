# Kokoro shared inference runtime

All application speech synthesis uses Kokoro-82M. The shared environment is
`runtimes/inference-kokoro`: Python 3.11.9, CUDA PyTorch/torchaudio 2.7.0,
Transformers 4.57.6, NumPy 2.2.6 and Kokoro/Misaki 0.9.4.

Heart, Puck, Emma and George share one model. Heart is the default. Global and
listening-role A/B/C choices are persisted independently of learning records.
The dedicated `kokoro_api.py` worker serves mono PCM16 24 kHz WAV. The speech
assessment worker calls it through `remote_tts.py`, without loading another copy.

Words are synthesized locally on demand and cached. Explicit alternative lexical
readings live in `deployment/word-pronunciations`, separately from recordings and
models. The obsolete generated audio pack is not required. Disabling network
recording downloads does not disable local synthesis.

`deployment/tts/runtime.json` selects the sole supported runtime and settings.
There is no legacy engine fallback. To recreate the environment, run
`setup_candidate.py --model-source <local Kokoro-82M directory>` with Python 3.11;
it creates a venv and installs `requirements.lock.txt`, including the shared CUDA
inference dependencies. `assets.json` records model hashes. Only English text
processing resources and four selected voice embeddings are included.

Use `Build-Desktop.ps1 -RefreshUI` for UI/services updates and
`Build-Desktop.ps1 -RefreshInference` when dependencies or model assets change.
Neither command creates an installer. These updates do not touch learner data.

Verification scripts: `validate_candidate.py` (real local synthesis and scoring),
`voices.test.mjs` (role persistence and cache isolation), `test_remote_tts.py`
(service failures) and `desktop_acceptance.py` (real Electron HTTP interfaces,
using an isolated test profile). The earlier control comparison in `qa/` is a
historical report; its runtime is no longer needed by the application.

See LICENSE.Kokoro.txt and the model card for model/code provenance. Lexical
pronunciation notices remain with their independent catalog.
