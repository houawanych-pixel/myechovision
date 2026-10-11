// On-device character "brain" (test). Runs a small open language model in the browser with WebLLM
// (see vendor/web-llm/NOTICE.md). Needs WebGPU. Nothing typed is sent to a server.
import {brainPrompt,parseReply} from './core.mjs?v=2';
export const MODELS={small:{label:'Small',size:'about 0.7 GB',base:'Llama-3.2-1B-Instruct'},large:{label:'Larger',size:'about 1.8 GB',base:'Llama-3.2-3B-Instruct'}};
let engine=null,loadedId=null,loading=null,busy=false,statusFn=()=>{};
export function onStatus(fn){statusFn=fn}
export const isBusy=()=>busy;
export async function support(){if(!navigator.gpu)return {ok:false,why:'This browser cannot run the on-device brain (no WebGPU). Try Chrome on a recent phone or computer.'};const a=await navigator.gpu.requestAdapter().catch(()=>null);if(!a)return {ok:false,why:'This device\'s graphics chip cannot run the on-device brain.'};return {ok:true,f16:a.features.has('shader-f16')}}
export function load(size='small'){return loading??=(async()=>{const s=await support();if(!s.ok)throw Error(s.why);const id=(MODELS[size]||MODELS.small).base+(s.f16?'-q4f16_1-MLC':'-q4f32_1-MLC');if(engine&&loadedId===id)return engine;statusFn('Loading the brain…');const {CreateMLCEngine}=await import('./vendor/web-llm/index.js');if(engine){await engine.unload().catch(()=>{});engine=null}engine=await CreateMLCEngine(id,{initProgressCallback:p=>statusFn(`Loading the brain… ${Math.round((p.progress||0)*100)}%`)});loadedId=id;return engine})().finally(()=>{loading=null})}
// ctx: see brainPrompt in core.mjs. onText gets the reply so far as it is written.
export async function reply(ctx,size,onText=()=>{}){if(busy)throw Error('Still thinking about the last message.');busy=true;try{const e=await load(size);statusFn('Thinking…');const stream=await e.chat.completions.create({messages:brainPrompt(ctx),stream:true,temperature:0.8,top_p:0.9,max_tokens:140});let raw='';for await(const part of stream){raw+=part.choices[0]?.delta?.content||'';const t=parseReply(raw,ctx.name).text;if(t)onText(t)}return parseReply(raw,ctx.name)}finally{busy=false}}
