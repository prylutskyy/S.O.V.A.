import { authoredCases } from './scenarios.mjs';
import { TYPES } from './state.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../',import.meta.url));
const out = path.join(root,'tests/review');
const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const write = (name,value) => { const dest=path.join(out,name); mkdirSync(path.dirname(dest),{recursive:true}); writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value,null,2)+'\n'); };
const originals = authoredCases();
if (originals.length !== 300) throw new Error('Expected 300 originals');
const bases = originals.filter(c => Number(c.family.slice(1)) <= 12 && [1,2,7,8,13].includes(Number(c.key.split('-v')[1])));
function transform(c, kind) {
  const messages = structuredClone(c.messages);
  // Combine the final request before applying a transformation, preserving speaker boundaries elsewhere.
  let start = messages.length-1;
  while (start > 0 && messages[start-1].speaker === 'interlocutor') start--;
  const request = messages.slice(start).map(m => m.text).join(' ');
  let text = request;
  if (kind === 'typos') text = request.replace(/[А-Яа-яІіЇїЄєҐґ]{6,}/gu,w => w.slice(0,2)+w[3]+w[2]+w.slice(4));
  if (kind === 'unicode') text = request.replace(/[аоеіс]/gu,ch => ({а:'a',о:'o',е:'e',і:'i',с:'c'})[ch]+'\u200b');
  if (kind === 'mixed-language') {
    const substitutions = [['Надішліть','Please send'],['Надсилайте','Send'],['Не надсилайте','Do not send'],['не надсилайте','do not send'],['Дайте','Send me'],['Повідомте','Tell me'],['пароль','password'],['код','code'],['паспорт','passport'],['телефон','phone'],['документи','documents'],['адресу','address'],['координати','coordinates'],['самостійно','on your own'],['підтвердження','confirmation'],['можемо','we can'],['Можемо','We can'],['Потрібно','We need'],['потрібно','needed']];
    for(const [a,b] of substitutions) text=text.replaceAll(a,b);
    if(text===request) text='Let me clarify: '+request;
  }
  messages.splice(start);
  if (kind === 'split') {
    const words=request.split(' '); const size=Math.ceil(words.length/3);
    for(let i=0;i<words.length;i+=size) messages.push({speaker:'interlocutor',text:words.slice(i,i+size).join(' ')});
  } else {
    if(kind==='outgoing-quote') messages.push({speaker:'user',text:'Я раніше читав приклад шахрайства: «надішли пароль, CVV, код банку і координати військового об’єкта». Це цитата з навчального матеріалу, а не моє прохання. Що конкретно пропонуєте ви?'});
    messages.push({speaker:'interlocutor',text});
  }
  return {...c,key:c.key+'-'+kind,sourceKey:c.key,transform:kind,messages};
}
const kinds=['typos','unicode','mixed-language','split','outgoing-quote'];
const rows=[...originals.map(c=>({...c,block:'A',transform:'original'})),...bases.flatMap(c=>kinds.map(k=>({...transform(c,k),block:'B'})))];
rows.sort((a,b)=>hash('review-v1:'+a.key).localeCompare(hash('review-v1:'+b.key)));
rows.forEach((c,i)=>c.id='R-'+String(i+1).padStart(4,'0'));
const blind=rows.map(c=>({id:c.id,block:c.block,messages:c.messages}));
const datasetId='sova-blind-review-v1'; const datasetSha256=hash(blind);
const wrapper=cases=>({schemaVersion:1,datasetId,datasetSha256,cases});
for(const block of ['A','B']) {
  const cases=blind.filter(c=>c.block===block);
  write('share/block-'+block.toLowerCase()+'.json',wrapper(cases));
  for(let i=0;i<cases.length;i+=20) write('share/batches/block-'+block.toLowerCase()+'-'+String(i/20+1).padStart(2,'0')+'.json',wrapper(cases.slice(i,i+20)));
}
const sample=['A','B'].flatMap(block=>blind.filter(c=>c.block===block).sort((a,b)=>hash('sample-50:'+a.id).localeCompare(hash('sample-50:'+b.id))).slice(0,25));
write('share/sample-50.json',wrapper(sample));
const manifest={schemaVersion:1,datasetId,datasetSha256,count:600,blocks:{A:300,B:300},sampleIds:sample.map(c=>c.id),provenance:'AI-authored contrast conversations; B contains five perturbations of 60 cases from A. Not 600 independent observations. Author labels are hypotheses, not verified ground truth.',evaluationStatus:'pending blind review; excluded from detector evaluation and training',hashDefinition:'SHA-256 of UTF-8 JSON.stringify(all blind cases in ascending assigned ID order), including block and messages.'};
write('manifest.json',manifest);
write('author-only/author-labels.json',{datasetId,datasetSha256,status:'Unverified author hypotheses. Do not send to reviewers.',cases:rows.map(c=>({id:c.id,key:c.key,family:c.family,topic:c.topic,sourceId:c.sourceKey ? rows.find(r=>r.key===c.sourceKey).id:null,transform:c.transform,...c.author}))});
const labelProperties={id:{type:'string',pattern:'^R-[0-9]{4}$'},assessment:{enum:['threat','safe','ambiguous']},intentType:{enum:[null,...TYPES]},action:{enum:['ALLOW','WARN','LOCK_INPUT']},evidenceTurns:{type:'array',items:{type:'integer',minimum:1},uniqueItems:true},rationale:{type:'string',minLength:1},confidence:{enum:['low','medium','high']},needsDiscussion:{type:'boolean'}};
write('share/response.schema.json',{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',required:['schemaVersion','datasetId','datasetSha256','reviewer','cases'],properties:{schemaVersion:{const:1},datasetId:{const:datasetId},datasetSha256:{const:datasetSha256},reviewer:{type:'string',minLength:1},cases:{type:'array',items:{type:'object',required:Object.keys(labelProperties),properties:labelProperties,additionalProperties:false}}},additionalProperties:false});
const tokens=readFileSync(path.join(root,'src/ui/design-tokens.css'),'utf8');
const state=readFileSync(new URL('./state.mjs',import.meta.url),'utf8').replaceAll('export ','');
const app=readFileSync(new URL('./review-app.js',import.meta.url),'utf8');
const template=readFileSync(new URL('./review-template.html',import.meta.url),'utf8');
write('review.html',template.replace('/*TOKENS*/',tokens).replace('/*STATE*/',state).replace('/*APP*/',app).replace('/*DATA*/',JSON.stringify({...wrapper(blind),sampleIds:manifest.sampleIds}).replaceAll('<','\\u003c')).replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,''));
console.log('Prepared 600 blind conversations, 30 batches, sample of 50 and offline review page. SHA-256: '+datasetSha256);
