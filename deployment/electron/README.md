# Windows Electron application

The active app is `build/EnglishLearning/EnglishLearning.exe`. It carries one
portable copy of `runtimes/inference-kokoro`, three speech-assessment/recognition
models and the shared Kokoro-82M model with four English voices. No local LLM,
legacy synthesis engine or personal learning data is shipped.

- `Start-Desktop.cmd`: run the current built application.
- `Start-DesktopDev.cmd`: use the same desktop services with editable web UI.
- `Build-Desktop.ps1 -RefreshUI`: rebuild web UI and application services.
- `Build-Desktop.ps1 -RefreshInference`: also update runtime and models.
- `Build-Installer.ps1`: build a new installer when requested. Earlier installers
  using the removed synthesis stack have been removed; the source build scripts
  now validate the Kokoro-only manifest.

All learner writes stay in `%APPDATA%/EnglishLearningDesktop`; public dictionaries,
wordbooks, course content and lexical pronunciations are immutable app resources.
Word audio is synthesized locally on demand and cached. Voice A/B/C and global
voice settings are managed in the app settings, independently from learning data.

The public repository contains build code, not a preassembled app or installer.
Prepare the model weights, shared inference environment, tools, dictionary index
and your own course pack before assembling the desktop distribution. See
`docs/PUBLIC-RESOURCES.md` for the resource boundary. The shared inference setup
and complete lock are documented in `deployment/kokoro/README.md`.
