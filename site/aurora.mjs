// Aurora on the homepage: the same floating android guide as in the app.
// Upper body only, drag her anywhere (or use the ✥ handle), tap her to ask anything by voice or by typing.
import {createStage} from '../app/stage.mjs?v=15';
import * as brain from '../app/brain.mjs?v=22';

const KEY='mev-aurora-home',A='app/assets/';
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return {}}},keep=o=>{try{localStorage.setItem(KEY,JSON.stringify({...load(),...o}))}catch{}};
const MIC='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const FACTS=`You are Aurora, the friendly android guide of My EchoVision, shown on its homepage. Answer in 1 to 3 short, plain, warm sentences, no lists, no markdown. If you don't know, say so.
What My EchoVision is: an interactive storytelling, novel and screenplay studio. You create characters, step into worlds, talk with characters like a video call, live the adventure, then turn it into chapters, a novel or a screenplay.
How to start: tap the green Start Creating button. Then 1) who you are (take or upload a photo, or pick one of ours), 2) your world or scene (a picture, a looping video, or a ready-made one), 3) who you meet (a roster of characters, each with a personality, look and voice), then the green Generate All button writes the story and starts it. The purple Plan your story button lets you write or change the outline first.
Worlds: space sci-fi with fighter pilots and factions, fantasy and RPG, wuxia and ancient China, feudal Japan, horror (a ready-made campaign called Dead Signal), anime, cinematic, cyber cities, romance, mystery, historical and drama.
Author Studio (the Book page in the app): every story becomes chapters. Each chapter keeps the original transcript and can be written as novel prose or a screenplay with AI in a chosen style, rewritten, quick-formatted without AI, reviewed and saved; earlier versions are kept. Export a manuscript, a screenplay or the transcript.
Voices: characters can use the phone's voice (fast) or a cloned voice from a short clip (sounds better, slower). Only clone voices you have the right to use.
Privacy: everything is private by default and saved on your own device. Community guidelines: original characters and labelled parody are fine; impersonating real people or cloning a voice without permission is not. There is a Report a problem link at the bottom of the page.
The app also has me, Aurora, floating in a corner: tap me to talk, drag me anywhere.`;

let box,st,cfg=null,listening=false,rec=null,history=[];
fetch('app/brain.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(b=>{if(b?.url&&b.model)cfg={mode:'remote',url:b.url,model:b.model}}).catch(()=>{});

function build(){
  box=document.createElement('div');box.id='aurora';
  box.innerHTML=`<div class="auRing" aria-hidden="true">${MIC}</div><div class="auHolo" role="button" tabindex="0" aria-label="Aurora, your guide. Tap to ask. Drag to move."><div class="auFig"></div><span class="auMic" aria-hidden="true">${MIC}</span></div><div class="auLabel">Tap me for help</div><button class="auMove" type="button" aria-label="Move Aurora" title="Drag to move">✥</button><button class="auHide" type="button" aria-label="Hide Aurora">–</button>
  <div class="auPanel" hidden><div class="auSay" aria-live="polite"></div><form class="auAsk"><input name="q" maxlength="300" placeholder="Ask me anything…" autocomplete="off" aria-label="Ask Aurora"><button aria-label="Send">➤</button></form><div class="auQuick"><button type="button" data-q="What is My EchoVision?">What is this?</button><button type="button" data-q="How do I start a story?">How do I start?</button><button type="button" data-q="Can it write a novel or screenplay?">Novel &amp; screenplay?</button></div></div>`;
  document.body.appendChild(box);
  const host=document.createElement('div');host.className='auStage';box.querySelector('.auFig').appendChild(host);
  try{st=createStage(host);st.setCharacter({normal:{src:A+'aurora-idle.mp4',type:'video/mp4'},talking:{src:A+'aurora-talk.mp4',type:'video/mp4'},wave:{src:A+'aurora-wave.mp4',type:'video/mp4'}},'green',0.8)}catch{box.classList.add('noVideo')}
  const holo=box.querySelector('.auHolo'),grip=box.querySelector('.auMove');
  drag(holo,true);drag(grip,false);
  holo.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tap()}});
  box.querySelector('.auHide').onclick=()=>{keep({hidden:true});box.remove();showTab()};
  box.querySelector('.auAsk').onsubmit=e=>{e.preventDefault();const q=e.target.q.value.trim();if(q){e.target.q.value='';ask(q)}};
  box.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>ask(b.dataset.q));
  const p=load().pos;if(p)place(p.x*innerWidth,p.y*innerHeight);
  addEventListener('resize',()=>{const q=load().pos;if(q)place(q.x*innerWidth,q.y*innerHeight)});
  if(!load().greeted){setTimeout(()=>{try{st?.show('wave')}catch{}label("Hi, I'm Aurora! Tap me for help");box.classList.add('hello');setTimeout(()=>{box.classList.remove('hello');if(!listening)label('Tap me for help')},9000);keep({greeted:1})},1400)}
}
function place(x,y){const w=box.offsetWidth||110,h=box.querySelector('.auHolo').offsetHeight+30;x=Math.max(4,Math.min(innerWidth-w-4,x));y=Math.max(64,Math.min(innerHeight-h-4,y));box.classList.add('moved');Object.assign(box.style,{left:x+'px',top:y+'px',right:'auto',bottom:'auto'})}
function drag(el,tapToo){let d=null,moved=false;
  el.addEventListener('pointerdown',e=>{if(e.button)return;const r=box.getBoundingClientRect();d={x:e.clientX,y:e.clientY,l:r.left,t:r.top};moved=false;try{el.setPointerCapture(e.pointerId)}catch{}});
  el.addEventListener('pointermove',e=>{if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!moved&&Math.hypot(dx,dy)<8)return;moved=true;place(d.l+dx,d.t+dy)});
  el.addEventListener('pointerup',()=>{if(!d)return;d=null;if(moved)keep({pos:{x:box.offsetLeft/innerWidth,y:box.offsetTop/innerHeight}});else if(tapToo)tap()});
  el.addEventListener('pointercancel',()=>{d=null})}
function showTab(){const t=document.createElement('button');t.id='auroraTab';t.type='button';t.innerHTML=MIC+'<span>Aurora</span>';t.setAttribute('aria-label','Bring Aurora back');t.onclick=()=>{keep({hidden:false});t.remove();build()};document.body.appendChild(t)}

function open(on){const p=box.querySelector('.auPanel');p.hidden=!on;box.classList.toggle('open',on);if(!on)return;const r=box.querySelector('.auHolo').getBoundingClientRect();if(r.top+r.height/2>innerHeight/2){p.style.top='auto';p.style.bottom=Math.max(8,innerHeight-r.top+10)+'px'}else{p.style.bottom='auto';p.style.top=(r.bottom+34)+'px'}}
function tap(){if(listening){stopListening();return}open(true);const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){box.querySelector('.auAsk input').focus();return}
  try{if(speechSynthesis?.speaking)speechSynthesis.cancel()}catch{}idle();rec=new SR();rec.lang=navigator.language||'en-US';rec.interimResults=true;rec.continuous=false;
  let heard='';rec.onresult=e=>{heard=[...e.results].map(r=>r[0].transcript).join(' ');box.querySelector('.auAsk input').value=heard};
  rec.onend=()=>{const was=listening;stopListening();if(was&&heard.trim()){box.querySelector('.auAsk input').value='';ask(heard.trim())}};
  rec.onerror=()=>{stopListening();box.querySelector('.auAsk input').focus()};
  try{rec.start();listening=true;box.classList.add('live');label('Listening · tap me to stop')}catch{box.querySelector('.auAsk input').focus()}}
function stopListening(){listening=false;box?.classList.remove('live');label('Tap me for help');try{rec?.stop()}catch{}rec=null}
function label(t){const l=box?.querySelector('.auLabel');if(l)l.textContent=t}

async function ask(q){open(true);const out=box.querySelector('.auSay');out.innerHTML=`<p class="you">${esc(q)}</p><p class="me">…</p>`;let a='';
  if(cfg){try{const msgs=[{role:'system',content:FACTS},...history.slice(-6),{role:'user',content:q}];a=String(await brain.write(cfg,msgs,220)).replace(/\[[^\]]*\]/g,'').trim()}catch{}}
  if(!a)a=offline(q);history.push({role:'user',content:q},{role:'assistant',content:a});out.querySelector('.me').textContent=a;say(a)}
function offline(q){q=q.toLowerCase();
  if(/novel|screenplay|script|chapter|book|write/.test(q))return 'Every story becomes chapters in the Book page. Each one keeps the original transcript, and you can turn it into a novel or a screenplay, rewrite it, and export it.';
  if(/start|begin|how|create|make/.test(q))return 'Tap the green Start Creating button. Pick who you are, your world, and who you meet, then tap Generate All and your story begins.';
  if(/private|privacy|safe|data|share/.test(q))return 'Everything is private by default and stays on your own device. Nothing is shared unless you choose to share it.';
  if(/voice|clone|speak/.test(q))return 'Characters can talk in the phone voice right away, or in a cloned voice from a short clip. Only clone voices you have the right to use.';
  return 'My EchoVision lets you create characters, step into worlds, live the adventure, and turn it into a novel or a screenplay. Tap Start Creating to begin.'}
// Speech: pick the voice once (on-device voices first, they start much faster on phones), speak sentence by sentence so the first words come out quickly,
// and always drift back to idle: when the voice ends, errors, never starts, or the phone forgets to say it finished.
let voice=null,talkTimer=0,watch=0,speakId=0;
function pickVoice(){const v=speechSynthesis.getVoices();if(!v.length)return;const en=v.filter(x=>/^en/i.test(x.lang)),nice=x=>/female|samantha|zira|aria|jenny|libby|sonia|google us english/i.test(x.name);voice=en.find(x=>x.localService&&nice(x))||en.find(x=>x.localService&&x.default)||en.find(x=>x.localService)||en.find(nice)||en[0]||null}
if(window.speechSynthesis){pickVoice();speechSynthesis.addEventListener?.('voiceschanged',pickVoice)}
function talk(on){clearTimeout(talkTimer);try{st?.speaking(on)}catch{}box?.classList.toggle('talking',on)}
function idle(){clearInterval(watch);watch=0;talk(false)}
function say(text){if(!window.speechSynthesis||!text)return;const id=++speakId;
  if(speechSynthesis.speaking||speechSynthesis.pending)speechSynthesis.cancel();
  const parts=String(text).match(/[^.!?…]+[.!?…]*\s*/g)||[text];let started=false;
  parts.forEach((t,i)=>{const u=new SpeechSynthesisUtterance(t.trim());if(voice)u.voice=voice;u.lang=voice?.lang||'en-US';u.rate=1.05;
    u.onstart=()=>{if(id!==speakId)return;started=true;talk(true)};
    u.onend=u.onerror=()=>{if(id===speakId&&i===parts.length-1)idle()};
    speechSynthesis.speak(u)});
  // Safety nets: back to idle if speech never starts, and once the phone stops speaking even if it never says so.
  clearInterval(watch);const t0=performance.now(),longest=4000+String(text).length*95;
  watch=setInterval(()=>{if(id!==speakId){clearInterval(watch);return}const busy=speechSynthesis.speaking||speechSynthesis.pending;if((!busy&&(started||performance.now()-t0>2500))||performance.now()-t0>longest)idle()},300)}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);

if(load().hidden)showTab();else build();
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&box?.classList.contains('open'))open(false)});
document.addEventListener('pointerdown',e=>{if(box&&box.classList.contains('open')&&!box.contains(e.target))open(false)});
