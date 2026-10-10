import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildReferences } from '../../scripts/review/references.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
function rebuild(){
  const a=read('./share/block-a.json'),b=read('./share/block-b.json');
  const files=['block-a-AI-1.json','block-a-AI-2.json','block-b-AI-1.json','block-b-AI-2.json'];
  const submissions=Object.fromEntries(files.map(name=>[name,read('./reviews/'+name)]));
  const relations=Object.fromEntries(read('./author-only/author-labels.json').cases.map(c=>[c.id,{family:c.family,sourceId:c.sourceId,transform:c.transform}]));
  return {pack:{...a,cases:[...a.cases,...b.cases].sort((a,b)=>a.id.localeCompare(b.id))},submissions,relations};
}
describe('Frozen provisional AI references',()=>{
  it('rebuilds exactly from all four complete submissions without using author decisions',()=>{
    const {pack,submissions,relations}=rebuild();
    expect(buildReferences(pack,submissions,relations)).toEqual(read('./references.json'));
  });
  it('preserves all assessment and type disagreements rather than selecting a preferred reviewer',()=>{
    const {pack,submissions,relations}=rebuild();const refs=buildReferences(pack,submissions,relations);
    expect(refs.cases.filter(c=>c.assessment==='disputed')).toHaveLength(66);
    expect(refs.cases.filter(c=>!c.typeAgreement)).toHaveLength(5);
    const conflict=refs.cases.find(c=>c.id==='R-0049');expect(conflict.assessment).toBe('threat');expect(conflict.expectedType).toBeNull();expect(conflict.votes.map(v=>v.intentType)).toEqual(['CRYPTO_WALLET_COMPROMISE','SEED_PHRASE_THEFT']);
  });
  it('refuses partial or wrong-block submissions and altered blind texts',()=>{
    const x=rebuild();x.submissions['block-a-AI-1.json'].cases.pop();expect(()=>buildReferences(x.pack,x.submissions,x.relations)).toThrow();
    const y=rebuild();y.pack.cases[0].messages[0].text+=' changed';expect(()=>buildReferences(y.pack,y.submissions,y.relations)).toThrow('hash mismatch');
  });
});
