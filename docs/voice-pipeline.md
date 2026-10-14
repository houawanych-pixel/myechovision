# Character voice pipeline

How a generated video clip becomes a reusable character voice. The tools are shared;
each project's characters and lore stay separate.

## 1. Generate one clip

Use any video generator that produces speech. Start from the character's portrait if it
accepts an image. Prompt template:

```
A single character speaks directly to the camera in one continuous take.
Character: [who they are and what they look like]. Setting: [where].

Voice: [3-6 words: e.g. warm, calm, curious, slightly low, unhurried, neutral accent].
They say exactly this, once, with no other words:
"[two or three sentences, about 10 seconds at a calm pace]"

Audio: their voice only. No music, no background sound, no ambience, no echo,
no other voices. Clear, close microphone sound.
Camera: fixed upper-body shot, steady, no cuts. Natural small movements,
gentle blinking, lips matching the words. About 10 to 12 seconds.
```

The voice words decide how the character sounds. Keep the take calm and in one emotion.
Invented voices only: do not ask for, or clone, a real person's voice without their consent.

## 2. Split the clip

```
tools/clip-to-voice.sh clip.mp4 nova out/
```

Gives `nova-voice.wav` (cloner sample), `nova-voice.mp3`, `nova-loop.mp4` (silent idle loop)
and `nova.webp` (portrait), then prints an audio check. Regenerate the clip if the quietest
moments are louder than about -45 dB (music or noise under the voice) or there is under
5 seconds of speech. Always listen once: the numbers cannot tell if the words are right.

## 3. Use the voice

- **In My Echo Vision, by hand:** Cast -> add character (portrait + loop); Voices -> Clone a voice
  -> upload the WAV.
- **As a built-in My Echo Vision character:** put the three files in `app/assets/` and add an
  entry to the `builtIn` list near the top of `app/app.js`. These files become public.
- **For another project (game dialogue etc.):** in Voices, pick the clone, type each line in
  the Voice Tool, tap Speak, then Save WAV. The WAV is 24 kHz mono.

## How the cloning runs

In the browser, on the device, with Pocket TTS (Kyutai, CC BY 4.0) through the vendored
pocket-voice worker. No API, no key, nothing uploaded. The model lives in `app/models/` and
the runtime in `app/vendor/ort/`; `tools/fetch-voice-model.sh` (run by the "Fetch voice
model" workflow) refreshes them. English only unless more language bundles are fetched.
