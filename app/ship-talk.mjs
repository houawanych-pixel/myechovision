// Talking while you walk: type a line or talk hands-free, and the companion answers with the AI brain,
// out loud, with a short subtitle. The brain is the one My Echo Vision uses: this device's own choice, or the
// site's built-in brain (brain.json, the key-keeping proxy). Lines are added to the story's chat when the walk
// was opened from a story, so the conversation carries on in chat.
import { remoteReply } from './brain.mjs?v=22';

const KEY = 'echo-vision-studio-v2';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null } catch { return null } };

export async function createTalk({ sessionId, partnerName, sceneName, sceneDetails, onSpeaking, onLine }) {
  const st = load();
  const sess = sessionId && st?.sessions?.find(s => s.id === sessionId);
  const partner = st?.cast?.find(c => c.id === (sess?.partner || 'judy')) || { name: partnerName || 'Judy', role: 'Field officer', persona: '' };
  const you = st?.cast?.find(c => c.id === (sess?.player || st?.selection?.player)) || { name: 'you' };
  let cfg = st?.brainCfg?.mode === 'remote' ? st.brainCfg : null;
  if (!cfg) { try { const b = await (await fetch('brain.json', { cache: 'no-cache' })).json(); if (b?.url && b.model) cfg = { mode: 'remote', url: b.url, model: b.model } } catch { } }
  const messages = sess ? sess.messages.slice(-12) : [];
  const ctx = () => ({ name: partner.name, role: partner.role, persona: partner.persona, look: partner.look, scene: sceneName, sceneDetails, player: you.name, playerPersona: you.id === 'you' ? '' : you.persona, playerLook: you.look, messages });
  // keep the story's chat in step with what is said here
  const remember = (role, text, emotion) => {
    const m = { role, text, ...(emotion ? { emotion } : {}) }; messages.push(m);
    if (!sess) return; const now = load(); const s = now?.sessions?.find(x => x.id === sess.id); if (!s) return;
    s.messages.push(m); s.demo = false; try { localStorage.setItem(KEY, JSON.stringify(now)) } catch { }
  };

  // ---- the voice: the character's phone voice (cloned voices only play in chat for now)
  let voices = [];
  const refresh = () => { voices = window.speechSynthesis?.getVoices() || [] };
  refresh(); if (window.speechSynthesis) speechSynthesis.onvoiceschanged = refresh;
  function say(text) {
    return new Promise(done => {
      if (!window.speechSynthesis) return done();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text), v = voices.find(x => x.voiceURI === partner.voice);
      if (v) { u.voice = v; u.lang = v.lang } u.rate = 0.97;
      let fin = false; const end = () => { if (fin) return; fin = true; onSpeaking(false); done() };
      u.onstart = () => onSpeaking(true); u.onend = end; u.onerror = end;
      setTimeout(() => { if (!speechSynthesis.speaking) end() }, Math.max(4000, text.length * 120));
      speechSynthesis.speak(u);
    });
  }

  let busy = false;
  async function ask(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    busy = true; onLine('you', text); remember('user', text);
    try {
      if (!cfg) throw Error('The AI brain is not connected.');
      const r = await remoteReply(ctx(), cfg, () => { });
      const reply = r.text || '…';
      remember('assistant', reply, r.emotion);
      onLine('her', reply, r.emotion);
      busy = false; await say(reply);
    } catch (err) {
      busy = false; onLine('note', err.message || 'She could not answer just now.');
    }
  }

  // ---- hands-free: listen, answer, listen again. One listener at a time (a second one made the phone beep on and off);
  // none while she answers; after quiet spells it waits a little longer before listening again, so the start beep is rare.
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, hands = false, quiet = 0, timer = 0;
  const later = ms => { clearTimeout(timer); timer = setTimeout(listen, ms ?? Math.min(4000, 400 + quiet * 600)) };
  function listen() {
    if (!hands || !Rec || rec || busy || window.speechSynthesis?.speaking) { if (hands && !rec) later(800); return }
    const r = rec = new Rec(); r.lang = navigator.language || 'en-US'; r.interimResults = false; r.continuous = true;
    let got = false;
    r.onresult = e => {
      if (r !== rec) return;
      const res = e.results[e.results.length - 1]; if (!res?.isFinal) return;
      const t = (res[0]?.transcript || '').trim(); if (!t) return;
      got = true; quiet = 0; rec = null; try { r.stop() } catch { }
      ask(t).finally(() => later(300));
    };
    r.onerror = e => {
      if (r !== rec) return; rec = null;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { hands = false; onLine('note', 'The microphone is blocked for this site. Allow it in the browser, or type instead.'); onHands(false); return }
      quiet++; later();
    };
    r.onend = () => { if (r !== rec) return; rec = null; if (!got) quiet++; later() };
    try { r.start() } catch { rec = null; later(1000) }
  }
  let onHands = () => { };
  return {
    ask,
    canListen: !!Rec,
    get ready() { return !!cfg },
    get name() { return partner.name },
    setHands(on, cb) { onHands = cb || onHands; hands = !!on && !!Rec; clearTimeout(timer); if (hands) { quiet = 0; listen() } else { const r = rec; rec = null; try { r?.abort() } catch { } } return hands },
    stop() { hands = false; clearTimeout(timer); const r = rec; rec = null; try { r?.abort() } catch { } window.speechSynthesis?.cancel() },
  };
}
