# My Echo Vision — Interface build 01

Standalone private storytelling prototype. Source of direction: My Echo Vision Master Concept Bible v1.1 and owner's October 11 decisions. No Homelancer or Chronicle Clash canon is imported. Mira is a new placeholder character.

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
- Built-in brain: if the site has `app/brain.json` (`{"url": "<proxy>/v1", "model": "…"}`) pointing at the deployed `worker/brain-proxy.js`, every visitor gets the AI brain with no key; a brain chosen on the device still wins. The Create flow's story step shows the brain and connects it, and new stories start with it on.
- Fast AI brain: the "AI brain" switch in chat can use any OpenAI-compatible service (a hosted model, the proxy in `worker/brain-proxy.js`, or a model on your own computer). The key is typed into the app and kept only in that browser, never in this repo. Hands-free talk with a fast brain prepares the answer while you are still speaking. With a fast brain the app also has a vision model describe each portrait and scene picture once; that text is saved with the character or scene, is editable in the character form, and is given to the brain so replies match what is on screen. See `docs/brain-setup.md`.
- Story script: in Book, the brain drafts an outline (intro, body, conclusion, key events) and then writes the companion's lines ahead of time; all of it is editable. In chat, "Story script" plays the next prepared line on each turn with no live generation. "Prepare voice" renders every line in the character's cloned voice once and keeps the audio on the device, so cloned voices answer without waiting. The lines are fixed in advance, so they do not react to exactly what the player says.
- Expressions, actions and green screen: each character can have one picture or short video per expression (normal, talking, happy, sad, surprised, angry, scared, yes, no) and per action (two dances, wave, laugh, thinking, plus your own named ones). A reply's emotion tag picks the clip; actions have buttons in chat and respond to being asked. Green or blue backgrounds are removed on the graphics chip (`app/stage.mjs`, WebGL) so the character stands in front of the scene, which can now be a picture or a looping video.
- On-device AI brain (test): the "AI brain" switch in chat runs a small open model (Llama 3.2, 1B or 3B) in the browser with WebLLM (`app/vendor/web-llm/`, Apache-2.0). It uses the character's persona, the scene and recent messages, and tags each reply with one of five emotions. Needs WebGPU; the model downloads from Hugging Face on first use. No long-term memory yet.
- Create a story in four steps: who you are (upload a picture or pick from a sideways-scrolling row), the scene (rows of pictures, looping videos of 15 seconds or less, and 3D worlds: the built-in starship or your own .glb), who you meet (upload a photo, a video or a 3D model, rigged or not; voice library or your own voice; Auto persona) and the story (a beginning, any number of chapters and a conclusion, written yourself or with Auto outline; campaigns can be saved and loaded). Auto features note that they use the AI brain's credits. A story in a 3D world opens the walk mode with that world and companion.
- Walk the ship (`app/ship.html`): a first-person 3D walk through decks 4–6 of the Homelancer starship model (`app/assets/ship/decks.glb`, exported from Blender, plus `layout.json` for floors, doors and lifts). Doors slide open as you or Judy reach them; turbolifts have a Call button outside and deck buttons inside. A fixed left stick walks (up/down) and turns (left/right); dragging on the right looks up, with only a little downward tilt while her clips stop at the waist. Judy follows your path on a camera-facing billboard (her green-screen clips, keyed in the shader), stays close (about 1.5 m, waist-up in view), circles around you if you walk at her, and you hear her footsteps beside yours (the recorded walking sound from the hallway walk clip, `app/assets/ship/steps.m4a`). Logic lives in `app/ship-core.mjs` (tested in `tests/ship.test.mjs`); three.js r160 (MIT) is vendored in `app/vendor/three/`.
- Clearly labeled scripted dialogue mode for interface testing. Turn it off to write manual dialogue through the storybook.

## Not connected
No LLM, generated narration, automatic persona extraction, cloud sync or MP3 export. Cloned voices are English-only for now and are rebuilt from the saved sample on each visit. No API keys are collected. Browser TTS/recognition availability varies and browser service voices/recognition may use the device vendor's services. Private hosting and browser-local storage are distinct: files do not sync across devices. Clearing browser storage loses local stories/media; export story text to retain it. Draft edits are not overwritten when new transcript messages arrive.

## Next integration
Use a server-side provider adapter for character dialogue and TTS; keep credentials out of the client. Dialogue requests should carry character identity/persona, selected scene, protected memories and recent messages. Return reply text and an emotion enum (normal, happy, sad, surprised, scared). Add authenticated cloud persistence and a consent-backed voice provider before activating cloning. Current browser voices are temporary previews, not guaranteed consistent across devices.

## Verification
`node --test tests/core.test.mjs tests/ship.test.mjs`
`node --check app/app.js`
Logic tests cover loop boundaries, transcript export and scene-aware demo text. Browser visual QA and actual microphone/TTS playback were not available in this build environment; test on the target Android browser.

## Repository layout

The prototype lives in `app/` and uses relative asset paths. Public URL: https://houawanych-pixel.github.io/myechovision/app/

The root `CNAME` (`myechovision.com`) is intentionally removed while the custom domain's DNS/HTTPS is broken. Do not restore it until the domain serves a valid certificate; the value is recoverable from Git history. Code development continues in this repository; the earlier Sites preview is a separate snapshot, not automatically synchronized.
