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

Windows test installers are published separately in GitHub Releases; see
`docs/QUICKSTART.md`. Source ZIP downloads do not contain the binaries.
Prepare the model weights, shared inference environment, tools and dictionary
index before assembling a desktop distribution. The public build uses
`python deployment/electron/build_desktop.py --public`; it intentionally omits
the full course pack and imported books. A separate prepared dictionary directory
can be supplied with `--asset-root PATH`. For a fresh output, `--seed-app PATH`
copies only the immutable Electron/runtime/model assets from a verified prior
assembly; it never copies the prior UI, wordbooks, course pack or learner data.
Use `--public` again when refreshing a public assembly. See
`docs/PUBLIC-RESOURCES.md` for the resource boundary. The shared inference setup
and complete lock are documented in `deployment/kokoro/README.md`.
