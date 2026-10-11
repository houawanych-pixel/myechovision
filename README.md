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
- Authorized voice sample upload and playback. Samples are NOT cloned voices.
- Clearly labeled scripted dialogue mode for interface testing. Turn it off to write manual dialogue through the storybook.

## Not connected
No LLM, generated narration, automatic persona extraction, voice cloning, cloud sync, MP3 generation or audio export. No API keys are collected. Browser TTS/recognition availability varies and browser service voices/recognition may use the device vendor's services. Private hosting and browser-local storage are distinct: files do not sync across devices. Clearing browser storage loses local stories/media; export story text to retain it. Draft edits are not overwritten when new transcript messages arrive.

## Next integration
Use a server-side provider adapter for character dialogue and TTS; keep credentials out of the client. Dialogue requests should carry character identity/persona, selected scene, protected memories and recent messages. Return reply text and an emotion enum (normal, happy, sad, surprised, scared). Add authenticated cloud persistence and a consent-backed voice provider before activating cloning. Current browser voices are temporary previews, not guaranteed consistent across devices.

## Verification
`node --test tests/core.test.mjs`
`node --check app/app.js`
Logic tests cover loop boundaries, transcript export and scene-aware demo text. Browser visual QA and actual microphone/TTS playback were not available in this build environment; test on the target Android browser.

## Repository layout

The existing root landing page and CNAME are preserved. The prototype lives in `app/` and uses relative asset paths. GitHub Pages can serve it at `/app/` using the existing hosting configuration. Code development continues in this repository; the earlier Sites preview is a separate snapshot, not automatically synchronized.
