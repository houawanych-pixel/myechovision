# Arena Combat & Shared Worlds (idea draft, not approved, not built)

*Status: captured 15 Oct 2026. **First duel built 16 Oct 2026:** `app/duel.html` — you vs Kasumi on the Dragon Temple floor (lock-on, ◀ ▶ sidestep / ▲ ▼ step, Strike, life meters, hurt, KO, victory). Open it from Cast → Worlds → The Kumite → ⚔ Fight Kasumi.*

## The idea in one line
Bring your character into someone's world (for example "Bob's Tournament, a My EchoVision"), meet their cast, and fight through it. It's a duel decided by **positioning**, not button-mashing, made from the same clips every character already has.

## Shared worlds ("Bob's My EchoVision")
- Everything a person builds (characters, scenes, 3D files, story) is one **My EchoVision file**, their own project folder.
- **Private by default.** If they choose to make it public, others can open it.
- Open someone's file and everything is already loaded: characters, stages, clips. **Pick your three things → go.**
- **Bring your own character** into their world. "Hey, I'm Hova, I'm joining your tournament." Their characters meet you in character, from their personas.
- What you play is **your story**: your choices, your win, your novel or screenplay to publish. Their characters, art and world stay theirs.
- Everyone is alive on screen: idle and talking loops, not still pictures.

## The duel
- **Stage:** an open **skybox** (a 360° picture that stays fixed far away, like in Freelancer) with a simple **3D floor** (OBJ/GLB) to stand on. When you look around, the sky turns with your view but never moves closer. All the movement happens on the floor in front of it.
- **The opponent always faces you** (locked on). They are a video (their clips), standing in the 3D space.
- **You move:** forward, back, sideways (the movement controls we already have).
- **Positioning is the skill:**
  1. They attack: their **attack clip** plays.
  2. You **sidestep or jump back**: their attack clip **slides out of frame**, and it misses.
  3. You **move in close enough**: your strike lands, and their **hurt clip** plays ("oh, you got me"). You're facing them again.
  4. Repeat, blow for blow.
- **Life meters:** theirs drops when you land, yours drops when they catch you. First to empty loses. Optional: they fight "hurt" when low, and a **knockout clip** plays at zero, then a **victory clip**.
- **Any style:** the system doesn't care what the attack is. A samurai's sword cut, a ninja's kick, a boxer's punch, a pilot's blaster shot: whatever clip was made for that character.

## What each fighter needs (the clip kit)

All clips: **vertical 2:3**, the character's **master picture as the first frame**, **end on the same pose** so they loop and switch cleanly, locked camera, same size, plain green background (blue if they wear green). **480 × 720 for animated** characters (saves credits), **720 × 1080 for realistic** ones.

| # | Clip | Length | What happens |
|---|---|---|---|
| 1 | **Talk + idle** (already built) | 15 s | Talks in their voice, then 3 quiet seconds. The app makes **voice + talking loop + idle loop** from this one clip. |
| 2 | **Attack 1** | 3–4 s | Their main strike toward the camera, then back to the start pose. |
| 3 | **Attack 2** | 3–4 s | A different strike (heavier or special). |
| 4 | **Hurt** | 2–3 s | Gets hit and staggers back, then recovers to the start pose. |
| 5 | **Knockout** | 3–4 s | Hit hard, falls. Doesn't need to loop. |
| 6 | **Victory** | 3–4 s | Their win pose or taunt. |

Optional: **Block**, **Taunt**, **Hurt (low health)**.

### Prompt template (attack)
```
Use the provided image as the exact first frame. Same character, outfit, framing and plain green background the whole time. Locked-off camera, no zoom, the character stays the same size.
[NAME], [ARCHETYPE], performs [THEIR ATTACK] straight toward the camera, fast and clear, then returns to the identical starting pose by the end so the clip loops.
Length: 3 to 4 seconds. Vertical portrait 2:3, [480 x 720 animated | 720 x 1080 realistic]. Sound: only the attack sound and a short grunt, no music.
```

### Prompt template (hurt)
```
Use the provided image as the exact first frame. Same character, outfit, framing and plain green background. Locked-off camera.
[NAME] is struck and staggers back with a pained reaction, then steadies and returns to the identical starting pose by the end.
Length: 2 to 3 seconds. Vertical portrait 2:3, [480 x 720 | 720 x 1080]. Sound: a short pained grunt only.
```

### Archetype examples (fill in [THEIR ATTACK])
- **Samurai:** a fast two-handed katana cut from high to low · heavy: a forward thrust.
- **Ninja:** a spinning roundhouse kick · special: throws a shuriken toward the camera.
- **Boxer:** a one-two jab and cross · heavy: an uppercut.
- **Knight:** a broad sword swing · heavy: a shield bash forward.
- **Pilot / gunslinger:** draws and fires a blaster at the camera · heavy: two quick shots.
- **Mage:** thrusts a palm forward releasing a burst of light.

## What the app does for people
- **Talk + idle:** already done. Drop the 15-second clip in and the app makes the voice, talking loop and idle loop.
- **Combat clips:** each is its own short clip (nothing to cut). The app would need a **Fighter** section in each character's library with these slots, each with a **Copy prompt** written from that character's persona and look (like the talking prompt today).
- **Arena:** pick a skybox and a floor, then two fighters: you and your opponent.

## Build order (when it's time)
1. Fighter slots plus persona-based prompts in character building.
2. Arena scene: skybox plus floor plus a locked-on opponent clip.
3. Duel rules: distance check, dodge window, life meters, KO.
4. Tournament: a ladder of opponents from a world's cast.
5. Shared My EchoVision files: public worlds, bring your own character.
