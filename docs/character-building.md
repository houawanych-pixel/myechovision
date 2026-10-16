# Building a character

How to make a character's picture, expression clips, action clips and voice so they fit together in My Echo Vision.
The same steps are in the app: Cast -> a character -> Expressions, actions and green screen -> How to make these.
Each slot there has a Prompt button that copies the prompt for that clip.

You make the pictures and clips in any image and video generator. My Echo Vision only needs the files.

## The rules that make it look real

1. **One base picture.** It is the first and last frame of every clip.
2. **The same framing in every clip.** Upper body, facing the camera, same size and position. This matters most.
3. **Every clip starts and ends on the base picture**, so clips cut together without a jump.
4. **One screen colour for everything.** Green, or blue if anything on the character is green. Gray does not work: the app removes green or blue only.
5. **Even light on the background**, no shadows, no gradient.
6. **Video:** 15 seconds or shorter, silent, portrait shape. **Picture:** PNG, JPEG or WebP. A still per feeling is a fine start.
7. Lip sync is not attempted. The Talking clip gives natural mouth movement while any line is spoken.

Only make characters that are your own. Do not copy a real person's face or voice without their permission.

## Step 1. The base picture

```
Waist-up portrait of [describe your character: age, hair, eyes, clothing, style], facing the camera, standing straight in a relaxed neutral pose with a calm neutral expression, arms loosely at their sides. Camera at waist height. Frame from the waist up, with room above the head and a little room below the waist and at both sides, so hands and arms stay in frame when they move.
Plain solid green background, evenly lit, with no shadows, no gradient and no floor line. Soft even light on the character. Nothing green on the character: no green clothing, jewellery or eyes.
Vertical portrait, 2:3 shape: 480 x 720 is enough for phones; use 720 x 1080 or more if it will play on a big widescreen. No text.
```

## Step 2. The clips

Give the generator the base picture and this prompt, with one ACTION line. Make Normal first.

```
Use the provided image as the exact first frame and the exact last frame.
The character stays in place: same framing, same position, same size, same lighting, same clothing. Fixed camera, no zoom, no cuts. Plain solid green background that never changes, evenly lit, with no shadows on it. No text and nothing entering the frame.
(For actions such as dances, waves and your own: keep both hands and arms inside the frame the whole time; keep the movement compact enough that nothing is cut off.)
(Scared, Surprised and Laugh may carry her own short reaction sound, a gasp, a yelp or a laugh. It plays the moment the clip shows, even while someone else is talking. Every other clip is silent.)
She begins in the neutral pose, performs the action below, and returns to the identical neutral pose by the end, so the clip loops seamlessly.
Length: 8 to 10 seconds. Vertical portrait, 2:3, the same shape as the picture. No sound needed.

ACTION: [one line from the tables below]
```

### Conversation

| Slot | Length | ACTION |
|---|---|---|
| Normal | 8 to 10 s | She stands relaxed, breathing gently, blinks naturally and shifts her weight very slightly. Calm neutral face. No speaking. |
| Talking | 6 to 8 s | She speaks casually to the camera as if chatting with a friend, mouth moving through varied natural words, with small head movements and light hand gestures. Neutral, friendly expression. |
| Happy | 4 to 5 s | Her face lights up into a warm genuine smile, her eyes brighten, and she gives a small delighted head tilt. |
| Sad | 4 to 5 s | Her smile fades, her eyes lower, her shoulders drop slightly, and she lets out a quiet sigh. |
| Surprised | 3 to 4 s | Her eyes widen, her eyebrows lift, she draws a small sharp breath and leans back slightly. |
| Angry | 4 to 5 s | Her brows draw together, her jaw sets, and she gives a firm glare with a short sharp exhale. |
| Scared | 4 to 5 s | Her eyes widen with worry, she tenses, glances quickly to one side and pulls her shoulders in. |
| Yes | 2 to 3 s | She nods clearly twice with a small agreeing smile. |
| No | 2 to 3 s | She shakes her head clearly twice with a gentle but firm look. |

### Actions

| Slot | Length | ACTION |
|---|---|---|
| Dance 1 | 8 to 10 s | She does a light, playful dance in place, swaying her hips and shoulders with relaxed arm movements, smiling. |
| Dance 2 | 8 to 10 s | She does an energetic dance in place with quicker steps, a turn of the upper body and raised arms, laughing. |
| Wave hello | 3 s | She raises one hand and waves warmly at the camera with a smile, then lowers it. |
| Laugh | 3 to 4 s | She breaks into a real laugh, her head tipping back slightly, one hand rising toward her chest. |
| Thinking | 4 to 5 s | She looks up and to the side, taps a finger on her chin, then looks back at the camera. |

Your own actions use the same prompt with your own ACTION line, for example: She blows a kiss toward the camera.

## Step 3. The voice clip

About 10 seconds of the character speaking alone. See also docs/voice-pipeline.md.

```
A single character speaks directly to the camera in one continuous take.
Use the provided image as the starting frame.

Voice: [3 to 6 words, for example: warm, calm, curious, slightly low, unhurried, neutral accent].
They say exactly this, once, with no other words:
"I've walked a long way to find this place. The air is quiet here, and the lights below look like scattered stars. Stay a while, and tell me where you'd like to go."

Audio: their voice only. No music, no background sound, no ambience, no echo, no other voices. Clear, close microphone sound.
Camera: fixed waist-up shot, steady, no cuts. About 10 to 12 seconds.
```

## Step 4. Put them in

1. Cast -> the character -> Expressions, actions and green screen.
2. Set Background removal to the colour you used. Adjust Edge clean-up if there is a coloured glow.
3. Upload each clip to its row. Add your own actions by typing a name.
4. In the character's Voice section, tap Clone a new voice and upload the voice clip, or keep the recommended phone voice.

## How the app uses them

- A reply's feeling (happy, sad, surprised, scared, angry) shows that clip. A reply that opens with yes or no shows the nod or shake.
- Talking plays while she speaks. Normal is shown the rest of the time.
- Actions get a button in chat, and play when the player asks, for example "dance" or "dance again".
- A video plays once and returns to Normal. A picture is held for a few seconds.
- With background removal on, the character stands in front of the scene's picture or video.

## One clip, three uses (voice + talking loop + idle loop)

The quickest way to bring a character to life is one talking video that ends with a few quiet seconds.

**Make it:** in the voice step, tap *Copy prompt*. The prompt is written from the character's look and persona (so they idle in character) and asks for about 13 to 15 seconds, vertical 2:3 — **480 × 720 for animated** characters (cheaper, you won't see the difference) and **720 × 1080 for realistic** ones (more credits, more detail). The prompt spells it out in plain words: use their picture as the exact first frame; keep the same framing, pose, lighting and background; locked-off camera, same size the whole time; they talk naturally for most of the clip; the character says the line, then stays in place for **3 more seconds, calm and quiet** (mouth closed, gentle breathing, a blink, the slightest movement, same framing and background), then end on the same pose as the first frame. 15 seconds or under. There is a Copy prompt button in the character editor and in the voice step.

**Drop it in** (character editor → *Upload a voice*, or the voice clone step) with *"also make their talking loop and idle loop"* ticked. The app, on the phone:

1. **Voice:** pulls the sound out and clones it (as before).
2. **Talking loop:** takes the talking part (up to 8 seconds, ending where the talking stops, found from the sound) and redraws it forward then backward, so it loops with no jump and the quiet ending never shows while they talk.
3. **Idle loop:** takes the quiet ending, redraws it as a short clip that plays forward and then backward, so it loops with no jump, and sets it as their idle.

If the video ends with less than about 1.2 seconds of quiet, you still get the voice and the talking loop, and the still picture stays their idle until you add an idle clip.

Files: the app only keeps the video and the clips it makes; no WAV files. Videos over 60 MB still give the voice but are not made into loops. Making the loops takes about half a minute on a phone.

For characters made outside the app (the built-in pilots, for example), the same rule applies: end the talking clip with 3 quiet seconds, and the idle can be cut from that tail.
