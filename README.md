# Echo Vision — Interface build 01

Standalone private storytelling prototype. Source of direction: Echo Vision Master Concept Bible v1.1 and owner's October 11 decisions. No Homelancer or Chronicle Clash canon is imported. Mira is a new placeholder character.

## Run
Serve `app/` with any static web server. No build or dependency installation is needed. ES modules require HTTP rather than opening index.html directly.

## Working features
- Mobile-first setup: player identity, scene, companion, voice, conversation.
- Cast and scene creation; editable persona and protected-memory text.
- Portrait and scene uploads, stored in IndexedDB on the current device.
- Optional silent idle-loop upload, validated at 15 seconds or less and 20 MB or less.
- Browser speech synthesis voice enumeration, preview and selection; per-session voice retained.
- Browser speech recognition when supported and permitted; transcribes into composer for review before sending.
- Local conversation history, session selection, manually editable story drafts and text export.
- On-device voice cloning: record or upload 5–10 seconds, then hear any line in that voice and save it as WAV. Runs in the browser with Pocket TTS (Kyutai, CC BY 4.0) through the MIT-licensed pocket-voice worker in `app/vendor/pocket-voice/` (see its NOTICE.md). The model and runtime are served from this repo (`app/models/`, `app/vendor/ort/`, refreshed by `tools/fetch-voice-model.sh`), with the public copies as fallback; samples and text are not uploaded. `docs/voice-pipeline.md` covers turning a generated video clip into a character voice with `tools/clip-to-voice.sh`. A consent checkbox is required before a sample is saved.
- On-device AI brain (test): the "AI brain" switch in chat runs a small open model (Llama 3.2, 1B or 3B) in the browser with WebLLM (`app/vendor/web-llm/`, Apache-2.0). It uses the character's persona, the scene and recent messages, and tags each reply with one of five emotions. Needs WebGPU; the model downloads from Hugging Face on first use. No long-term memory yet.
- Clearly labeled scripted dialogue mode for interface testing. Turn it off to write manual dialogue through the storybook.

## Not connected
No LLM, generated narration, automatic persona extraction, cloud sync or MP3 export. Cloned voices are English-only for now and are rebuilt from the saved sample on each visit. No API keys are collected. Browser TTS/recognition availability varies and browser service voices/recognition may use the device vendor's services. Private hosting and browser-local storage are distinct: files do not sync across devices. Clearing browser storage loses local stories/media; export story text to retain it. Draft edits are not overwritten when new transcript messages arrive.

## Next integration
Use a server-side provider adapter for character dialogue and TTS; keep credentials out of the client. Dialogue requests should carry character identity/persona, selected scene, protected memories and recent messages. Return reply text and an emotion enum (normal, happy, sad, surprised, scared). Add authenticated cloud persistence and a consent-backed voice provider before activating cloning. Current browser voices are temporary previews, not guaranteed consistent across devices.

## Verification
`node --test tests/core.test.mjs`
`node --check app/app.js`
Logic tests cover loop boundaries, transcript export and scene-aware demo text. Browser visual QA and actual microphone/TTS playback were not available in this build environment; test on the target Android browser.

## Repository layout

The prototype lives in `app/` and uses relative asset paths. Public URL: https://houawanych-pixel.github.io/myechovision/app/

The root `CNAME` (`myechovision.com`) is intentionally removed while the custom domain's DNS/HTTPS is broken. Do not restore it until the domain serves a valid certificate; the value is recoverable from Git history. Code development continues in this repository; the earlier Sites preview is a separate snapshot, not automatically synchronized.
