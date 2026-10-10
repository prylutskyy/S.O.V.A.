import { describe,it,expect } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('./review.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
function boot(saved,broken=false){
  const w=new Window({url:'https://offline-review.test/',settings:{enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  w.document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.alert=()=>{};w.confirm=()=>true;
  if(saved)for(const [key,value] of Object.entries(saved))w.localStorage.setItem(key,value);
  if(broken)Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem:()=>{throw new Error('quota');}}});
  w.eval(script);
  return w;
}
function storage(w){const result={};for(let i=0;i<w.localStorage.length;i++){const key=w.localStorage.key(i);result[key]=w.localStorage.getItem(key);}return result;}
const field=(w,id,value)=>{const el=w.document.getElementById(id);el.value=value;el.dispatchEvent(new w.Event(id==='rationale'?'input':'change'));};
describe('Offline review page behaviour',()=>{
  it('shows all dialogs and the fixed fifty-case sample without assigning automatic labels',()=>{
    const w=boot();expect(w.document.querySelectorAll('#case-list button')).toHaveLength(600);expect(w.document.getElementById('progress-text').textContent).toContain('0 / 600');w.document.getElementById('sample').click();expect(w.document.querySelectorAll('#case-list button')).toHaveLength(50);expect(w.document.getElementById('progress-text').textContent).toContain('0 / 50');w.close();
  });
  it('autosaves every text edit as an unclassified draft and restores after reload',()=>{
    const w=boot();field(w,'rationale','Поки читаю, оцінку ще не обрав.');const saved=storage(w);const record=JSON.parse(Object.values(saved)[0]);expect(Object.values(record.labels)[0].assessment).toBe(null);expect(w.document.getElementById('progress-text').textContent).toContain('0 / 600');w.close();
    const reload=boot(saved);expect(reload.document.getElementById('rationale').value).toBe('Поки читаю, оцінку ще не обрав.');expect(reload.document.querySelectorAll('[data-assessment][aria-pressed=true]')).toHaveLength(0);reload.close();
  });
  it('keeps edits when navigating, completes safe labels and restores them',()=>{
    const w=boot();const id=w.document.getElementById('case-title').textContent;w.document.querySelector('[data-assessment=safe]').click();field(w,'rationale','Немає вимоги секретів.');expect(w.document.getElementById('progress-text').textContent).toContain('1 / 600');w.document.getElementById('next').click();expect(w.document.getElementById('case-title').textContent).not.toBe(id);w.document.getElementById('prev').click();expect(w.document.getElementById('rationale').value).toBe('Немає вимоги секретів.');const saved=storage(w);w.close();const reload=boot(saved);expect(reload.document.querySelector('[data-assessment=safe]').getAttribute('aria-pressed')).toBe('true');reload.close();
  });
  it('requires type and evidence for threats and counts ambiguity as its own assessment',()=>{
    const w=boot();w.document.querySelector('[data-assessment=threat]').click();field(w,'rationale','Просять дані без пояснення.');expect(w.document.getElementById('progress-text').textContent).toContain('0 / 600');field(w,'type','IDENTITY_PROBING');w.document.querySelector('.evidence-label input').click();expect(w.document.getElementById('progress-text').textContent).toContain('1 / 600');w.document.querySelector('[data-assessment=ambiguous]').click();expect(w.document.getElementById('type-field').classList.contains('hidden')).toBe(true);expect(w.document.getElementById('action').value).toBe('ALLOW');expect(JSON.parse(Object.values(storage(w))[0]).labels[w.document.getElementById('case-title').textContent].assessment).toBe('ambiguous');w.close();
  });
  it('reports unavailable storage without a false saved message',()=>{
    const w=boot(undefined,true);expect(w.document.getElementById('save').classList.contains('error')).toBe(true);expect(w.document.getElementById('save').textContent).toContain('недоступне');w.close();
  });
  it('filters marked cases without treating empty cases as safe',()=>{
    const w=boot();w.document.querySelector('[data-assessment=safe]').click();field(w,'rationale','Безпечний запит.');field(w,'filter','reviewed');expect(w.document.querySelectorAll('#case-list button')).toHaveLength(1);field(w,'filter','draft');expect(w.document.getElementById('empty').classList.contains('hidden')).toBe(false);w.close();
  });
  it('exports completed answers and drafts separately without dialogue texts',async()=>{
    const w=boot();let blob;w.URL.createObjectURL=b=>{blob=b;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
    w.document.querySelector('[data-assessment=safe]').click();field(w,'rationale','Немає небезпечного прохання.');w.document.getElementById('next').click();field(w,'rationale','Ще думаю.');w.document.getElementById('export').click();
    const result=JSON.parse(await blob.text());expect(result.cases).toHaveLength(1);expect(result.drafts).toHaveLength(1);expect(result.drafts[0].assessment).toBe(null);expect(result.cases[0]).not.toHaveProperty('messages');w.close();
  });
  it('imports backups and rejects a wrong hash without changing existing work',async()=>{
    const w=boot();const first=w.document.getElementById('case-title').textContent;w.document.querySelector('[data-assessment=safe]').click();field(w,'rationale','Перша відповідь.');const record=JSON.parse(Object.values(storage(w))[0]);const hash=Object.keys(storage(w))[0].split(':')[1];
    const file=w.document.getElementById('file');let content={schemaVersion:1,datasetId:'sova-blind-review-v1',datasetSha256:hash,reviewer:'Тест',cases:[{id:first,...record.labels[first],rationale:'Відновлена відповідь.'}]};
    Object.defineProperty(file,'files',{configurable:true,get:()=>[{text:async()=>JSON.stringify(content)}]});await file.onchange();expect(w.document.getElementById('rationale').value).toBe('Відновлена відповідь.');content={...content,datasetSha256:'wrong'};let error='';w.alert=message=>{error=message;};await file.onchange();expect(error).toContain('Імпорт скасовано');expect(w.document.getElementById('rationale').value).toBe('Відновлена відповідь.');w.close();
  });
});
