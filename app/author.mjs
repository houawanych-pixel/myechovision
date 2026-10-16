// Author Studio: turns a story session into a book of chapters.
// The conversation itself (session.messages) is the original and is never changed here.
// Each chapter keeps its own Novel and Screenplay versions, each with a short history so nothing is lost.

export const STYLES=[
  ['cinematic','Cinematic','Vivid, visual, present-moment storytelling with strong scene images.'],
  ['literary','Literary','Rich interior thought, careful imagery, measured pacing.'],
  ['pulp','Pulp adventure','Fast, punchy, cliffhanger energy, short paragraphs.'],
  ['lightnovel','Light novel','Japanese light-novel voice: brisk, emotional, lots of dialogue, inner asides.'],
  ['noir','Noir','Hard-boiled, terse, shadowy, cynical first-glance details.'],
  ['epic','Epic fantasy','Grand, mythic tone, sweeping description, weight and legend.'],
  ['wuxia','Wuxia','Ancient-China martial-arts saga: honour, sects, poetic imagery of wind, steel and mountains.'],
  ['horror','Horror','Slow dread, sensory detail, tension that tightens line by line.'],
  ['romance','Romance','Feelings first: longing, small gestures, chemistry in every exchange.'],
  ['mystery','Mystery','Clues placed fairly, sharp observation, questions that pull the reader on.'],
  ['ya','Young adult','Immediate, honest, heartfelt, easy to read.'],
  ['scifi','Hard sci-fi','Precise, grounded technology and stakes, clear cause and effect.'],
];
export const styleOf=id=>STYLES.find(s=>s[0]===id)||STYLES[0];

const clean=t=>String(t||'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();

// Chapters: built once from where the story moved to its next chapter (session.chapAt), or one chapter for the whole talk.
export function ensureBook(s){
  if(s.book?.chapters?.length)return s.book;
  const cuts=[...new Set((s.chapAt||[]).filter(n=>Number.isInteger(n)&&n>0&&n<s.messages.length))].sort((a,b)=>a-b);
  const starts=[0,...cuts],chapters=starts.map((from,i)=>({id:'ch'+(i+1)+'-'+Date.now().toString(36),title:`Chapter ${i+1}`,from,to:i<starts.length-1?starts[i+1]:null,status:'draft',versions:{}}));
  if(s.draft&&s.draft.trim())chapters[0].versions.novel={text:s.draft,style:'',at:Date.now(),history:[],from:'old draft'};
  s.book={title:'',style:'cinematic',chapters};return s.book}

// The lines of one chapter, as written in the conversation (the untouched original).
export function chapterLines(s,ch,nameOf){
  const end=ch.to==null?s.messages.length:ch.to,out=[];
  const idx=s.book.chapters.indexOf(ch);
  for(const n of s.narration||[])if(n.chap===idx&&n.text)out.push({who:'NARRATOR',text:clean(n.text),narr:true});
  for(const m of s.messages.slice(ch.from,end)){const text=clean(m.text);if(!text)continue;out.push({who:m.role==='user'?nameOf(s.player,true):nameOf(m.who||s.partner),text})}
  return out}
export const transcriptText=lines=>lines.map(l=>l.narr?`(${l.text})`:`${l.who}: ${l.text}`).join('\n\n');

// Without the AI: a plain but readable prose version, and a correctly formatted screenplay.
export function quickNovel(lines,scene){
  const said=['said','replied','answered','added','went on'];let k=0;
  const body=lines.map(l=>{if(l.narr)return l.text;const t=l.text.replace(/^["“]+|["”]+$/g,'').trim();const q=/[!?…]$/.test(t)?t:t.replace(/\.$/,'')+',';return `“${q}” ${l.who} ${said[k++%said.length]}.`}).join('\n\n');
  return (scene?`${scene}.\n\n`:'')+body}
export function quickScreenplay(lines,scene,title){
  const slug=`INT. ${String(scene||'UNKNOWN LOCATION').toUpperCase()} - CONTINUOUS`;
  const parts=[slug,''];
  for(const l of lines){if(l.narr){parts.push(l.text,'');continue}parts.push('            '+l.who.toUpperCase(),'      '+wrap(l.text,38).join('\n      '),'')}
  return parts.join('\n').trim()}
function wrap(t,w){const words=t.split(' '),out=[];let line='';for(const x of words){if((line+' '+x).trim().length>w){out.push(line.trim());line=x}else line+=' '+x}if(line.trim())out.push(line.trim());return out}

// Prompts for the AI brain.
export function novelAsk({lines,scene,style,title,prior}){const st=styleOf(style);return [{role:'system',content:`You are a skilled novelist. Turn the transcript of one chapter of an interactive story into polished novel prose. Style: ${st[1]} — ${st[2]} Keep every event, choice and line of meaning from the transcript, in order; you may tighten or expand dialogue naturally, add setting, action and inner thought, but do not invent major plot events. Third person past tense unless the transcript clearly suits first person. No headings, no notes, no markdown. Output only the chapter text.`},{role:'user',content:`${title?`Chapter: ${title}\n`:''}Setting: ${scene||'unknown'}\n${prior?`Story so far (for continuity): ${prior.slice(-1200)}\n`:''}Transcript:\n${transcriptText(lines).slice(0,9000)}`}]}
export function screenplayAsk({lines,scene,style,title}){const st=styleOf(style);return [{role:'system',content:`You are a professional screenwriter. Turn the transcript of one chapter of an interactive story into a screenplay scene in standard Fountain format: scene headings like INT. PLACE - NIGHT, action lines in present tense, character names in CAPITALS on their own line before their dialogue, parentheticals sparingly. Tone: ${st[1]} — ${st[2]} Keep the events and the meaning of every exchange, in order; you may trim and sharpen dialogue. No markdown, no notes. Output only the screenplay.`},{role:'user',content:`${title?`Chapter: ${title}\n`:''}Setting: ${scene||'unknown'}\nTranscript:\n${transcriptText(lines).slice(0,9000)}`}]}
export function rewriteAsk({text,kind,style,ask}){const st=styleOf(style);return [{role:'system',content:`You revise ${kind==='screenplay'?'a screenplay scene in Fountain format':'a chapter of novel prose'}. Style: ${st[1]} — ${st[2]} Apply the author's request exactly and keep everything else. Output only the revised ${kind==='screenplay'?'screenplay':'chapter'}, no notes.`},{role:'user',content:`Author's request: ${ask||'Polish it: sharper sentences, better rhythm, same events.'}\n\nText:\n${String(text).slice(0,12000)}`}]}

// Save a new version, keeping the last few so a rewrite can always be undone.
export function putVersion(ch,kind,text,style,from){const v=ch.versions[kind];const history=v?[{text:v.text,style:v.style,at:v.at},...(v.history||[])].slice(0,5):[];if(v&&v.text===text)return false;ch.versions[kind]={text,style:style||'',at:Date.now(),history,from:from||''};return true}
export function restoreVersion(ch,kind){const v=ch.versions[kind];if(!v?.history?.length)return false;const [prev,...rest]=v.history;ch.versions[kind]={...prev,history:[{text:v.text,style:v.style,at:v.at},...rest].slice(0,5)};return true}

// Exports: a manuscript (Markdown), a screenplay (Fountain), and the original transcript.
export function manuscript(book,chapters,{author}={}){return `# ${book.title||'Untitled'}\n\n${author?`by ${author}\n\n`:''}`+chapters.map(c=>`## ${c.title}\n\n${c.text.trim()}\n`).join('\n')}
export function fountain(book,chapters,{author}={}){return `Title: ${book.title||'Untitled'}\nCredit: Written by\nAuthor: ${author||'Anonymous'}\n\n`+chapters.map(c=>`# ${c.title}\n\n${c.text.trim()}\n`).join("\n===\n\n")}
export function transcriptFile(book,chapters){return `${book.title||'Untitled'} — original transcript\n\n`+chapters.map(c=>`${c.title}\n${'-'.repeat(c.title.length)}\n\n${c.text}\n`).join('\n')}

// When the story moves on to its next chapter, the book gets a new chapter too (the old one closes where it ended).
export function nextChapter(s){const b=s.book;if(!b)return;const last=b.chapters.at(-1);if(last&&last.to==null){if(s.messages.length<=last.from)return last;last.to=s.messages.length}const ch={id:'ch'+(b.chapters.length+1)+'-'+Date.now().toString(36),title:`Chapter ${b.chapters.length+1}`,from:s.messages.length,to:null,status:'draft',versions:{}};b.chapters.push(ch);return ch}
