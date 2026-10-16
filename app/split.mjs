// One clip, three uses: a talking video that ends with a few quiet seconds becomes
//   1) the voice sample (its sound), 2) the talking loop (the part where they speak), 3) the idle loop (the quiet tail, played forward then back).
// Everything runs on the phone: the sound tells us where the talking stops; the quiet tail is redrawn into a short looping video.

// Where does the talking end? Reads the sound, finds the last loud moment, and returns its time (seconds),
// plus the clip length. tail = seconds of quiet at the end.
export async function findQuietTail(file){
  const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return null;
  const ctx=new AC();let a;try{a=await ctx.decodeAudioData(await file.arrayBuffer())}catch{return null}finally{try{ctx.close()}catch{}}
  const rate=a.sampleRate,win=Math.floor(rate*0.05),n=Math.floor(a.length/win),rms=new Float32Array(n);
  const ch=[...Array(a.numberOfChannels)].map((_,c)=>a.getChannelData(c));
  for(let w=0;w<n;w++){let s=0;for(let i=w*win;i<(w+1)*win;i++){let v=0;for(const d of ch)v+=d[i];v/=ch.length;s+=v*v}rms[w]=Math.sqrt(s/win)}
  const sorted=[...rms].sort((x,y)=>x-y),loud=sorted[Math.floor(n*0.9)]||0,thr=Math.max(loud*0.08,0.004);
  let last=-1;for(let w=n-1;w>=0;w--)if(rms[w]>thr){last=w;break}
  const speechEnd=last<0?0:(last+1)*win/rate,len=a.duration;return {speechEnd,len,tail:Math.max(0,len-speechEnd)}}

const once=(el,ev)=>new Promise((res,rej)=>{const ok=()=>{el.removeEventListener('error',bad);res()},bad=()=>{el.removeEventListener(ev,ok);rej(Error('This video could not be read on this device.'))};el.addEventListener(ev,ok,{once:true});el.addEventListener('error',bad,{once:true})});
function recorderType(){const MR=globalThis.MediaRecorder;if(!MR)return '';for(const t of ['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'])if(MR.isTypeSupported?.(t))return t;return ''}

// Redraws seconds [from,to] of the video as a new clip that plays forward and then backward, so it loops with no jump.
export async function pingPongClip(file,from,to,{size=400,fps=20,onProgress}={}){
  const type=recorderType();if(!type)throw Error('This browser cannot make the idle loop. Try Chrome or Safari.');
  const url=URL.createObjectURL(file),v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=url;
  try{await once(v,'loadeddata');
    const sc=Math.min(1,size/Math.max(v.videoWidth,v.videoHeight)),w=Math.round(v.videoWidth*sc/2)*2,h=Math.round(v.videoHeight*sc/2)*2;
    const frames=[],count=Math.max(2,Math.round((to-from)*fps));
    for(let i=0;i<count;i++){v.currentTime=Math.min(to,from+i/fps);await once(v,'seeked');frames.push(await createImageBitmap(v,{resizeWidth:w,resizeHeight:h}));onProgress?.(0.6*(i+1)/count)}
    const seq=[...frames,...frames.slice(1,-1).reverse()];
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.drawImage(seq[0],0,0);
    const stream=cv.captureStream(fps),rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:2_500_000}),chunks=[];
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const done=new Promise(r=>rec.onstop=r);
    rec.start();const t0=performance.now();
    for(let i=0;i<seq.length;i++){g.drawImage(seq[i],0,0);onProgress?.(0.6+0.4*(i+1)/seq.length);const wait=t0+(i+1)*1000/fps-performance.now();await new Promise(r=>setTimeout(r,Math.max(0,wait)))}
    rec.stop();await done;frames.forEach(f=>f.close?.());stream.getTracks().forEach(t=>t.stop());
    return new File([new Blob(chunks,{type:type.split(';')[0]})],'idle.'+(type.includes('mp4')?'mp4':'webm'),{type:type.split(';')[0]})}
  finally{URL.revokeObjectURL(url)}}

// The whole job. Returns {talkEnd, idle} where idle is a File (or null when there is no quiet tail long enough).
export async function splitTalkingClip(file,{onProgress}={}){
  const q=await findQuietTail(file);if(!q)return {talkEnd:null,idle:null,why:'No sound found in that video.'};
  if(q.tail<1.2)return {talkEnd:null,idle:null,why:`It ends with only ${q.tail.toFixed(1)} seconds of quiet. End it with about 3 quiet seconds to get an idle loop too.`};
  const from=Math.min(q.len-0.8,q.speechEnd+0.25),to=Math.max(from+0.8,Math.min(q.len-0.08,from+3.5));
  const idle=await pingPongClip(file,from,to,{onProgress});return {talkEnd:+(q.speechEnd+0.05).toFixed(2),idle,tail:q.tail}}
