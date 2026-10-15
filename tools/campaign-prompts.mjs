// Writes CLIPS.md next to a campaign.json: every clip slot, the file name to save it as, and its Grok prompt.
// Usage: node tools/campaign-prompts.mjs app/campaigns/cryo-escape
import { readFileSync, writeFileSync } from 'node:fs';
import { validateCampaign, clipSlots, grokPrompt } from '../app/story-core.mjs';
const dir = (process.argv[2] || 'app/campaigns/cryo-escape').replace(/\/$/, '');
const r = validateCampaign(JSON.parse(readFileSync(dir + '/campaign.json', 'utf8')));
if (!r.ok) { console.error(r.errors.join('\n')); process.exit(1) }
const c = r.campaign, slots = clipSlots(c);
const group = k => ({ neutral: 'Neutral loops (the player stands and looks around)', forward: 'Forward clips (play once when the player pushes forward)', zone: 'Zone-enter clips (play once on entering a new zone)', character: 'Characters (full body on green screen, keyed out in the app)' }[k]);
let md = `# ${c.title}: clip slots and Grok prompts\n\nGenerated from campaign.json by \`node tools/campaign-prompts.mjs ${dir}\`. Make each clip with its prompt, save it with exactly the file name shown, and put it in \`${dir}/media/\`. Until a file is there, story mode shows a labelled slot (with stand-in art where noted). ${slots.length} slots.\n`;
for (const kind of ['neutral', 'forward', 'zone', 'character']) {
  const list = slots.filter(s => s.kind === kind); if (!list.length) continue;
  md += `\n## ${group(kind)}\n`;
  for (const s of list) md += `\n### ${s.file.split('/').pop()}\n${s.loop ? 'Loop' : 'Plays once'} · ${s.seconds} s${s.standIn ? ` · stand-in until made: \`app/${s.standIn}\`` : ''}\n\n\`\`\`\n${grokPrompt(c, s.key)}\n\`\`\`\n`;
}
writeFileSync(dir + '/CLIPS.md', md);
console.log(`wrote ${dir}/CLIPS.md (${slots.length} slots)`);
