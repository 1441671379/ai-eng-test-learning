# Local application services

| Service | Capability | Development port |
| --- | --- | --- |
| `tts` | Kokoro synthesis, shared voices and local audio cache | 9881 |
| `speech` | Whisper transcription, phoneme recognition, CTC word timing and pronunciation assessment | 8000 |
| `language` | User-configured external LLM API, material generation and feedback | configured model port |

All workers use the shared `runtimes/inference-kokoro` environment. No local LLM
is loaded. `services/launch.py` and `Start-LearningApps.cmd` start the local stack;
Electron assigns free loopback ports and starts the same services automatically.

All reference speech uses Kokoro through the public `/reference-audio` contract.
External LLM calls use the application-owned `language/external_llm.py` adapter;
they do not depend on a capability-library checkout or any TTS resource folder.
The phoneme scoring and boundary-tolerant word matching are unchanged. The
application carries the required CTC alignment components, not WhisperX itself.
The complete inference lock is `deployment/kokoro/requirements.lock.txt`.
