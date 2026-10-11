// On-device voice cloning for Echo Vision. Wraps the vendored Pocket TTS worker
// (see vendor/pocket-voice/NOTICE.md). No audio or text leaves the device.
const RATE=24000,WORKER=new URL('./vendor/pocket-voice/inference-worker.js?v=1',import.meta.url);
let worker,loading,op=null,ctx,nextT=0,sources=[],encoded=null,token=0,statusFn=()=>{};
const cache=new Map();
export const sampleRate=RATE;
export function onStatus(fn){statusFn=fn}
function audio(){ctx??=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}
function begin(kind){const o={kind,chunks:[]};o.done=new Promise((resolve,reject)=>{o.resolve=resolve;o.reject=reject});op=o;return o}
function join(chunks){const out=new Float32Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){out.set(c,at);at+=c.length}return out}
function play(pcm){if(!pcm.length)return;const c=audio(),b=c.createBuffer(1,pcm.length,RATE);b.copyToChannel(pcm,0);const s=c.createBufferSource();s.buffer=b;s.connect(c.destination);const t=Math.max(c.currentTime+(nextT?0.05:0.25),nextT);s.start(t);nextT=t+b.duration;sources.push(s);s.onended=()=>{sources=sources.filter(x=>x!==s)}}
// Generation can be slower than real time on phones, so each finished sentence plays whole instead of stuttering.
function handle(m){if(m.type==='status'&&m.state==='loading')statusFn(m.status);const o=op;if(!o)return;
  if(m.type==='error'){op=null;o.reject(Error(String(m.error).replace(/^Error: /,'')));return}
  if(o.kind==='load'&&m.type==='loaded'){op=null;o.resolve()}
  else if(o.kind==='encode'&&m.type==='voice_encoded'){op=null;o.resolve()}
  else if(o.kind==='gen'){const flush=()=>{if(o.part?.length&&!o.stopped)play(join(o.part));o.part=[]};if(m.type==='audio_chunk'){if(m.metrics?.chunkStart)flush();o.chunks.push(m.data);(o.part??=[]).push(m.data)}else if(m.type==='stream_ended'||(m.type==='status'&&/^Finished \(RTFx/.test(m.status))){flush();op=null;o.resolve(join(o.chunks))}}}
function load(){return loading??=(async()=>{statusFn('Downloading the voice model. This happens once and can take a minute.');worker=new Worker(WORKER);worker.onmessage=e=>handle(e.data);worker.onerror=()=>{const o=op;op=null;o?.reject(Error('The voice model could not start in this browser.'))};const o=begin('load');worker.postMessage({type:'load'});await o.done})().catch(e=>{loading=null;worker?.terminate();worker=null;encoded=null;throw /fetch|load|network/i.test(e.message)?Error('The voice model could not be downloaded. Check your connection and try again.'):e})}
async function prep(blob){const c=audio(),decoded=await c.decodeAudioData(await blob.arrayBuffer()).catch(()=>{throw Error('This audio file could not be read. Try a WAV or MP3.')});if(decoded.duration<2)throw Error('The sample is too short. Use 5 to 10 seconds of clear speech.');const off=new OfflineAudioContext(1,Math.ceil(decoded.duration*RATE),RATE),src=off.createBufferSource();src.buffer=decoded;src.connect(off.destination);src.start();const pcm=(await off.startRendering()).getChannelData(0);return pcm.length>RATE*10?pcm.slice(0,RATE*10):new Float32Array(pcm)}
export function silence(){sources.forEach(s=>{try{s.stop()}catch{}});sources=[];nextT=0}
export async function stop(){token++;silence();const o=op;if(!o)return;if(o.kind==='gen'){o.stopped=true;worker.postMessage({type:'stop'})}await Promise.race([o.done.catch(()=>{}),new Promise(r=>setTimeout(r,o.kind==='gen'?8000:120000))]);if(op===o)op=null}
// Speaks `text` in the voice learned from the sample `id`. `getBlob` returns that sample's audio.
// Resolves with the generated mono PCM (24 kHz), or null if another request replaced this one.
export async function speak(text,id,getBlob){audio();text=String(text||'').trim();if(!text)throw Error('Nothing to say yet.');const key=id+'\n'+text;await stop();const my=++token;if(cache.has(key)){play(cache.get(key));return cache.get(key)}
  await load();if(my!==token)return null;
  if(encoded!==id){statusFn('Learning the voice from your sample…');const pcm=await prep(await getBlob());if(my!==token)return null;encoded=null;const o=begin('encode');worker.postMessage({type:'encode_voice',data:{audio:pcm}},[pcm.buffer]);await o.done;encoded=id}
  if(my!==token)return null;statusFn('Speaking in the cloned voice…');const o=begin('gen');worker.postMessage({type:'generate',data:{text,voice:'custom'}});const out=await o.done;if(o.stopped||!out.length)return null;if(cache.size>40)cache.delete(cache.keys().next().value);cache.set(key,out);return out}
export function forget(id){if(encoded===id)encoded=null;for(const k of [...cache.keys()])if(k.startsWith(id+'\n'))cache.delete(k)}
