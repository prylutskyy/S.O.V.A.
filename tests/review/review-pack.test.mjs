import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { complete,importReviews } from '../../scripts/review/state.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const a=read('./share/block-a.json'),b=read('./share/block-b.json');
const pack={...a,cases:[...a.cases,...b.cases].sort((a,b)=>a.id.localeCompare(b.id))};
const manifest=read('./manifest.json');
const base={assessment:'safe',intentType:null,action:'ALLOW',confidence:'medium',rationale:'Немає небезпечного прохання.',evidenceTurns:[],needsDiscussion:false};
const payload=(cases=[],drafts=[])=>({schemaVersion:1,datasetId:pack.datasetId,datasetSha256:pack.datasetSha256,cases,drafts});
describe('Blind review pack and portable labels',()=>{
  it('has 600 unique blind cases and a verified frozen hash',()=>{
    expect(a.cases).toHaveLength(300);expect(b.cases).toHaveLength(300);expect(new Set(pack.cases.map(c=>c.id)).size).toBe(600);
    expect(createHash('sha256').update(JSON.stringify(pack.cases)).digest('hex')).toBe(manifest.datasetSha256);
    for(const c of pack.cases){expect(Object.keys(c).sort()).toEqual(['block','id','messages']);expect(c.messages.length).toBeGreaterThanOrEqual(9);for(const m of c.messages){expect(Object.keys(m).sort()).toEqual(['speaker','text']);expect(['user','interlocutor']).toContain(m.speaker);expect(m.text.trim().length).toBeGreaterThan(0);}}
  });
  it('covers every case exactly once across 30 batches',()=>{
    const ids=[];for(const block of ['a','b'])for(let i=1;i<=15;i++){const batch=read(`./share/batches/block-${block}-${String(i).padStart(2,'0')}.json`);expect(batch.cases).toHaveLength(20);expect(batch.datasetSha256).toBe(manifest.datasetSha256);ids.push(...batch.cases.map(c=>c.id));}
    expect(ids.sort()).toEqual(pack.cases.map(c=>c.id).sort());
  });
  it('uses the same fixed unbiased sample and no author data in HTML',()=>{
    const sample=read('./share/sample-50.json');expect(sample.cases).toHaveLength(50);expect(sample.cases.filter(c=>c.block==='A')).toHaveLength(25);expect(sample.cases.map(c=>c.id)).toEqual(manifest.sampleIds);
    const html=readFileSync(new URL('./review.html',import.meta.url),'utf8');const embedded=JSON.parse(html.match(/const PACK=(.*);\n/)[1]);expect(embedded.cases).toEqual(pack.cases);expect(embedded.sampleIds).toEqual(manifest.sampleIds);expect(html).not.toContain('author-labels');expect(html).not.toContain('/*DATA*/');
  });
  it('retains explicit parent relationships without leaking them into blind records',()=>{
    const authored=read('./author-only/author-labels.json');expect(authored.cases).toHaveLength(600);expect(new Set(authored.cases.filter(c=>c.sourceId).map(c=>c.sourceId)).size).toBe(60);
    for(const c of authored.cases.filter(c=>c.sourceId)){expect(pack.cases.find(r=>r.id===c.id).block).toBe('B');expect(pack.cases.find(r=>r.id===c.sourceId).block).toBe('A');}
  });
  it('does not count missing, neutral drafts or incomplete threats as completed',()=>{
    expect(complete(undefined,10)).toBeFalsy();expect(complete({...base,assessment:null},10)).toBe(false);expect(complete({...base,rationale:''},10)).toBe(false);expect(complete({...base,assessment:'threat',action:'WARN'},10)).toBe(false);expect(complete({...base,assessment:'threat',intentType:'IDENTITY_PROBING',action:'WARN',evidenceTurns:[9]},10)).toBe(true);
  });
  it('round trips a partial review with drafts',()=>{
    const p=payload([{id:pack.cases[0].id,...base}],[{id:pack.cases[1].id,...base,assessment:null}]);const imported=importReviews(JSON.parse(JSON.stringify(p)),pack);expect(Object.keys(imported)).toHaveLength(2);expect(imported[pack.cases[0].id]).toEqual(base);
  });
  it('rejects wrong versions, unknown IDs and duplicate entries atomically',()=>{
    expect(()=>importReviews({...payload(),datasetSha256:'wrong'},pack)).toThrow();expect(()=>importReviews(payload([{id:'R-9999',...base}]),pack)).toThrow();const entry={id:pack.cases[0].id,...base};expect(()=>importReviews(payload([entry],[entry]),pack)).toThrow();
  });
  it('rejects non-existing evidence turns, invalid actions and safe hard locks',()=>{
    for(const bad of [{...base,evidenceTurns:[99]},{...base,evidenceTurns:[1,1]},{...base,action:'LOCK_INPUT'},{...base,assessment:'ambiguous',intentType:'IDENTITY_PROBING'},{...base,intentType:'invented'}])expect(()=>importReviews(payload([{id:pack.cases[0].id,...bad}]),pack)).toThrow();
  });
});
