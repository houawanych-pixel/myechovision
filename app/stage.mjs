// The character stage: shows the right picture or clip for what the character is doing, and can remove a
// green or blue background so the character sits on top of the scene (image over image, video over video).
// Keying runs on the graphics chip (WebGL). Without WebGL the clip is shown as it is, unkeyed.
const VS='attribute vec2 p;varying vec2 v;void main(){v=vec2((p.x+1.0)/2.0,(1.0-p.y)/2.0);gl_Position=vec4(p,0.0,1.0);}';
// k measures how much the key colour stands out from the other two. alpha fades between `sim` and `sim+soft`.
// Spill removal pulls the key colour down toward the others so edges and skin lose the coloured glow.
const FS='precision mediump float;uniform sampler2D t;uniform float blue;uniform float sim;uniform float soft;uniform float spill;varying vec2 v;void main(){vec4 c=texture2D(t,v);float k=blue>0.5?c.b-max(c.r,c.g):c.g-max(c.r,c.b);float a=1.0-smoothstep(sim,sim+soft,k);vec3 o=c.rgb;if(blue>0.5){o.b=min(o.b,mix(o.b,max(o.r,o.g),spill));}else{o.g=min(o.g,mix(o.g,max(o.r,o.b),spill));}gl_FragColor=vec4(o*a,a);}';
export const isVideo=type=>/^video\//.test(type||'');
function element(clip){if(isVideo(clip.type)){const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=clip.src;return v}const i=new Image();i.decoding='async';i.src=clip.src;return i}
const ready=el=>el.tagName==='VIDEO'?el.readyState>=2&&el.videoWidth>0:el.complete&&el.naturalWidth>0;
const size=el=>el.tagName==='VIDEO'?[el.videoWidth,el.videoHeight]:[el.naturalWidth,el.naturalHeight];

// host: an element to fill. Returns the controls used by the chat screen.
export function createStage(host){
  const bgBox=document.createElement('div'),fgBox=document.createElement('div');bgBox.className='stageBg';fgBox.className='stageFg';host.prepend(fgBox);host.prepend(bgBox);
  let clips={},chroma='none',spill=0.8,els={},current=null,override=null,holdTimer=0,talking=false,raf=0,dead=false,canvas=null,gl=null,uni=null,tex=null,drawnStill=null;
  const setup=()=>{if(canvas||chroma==='none')return;const c=document.createElement('canvas'),g=c.getContext('webgl',{premultipliedAlpha:true,alpha:true});if(!g)return;const sh=(type,src)=>{const s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);return s},pr=g.createProgram();g.attachShader(pr,sh(g.VERTEX_SHADER,VS));g.attachShader(pr,sh(g.FRAGMENT_SHADER,FS));g.linkProgram(pr);if(!g.getProgramParameter(pr,g.LINK_STATUS))return;g.useProgram(pr);const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),g.STATIC_DRAW);const loc=g.getAttribLocation(pr,'p');g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,2,g.FLOAT,false,0,0);tex=g.createTexture();g.bindTexture(g.TEXTURE_2D,tex);for(const [k,val] of [[g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE],[g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE],[g.TEXTURE_MIN_FILTER,g.LINEAR],[g.TEXTURE_MAG_FILTER,g.LINEAR]])g.texParameteri(g.TEXTURE_2D,k,val);uni={blue:g.getUniformLocation(pr,'blue'),sim:g.getUniformLocation(pr,'sim'),soft:g.getUniformLocation(pr,'soft'),spill:g.getUniformLocation(pr,'spill')};g.clearColor(0,0,0,0);canvas=c;gl=g;c.className='stageCanvas'};
  const draw=el=>{if(!gl||!ready(el))return false;const [w,h]=size(el),k=Math.min(1,960/Math.max(w,h)),cw=Math.round(w*k),ch=Math.round(h*k);if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;gl.viewport(0,0,cw,ch)}try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,el)}catch{return false}gl.uniform1f(uni.blue,chroma==='blue'?1:0);gl.uniform1f(uni.sim,0.08);gl.uniform1f(uni.soft,0.14);gl.uniform1f(uni.spill,spill);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true};
  const loop=()=>{if(dead)return;raf=requestAnimationFrame(loop);const el=els[current];if(!el||!gl)return;if(el.tagName==='VIDEO'){draw(el)}else if(drawnStill!==current&&draw(el))drawnStill=current};
  const best=()=>override&&clips[override]?override:talking&&clips.talking?'talking':clips.normal?'normal':Object.keys(clips)[0]||null;
  const apply=()=>{const key=best();if(!key){fgBox.replaceChildren();current=null;return}if(key===current&&fgBox.firstChild)return;const prev=els[current];if(prev?.tagName==='VIDEO'&&key!==current)prev.pause();current=key;drawnStill=null;const el=els[key]??=element(clips[key]);setup();if(el.tagName==='VIDEO'){el.loop=key!==override;el.onended=key===override?()=>{if(override===key){override=null;apply()}}:null;if(key===override)try{el.currentTime=0}catch{}el.play().catch(()=>{})}if(gl){if(fgBox.firstChild!==canvas)fgBox.replaceChildren(canvas)}else fgBox.replaceChildren(el);if(!raf)loop()};
  return {
    // clips: {slot:{src,type}}. chroma: 'none' | 'green' | 'blue'. spill: 0..1 edge clean-up.
    setCharacter(next,key='none',clean=0.8){clips=next||{};chroma=key;spill=clean;els={};current=null;override=null;apply()},
    setBackground(bg){bgBox.replaceChildren();if(!bg?.src)return;const el=element(bg);if(el.tagName==='VIDEO'){el.loop=true;el.play().catch(()=>{})}bgBox.append(el)},
    has:key=>!!clips[key],
    // Shows a slot. A video plays once from its first frame; a picture is held for `hold` ms. Then it returns to talking or normal.
    // Returns false when the character has nothing for that slot. `force` lets an action interrupt whatever is showing.
    show(key,{hold=4500,force=true}={}){if(!clips[key])return false;if(override&&!force)return false;clearTimeout(holdTimer);override=key;current=null;apply();if(!isVideo(clips[key].type))holdTimer=setTimeout(()=>{if(override===key){override=null;apply()}},hold);return true},
    speaking(on){talking=!!on;if(!override)apply()},
    get showing(){return current},
    get keyed(){return !!gl},
    get canvas(){return canvas},
    destroy(){dead=true;cancelAnimationFrame(raf);clearTimeout(holdTimer);for(const e of Object.values(els))if(e.tagName==='VIDEO'){e.pause();e.removeAttribute('src')}bgBox.remove();fgBox.remove()}}}
