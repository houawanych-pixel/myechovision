# Writes app/campaigns/cryo-escape/campaign.json (the first campaign, "Cold Wake").
# Edit this file or the JSON directly; the JSON is what the app reads.
import json, pathlib
M = 'media/'
def env(kind, name, secs, prompt, stand=None, loop=None):
    c = {'file': M + name, 'kind': kind, 'seconds': secs, 'prompt': prompt}
    if loop is not None: c['loop'] = loop
    if stand: c['standIn'] = stand
    return c
def person(name, secs, prompt, loop=True):
    return {'file': M + name, 'kind': 'character', 'seconds': secs, 'loop': loop, 'screen': 'green', 'prompt': prompt}
ALARM = 'Emergency lighting: pulsing red alarm light, drifting smoke, sparks; a research station tearing itself apart.'
clips = {
 'cryo_wake_loop': env('neutral', 'cryo_wake_loop.mp4', 8, f'Point of view of a man lying in an open cryo pod, looking up and out. Frost on the pod rim, cold mist pouring over the edge, a cramped cryo bay beyond. {ALARM} Nothing big happens: the light pulses, mist drifts, a distant rumble shakes loose a little frost. Blurry, slightly out of focus edges, as if just waking.', 'assets/inner-hall.webp'),
 'cryo_climb_out_fwd': env('forward', 'cryo_climb_out_fwd.mp4', 5, f'Point of view climbing out of the cryo pod: hands (a man\'s bare forearms, pale, frost-burned) grip the rim, the view lurches up and over, unsteady. Ahead, two armored mercenaries in scuffed gray-and-orange gear run away from camera toward a bulkhead door, one waving back. {ALARM} Ends standing in the aisle of the cryo bay, facing down a row of pods.'),
 'cryo_pod_row_loop': env('neutral', 'cryo_pod_row_loop.mp4', 8, f'Point of view standing in a long aisle between rows of cryo pods, most dark and frosted, one cracked and empty. A heavy bulkhead door far ahead stands half open. {ALARM} Unsteady, slight sway as if dizzy. Nothing big happens.', 'assets/inner-hall.webp'),
 'cryo_bulkhead_blast_fwd': env('forward', 'cryo_bulkhead_blast_fwd.mp4', 5, f'Point of view stumbling forward down the cryo aisle toward the half-open bulkhead. A fireball bursts from a wall panel to the right, debris and frost fly past the camera, the camera ducks and pushes through the bulkhead door. {ALARM} Ends just past the door, looking into a smoke-filled ring corridor.'),
 'corridor_enter_zone': env('zone', 'corridor_enter_zone.mp4', 4, f'Point of view entering a curved white station ring corridor as the ceiling panels blow out in a chain of sparks and small explosions, cables swing down, a light strip shatters. {ALARM} Ends on a steady view down the burning corridor.', 'assets/corridor-flicker.mp4'),
 'corridor_fire_loop': env('neutral', 'corridor_fire_loop.mp4', 8, f'Point of view standing in a curved white station ring corridor, small fires along the wall, a dangling cable sparking, smoke rolling along the ceiling. {ALARM} Nothing big happens; seamless loop.', 'assets/corridor.webp'),
 'corridor_collapse_fwd': env('forward', 'corridor_collapse_fwd.mp4', 5, f'Point of view jogging forward down the burning ring corridor; behind (heard, then glimpsed in a quick look back) a ceiling section crashes down and seals the way you came. The camera turns forward again and keeps moving. {ALARM} Ends at a wider stretch where a wall is breached and venting.'),
 'corridor_breach_loop': env('neutral', 'corridor_breach_loop.mp4', 8, f'Point of view standing in a wide white station corridor; the left wall is torn open, venting white gas in bursts; wall screens flicker with warnings in an invented alphabet. {ALARM} Nothing big happens; seamless loop.', 'assets/hallway.webp'),
 'corridor_run_fwd': env('forward', 'corridor_run_fwd.mp4', 5, f'Point of view running down a long white station hallway toward a sealed maintenance hatch at the far end, past flickering wall screens and a burst pipe. {ALARM} Ends right in front of the hatch.', 'assets/hallway-walk.mp4'),
 'shaft_enter_zone': env('zone', 'shaft_enter_zone.mp4', 4, f'Point of view: a heavy maintenance hatch grinds open, hot air and embers blast out, revealing a vertical shaft with a metal ladder going up and orange fire far below. {ALARM} Ends looking up the ladder.', 'assets/hatch-door.mp4'),
 'shaft_ladder_loop': env('neutral', 'shaft_ladder_loop.mp4', 8, f'Point of view at the bottom of a narrow vertical maintenance shaft, hands on a metal ladder, looking up toward a square of light far above. Embers float upward, pipes rattle, the ladder vibrates. {ALARM} Nothing big happens; seamless loop.', 'assets/hatch.webp'),
 'shaft_climb_fwd': env('forward', 'shaft_climb_fwd.mp4', 6, f'Point of view climbing the ladder fast, hand over hand, a burst of flame below lighting the shaft orange, then hauling up through a floor hatch onto a catwalk. {ALARM} Ends on the catwalk facing a pair of big hangar doors.'),
 'hangar_enter_zone': env('zone', 'hangar_enter_zone.mp4', 5, f'Point of view: huge hangar doors part with a shudder; beyond, a hangar bay lit in hard white floodlights and red alarms, a mid-size civilian starship with warm engines and an open boarding ramp. Steam, loose cargo crates, sirens. Ends on a steady view of the ship and the ramp.', 'assets/ship/preview.webp'),
 'hangar_survivors_loop': env('neutral', 'hangar_survivors_loop.mp4', 8, 'Point of view standing at the edge of a hangar bay, a mid-size civilian starship ahead with its boarding ramp down and engines glowing, steam venting, floodlights, red alarm lights pulsing on the walls. The area right in front of the ramp is kept clear (people are added separately). Nothing big happens; seamless loop.', 'assets/ship/preview.webp'),
 'kroll_wave_loop': person('kroll_wave_loop.mp4', 6, 'Dace Kroll, a broad mercenary sergeant in his forties, shaved head, gray stubble, scuffed gray-and-orange armored vest with a plain unmarked shoulder plate, heavy gloves, a rifle slung across his back. He stands three-quarters turned away, looking back over his shoulder at the camera, shouting and waving the viewer forward with big impatient arm sweeps. Returns to the starting pose at the end.'),
 'pike_idle_loop': person('pike_idle_loop.mp4', 6, 'Ines Pike, a lean mercenary woman in her thirties, dark braided hair tied back, the same gray-and-orange armored vest, a compact carbine held low. She stands ready, glancing left and right, impatient, shifting weight from foot to foot. Returns to the starting pose.'),
 'wren_idle_loop': person('wren_idle_loop.mp4', 8, 'Wren-6, a maintenance android with a calm, almost-human face, smooth pale gray synthetic skin with fine seam lines at the jaw and wrists, short neat white hair, a faded navy repair-crew coverall with a tool harness. Stands very still, then blinks once too slowly and tilts its head a few degrees, watching the camera. Returns to the starting pose. Slightly unsettling, never threatening.'),
 'wren_talk': person('wren_talk.mp4', 6, 'Wren-6 (same android as the idle clip) speaks calmly to the camera, small precise hand gestures, mouth moving through natural words, then returns to the starting pose.'),
 'vance_idle_loop': person('vance_idle_loop.mp4', 8, 'Vance Okafor, crew chief of a civilian repair tug, a tall Black man in his late thirties, close-cropped hair, a short scar through one eyebrow, sleeves of a worn rust-colored work jacket rolled up, a heavy rivet gun hanging from his belt. Stands at ease but alert, scanning, then fixes the camera with a steady confident look. Returns to the starting pose.'),
 'vance_talk': person('vance_talk.mp4', 6, 'Vance Okafor (same as the idle clip) speaks to the camera with calm authority, one hand pointing past the camera then beckoning, mouth moving through natural words. Returns to the starting pose.'),
 'teo_idle_loop': person('teo_idle_loop.mp4', 8, 'Teo Marsh, a wiry engineer in his twenties with messy curly hair, safety goggles pushed up on his forehead, grease on his cheek, a yellow-and-gray coverall with a tool belt. Stands fidgeting, wiping his hands on a rag, glancing at a handheld diagnostic tablet. Returns to the starting pose.'),
 'teo_talk': person('teo_talk.mp4', 6, 'Teo Marsh (same as the idle clip) talks fast and a little nervously to the camera, gesturing with a wrench, mouth moving through natural words. Returns to the starting pose.'),
 'bel_idle_loop': person('bel_idle_loop.mp4', 8, 'Bel Achterberg, a stocky rigger woman in her fifties, gray buzz-cut hair, a padded orange work vest over a navy coverall, a coil of cable over one shoulder. Stands with arms crossed, then waves one arm over her head as if signaling someone. Returns to the starting pose.'),
}
characters = [
 {'id': 'kroll', 'name': 'Dace Kroll', 'role': 'Mercenary sergeant, Kestrel Detail', 'kind': 'background', 'calls': ['Kroll', 'Sarge', 'Sergeant'], 'idle': 'kroll_wave_loop',
  'persona': 'You are Dace Kroll, sergeant of the Kestrel Detail, a contract security team hired by Halcott-Vey Consolidated. Loud, blunt, impatient, always moving. You pulled this sleeper out of cryo because your contract says to recover "assets". You never explain the contract. You talk in short shouted lines.',
  'voice': {'pitch': 0.7, 'rate': 1.15}, 'fallback': 'Move, sleeper! Talk later!'},
 {'id': 'pike', 'name': 'Ines Pike', 'role': 'Mercenary, Kestrel Detail', 'kind': 'background', 'calls': ['Pike'], 'idle': 'pike_idle_loop',
  'persona': 'You are Ines Pike of the Kestrel Detail, a mercenary working for Halcott-Vey. Cool, sarcastic, fast. You think the sleeper is dead weight. You keep one eye on the exits.',
  'voice': {'pitch': 1.1, 'rate': 1.2}, 'fallback': 'Less talking, more running.'},
 {'id': 'wren', 'name': 'Wren-6', 'role': 'Maintenance android', 'kind': 'follower', 'calls': ['Wren', 'Wren-6', 'android'], 'idle': 'wren_idle_loop', 'talk': 'wren_talk',
  'persona': 'You are Wren-6, the maintenance android of the repair tug Long Halcyon. Calm, exact, polite, a little too still. You stayed back to keep the stumbling survivor Elias alive. People do not trust you and you understand why; you do not argue, you just keep helping. You never lie, but you do not volunteer what the company programmed into you.',
  'voice': {'pitch': 1.0, 'rate': 0.95}, 'fallback': 'I am staying with you. Keep moving.'},
 {'id': 'vance', 'name': 'Vance Okafor', 'role': 'Crew chief', 'kind': 'background', 'calls': ['Vance', 'Okafor', 'Chief', 'boss'], 'idle': 'vance_idle_loop', 'talk': 'vance_talk',
  'persona': 'You are Vance Okafor, crew chief of the civilian repair tug Long Halcyon. Fearless, steady, dry humor under fire, never raises his voice when it matters. You take care of your people and you do not trust Halcott-Vey or the mercenaries they hired. You just pulled a stranger named Elias out of a dying station and you intend to get everyone off it alive.',
  'voice': {'pitch': 0.85, 'rate': 1.0}, 'fallback': 'Get aboard. We talk once we are clear of this rock.'},
 {'id': 'teo', 'name': 'Teo Marsh', 'role': 'Engineer', 'kind': 'background', 'calls': ['Teo', 'Marsh', 'engineer'], 'idle': 'teo_idle_loop', 'talk': 'teo_talk',
  'persona': 'You are Teo Marsh, the young engineer of the Long Halcyon. Nervous talker, brilliant with machines, terrified of fire. You were down on Bay Three pulling cable when everything went wrong. If someone tells you the launch panel is dead, you agree to come and fix it.',
  'voice': {'pitch': 1.15, 'rate': 1.15}, 'fallback': 'Panel? Yeah. Yeah, I can fix a panel. Lead the way.'},
 {'id': 'bel', 'name': 'Bel Achterberg', 'role': 'Rigger', 'kind': 'background', 'calls': ['Bel', 'Achterberg'], 'idle': 'bel_idle_loop',
  'persona': 'You are Bel Achterberg, rigger on the Long Halcyon. Gruff, motherly, has seen three stations die and is not impressed by a fourth. Calls everyone "kid".',
  'voice': {'pitch': 0.9, 'rate': 0.95}, 'fallback': 'Up the ramp, kid.'},
]
zones = [
 {'id': 'cryo-bay', 'name': 'Cryo Bay'},
 {'id': 'ring-corridor', 'name': 'Ring Corridor', 'enter': 'corridor_enter_zone', 'enterLines': [{'who': 'narrator', 'text': 'The ring corridor. The ceiling is raining sparks.'}]},
 {'id': 'maintenance-shaft', 'name': 'Maintenance Shaft C', 'enter': 'shaft_enter_zone', 'enterLines': [{'who': 'narrator', 'text': 'Maintenance shaft C. Hot air roars up from below.'}]},
 {'id': 'hangar', 'name': 'Hangar Two', 'enter': 'hangar_enter_zone', 'enterLines': [{'who': 'narrator', 'text': 'Hangar Two. A ship, engines warm. And people.'}]},
]
beats = [
 {'id': 'wake', 'zone': 'cryo-bay', 'title': 'Wake', 'neutral': 'cryo_wake_loop', 'forward': 'cryo_climb_out_fwd',
  'cast': [{'id': 'kroll', 'x': 0.66, 'scale': 1}, {'id': 'pike', 'x': 0.34, 'scale': 0.85}],
  'lines': [{'who': 'narrator', 'text': 'Frost. Red light. Your ears are ringing.'},
            {'who': 'kroll', 'text': "Come on, get up, let's go! We don't got any time, this place is gonna blow!", 'shout': True},
            {'who': 'pike', 'text': "He's thawed, Sarge. Grab him or leave him!"}],
  'forwardLines': [{'who': 'narrator', 'text': 'You drag yourself over the rim of the pod. Your legs barely answer.'}],
  'hint': 'Push the stick up to climb out.'},
 {'id': 'pod-row', 'zone': 'cryo-bay', 'title': 'The pod row', 'neutral': 'cryo_pod_row_loop', 'forward': 'cryo_bulkhead_blast_fwd',
  'cast': [{'id': 'kroll', 'x': 0.78, 'scale': 0.6}],
  'lines': [{'who': 'kroll', 'text': "Stay on my light! Don't look in the pods!", 'shout': True},
            {'who': 'narrator', 'text': 'The other pods are dark. Empty, or worse. The mercs are already at the bulkhead.'}],
  'forwardLines': [{'who': 'pike', 'text': "Bulkhead's going! Move it!", 'shout': True}]},
 {'id': 'corridor-fire', 'zone': 'ring-corridor', 'title': 'Burning ring', 'neutral': 'corridor_fire_loop', 'forward': 'corridor_collapse_fwd',
  'cast': [{'id': 'pike', 'x': 0.72, 'scale': 0.55}],
  'lines': [{'who': 'pike', 'text': "Keep up, sleeper! We are not coming back for you!", 'shout': True}],
  'forwardLines': [{'who': 'narrator', 'text': 'A ceiling section crashes down behind you. There is no way back now.'}]},
 {'id': 'corridor-breach', 'zone': 'ring-corridor', 'title': 'The breach', 'neutral': 'corridor_breach_loop', 'forward': 'corridor_run_fwd',
  'cast': [{'id': 'wren', 'x': 0.3, 'scale': 1}],
  'lines': [{'who': 'wren', 'text': "I am Wren. I will stay with you. Your rescuers are forty meters ahead."},
            {'who': 'narrator', 'text': "An android. It doesn't blink enough. You don't like it."},
            {'who': 'kroll', 'text': 'Leave the stray, Wren! Hangar Two, now!', 'shout': True}],
  'forwardLines': [{'who': 'wren', 'text': 'Run. I am right behind you.'}]},
 {'id': 'shaft', 'zone': 'maintenance-shaft', 'title': 'The climb', 'neutral': 'shaft_ladder_loop', 'forward': 'shaft_climb_fwd',
  'lines': [{'who': 'wren', 'text': "Climb. If you slip, I will catch you."},
            {'who': 'pike', 'text': "Hangar's in sight! Ninety seconds, then we lift with or without you!"}],
  'forwardLines': [{'who': 'narrator', 'text': 'Fire blooms below. You climb faster than you knew you could.'}]},
 {'id': 'hangar', 'zone': 'hangar', 'title': 'The survivors', 'neutral': 'hangar_survivors_loop', 'live': True,
  'cast': [{'id': 'bel', 'x': 0.22, 'scale': 0.8}, {'id': 'vance', 'x': 0.5, 'scale': 1}, {'id': 'teo', 'x': 0.76, 'scale': 0.85}],
  'lines': [{'who': 'bel', 'text': "There's another one! Chief, the android brought one!"},
            {'who': 'vance', 'text': "Hey, come on, let's get on the ship now."}],
  'hint': 'Push forward to board the ship and go live.'},
]
quests = [
 {'id': 'dead-panel', 'title': 'Dead panel', 'giver': 'vance',
  'trigger': {'on': 'live', 'say': "Bad news. The launch panel just died on us, and Teo's still down on Bay Three pulling cable. Go get him. Call his name, he'll hear you."},
  'goal': {'find': 'teo', 'where': 'Bay Three', 'text': 'Find Teo Marsh on Bay Three. Call him: "hey, Teo".', 'say': "The launch panel's dead? Of course it is. Okay. Okay! Lead the way."},
  'return': {'to': 'vance', 'words': "panel|come with me|follow me|back to the ship|let'?s go|this way", 'text': 'Bring Teo back to the launch panel. Say "come with me", or call Vance.'},
  'outcome': {'stays': 'teo', 'flag': 'panel-fixed', 'say': "Give me two minutes. I'm staying right here until she flies.",
              'text': 'Teo stays at the launch panel and gets to work. The lights come up one by one. The Long Halcyon can lift off.'}},
]
outline = {
 'logline': 'A man thawed out of cryo on a dying research station joins the civilian repair crew that saved him, and finds out the company paying for the rescue wants the thing that killed the station alive.',
 'player': 'Elias Marr: a quiet, stubborn survivor who wakes with no memory of why he was frozen. Becomes the one who refuses to leave anyone behind.',
 'enemies': ['The Skein: an alien species that nests in machinery and moves through ducts and walls.', 'Halcott-Vey Consolidated: the employer. It funds the station and the rescue, hires the Kestrel Detail mercenaries, and wants a live Skein specimen, not a dead one.'],
 'acts': [
  {'title': 'Act I: Cold Wake', 'playable': True, 'summary': 'Elias wakes in a cryo pod as Cairn Deep station comes apart. Kestrel Detail mercenaries drag him out and run ahead; he lags behind through the cryo bay, the burning ring corridor and a maintenance shaft. The android Wren-6 stays with him. In Hangar Two he finds the crew of the repair tug Long Halcyon. "Hey, come on, let\'s get on the ship now." Live play begins; the first job is the dead launch panel.'},
  {'title': 'Act II: The Long Halcyon', 'playable': False, 'summary': 'Aboard the tug. Crew chief Vance Okafor runs a tight, fearless ship. Elias distrusts Wren-6 and says so. The Kestrel Detail came aboard too, and Kroll keeps asking where the "assets" from Cairn Deep are stored. Something from the station is in the cargo hold.'},
  {'title': 'Act III: The SOS', 'playable': False, 'summary': 'A looping distress call from Lantern Station. Vance diverts against the mercs\' objection. On the station the crew finds one survivor sealed in a lab: Sera Quill. Elias and Sera are drawn to each other. The Skein will not go near her, and nobody can say why.'},
  {'title': 'Act IV: Two Enemies', 'playable': False, 'summary': 'The truth: Sera is Halcott-Vey\'s secret weapon, engineered so the Skein can be herded and caught, and left behind when the project failed. Kroll\'s orders are to take Sera and a live Skein nest. The crew fights the creatures and the mercenaries at once. Wren-6 saves Elias against orders and earns his trust.'},
  {'title': 'Act V: Burn the Nest', 'playable': False, 'summary': 'Vance leads a last push to burn the nest before the company ship arrives. Wren-6 holds a blast door to let Sera and Elias through and loses an arm and both legs; Elias carries what is left of the android out. Sera chooses to use what she was made for on her own terms. The Long Halcyon escapes with proof of what Halcott-Vey did.'}],
}
camp = {
 'format': 'echovision-campaign/1', 'id': 'cryo-escape', 'title': 'Cold Wake', 'version': 1,
 'blurb': 'Wake in a cryo pod on a station that is about to blow. Forward only. Catch up with the survivors, then go live.',
 'credits': 'Original story, names and characters for My EchoVision. No third-party assets. Stand-in art is the app\'s own.',
 'player': {'name': 'Elias Marr', 'role': 'Survivor', 'persona': 'A quiet, stubborn man just thawed out of cryo. No memory of why he was frozen.'},
 'outline': outline, 'zones': zones, 'beats': beats, 'characters': characters, 'clips': clips, 'quests': quests,
 'live': {'mode': 'chat', 'partner': 'vance', 'crew': ['vance', 'wren', 'teo', 'bel'],
          'scene': {'name': 'Hangar Two, Cairn Deep', 'details': 'The hangar of a dying research station. The repair tug Long Halcyon waits with its ramp down and engines warm. Alarms, steam and floodlights. The station could blow any minute.', 'art': 'assets/ship/preview.webp'},
          'line': "Welcome aboard the Long Halcyon. I'm Vance, I run this crew. You can thank Wren later. Right now I need hands."},
}
out = pathlib.Path(__file__).resolve().parent.parent / 'app/campaigns/cryo-escape/campaign.json'
out.write_text(json.dumps(camp, indent=1, ensure_ascii=False) + '\n')
print('wrote', out)
