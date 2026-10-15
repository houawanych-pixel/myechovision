// Talking while you walk: type a line or talk hands-free, and the companion answers with the AI brain,
// out loud, with a short subtitle. The brain is the one My Echo Vision uses: this device's own choice, or the
// site's built-in brain (brain.json, the key-keeping proxy). Lines are added to the story's chat when the walk
// was opened from a story, so the conversation carries on in chat.
import { remoteReply } from './brain.mjs?v=18';

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

  // ---- hands-free: listen, answer, listen again
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, hands = false;
  function listen() {
    if (!hands || !Rec) return;
    rec = new Rec(); rec.lang = navigator.language || 'en-US'; rec.interimResults = false; rec.continuous = false;
    rec.onresult = async e => { const t = e.results[0]?.[0]?.transcript; rec = null; if (t) { await ask(t); } listen() };
    rec.onerror = e => { rec = null; if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { hands = false; onLine('note', 'The microphone is blocked for this site. Allow it in the browser, or type instead.'); onHands(false) } else setTimeout(listen, 400) };
    rec.onend = () => { if (rec) { rec = null; setTimeout(listen, 250) } };
    try { rec.start() } catch { setTimeout(listen, 600) }
  }
  let onHands = () => { };
  return {
    ask,
    canListen: !!Rec,
    get ready() { return !!cfg },
    get name() { return partner.name },
    setHands(on, cb) { onHands = cb || onHands; hands = !!on && !!Rec; if (hands) listen(); else { try { rec?.abort() } catch { } rec = null } return hands },
    stop() { hands = false; try { rec?.abort() } catch { } window.speechSynthesis?.cancel() },
  };
}
