const $=id=>document.getElementById(id);
const key='sova-review:'+PACK.datasetSha256;
let state={labels:{},reviewer:'',sample:false,current:PACK.cases[0].id};
let storageOK=true,visible=[];
try {
  const raw=localStorage.getItem(key);
  if(raw){const saved=JSON.parse(raw); const labels=importReviews({schemaVersion:1,datasetId:PACK.datasetId,datasetSha256:PACK.datasetSha256,cases:[],drafts:Object.entries(saved.labels ?? {}).map(([id,l])=>({id,...l}))},PACK); state={...state,...saved,labels};}
}catch(e){storageOK=false;$('save').textContent='Не вдалося прочитати збереження: '+e.message;$('save').classList.add('error');}
function save(){try{localStorage.setItem(key,JSON.stringify(state));storageOK=true;$('save').classList.remove('error');$('save').textContent='Збережено у цьому браузері · '+new Date().toLocaleTimeString('uk-UA');}catch(e){storageOK=false;$('save').classList.add('error');$('save').textContent='Автозбереження недоступне. Завантаж JSON перед закриттям.';}}
const names=['Оплата / доставка через підставний сервіс','Виведення з платформи з ізоляцією','Фішинг під виглядом перевірки','Викрадення платіжних реквізитів','Виманювання персональних даних','Тиск терміновістю','Вербування до військової шкідливої дії','Викрадення seed-фрази','Компрометація криптогаманця','Інша конкретна загроза'];
TYPES.forEach((type,i)=>{const o=document.createElement('option');o.value=type;o.textContent=names[i];$('type').append(o);});
function current(){return PACK.cases.find(c=>c.id===state.current);}
function blank(){return {assessment:null,intentType:null,action:'ALLOW',confidence:'medium',rationale:'',evidenceTurns:[],needsDiscussion:false};}
function label(){return state.labels[state.current] ?? blank();}
function scope(){return PACK.cases.filter(c=>(!state.sample || PACK.sampleIds.includes(c.id))&&($('block').value==='all'||c.block===$('block').value));}
function updateList(){
  const base=scope();const count=base.filter(c=>complete(state.labels[c.id],c.messages.length)).length;
  $('progress-text').textContent=`${count} / ${base.length} завершено`;
  $('progress-bar').style.width=(base.length ? count/base.length*100 : 0)+'%';
  $('draft-count').textContent=base.filter(c=>state.labels[c.id]&&!complete(state.labels[c.id],c.messages.length)).length+' чернеток';
  $('scope').textContent=state.sample?'Фіксована вибірка: 25 A + 25 B':'Повний корпус';
  const query=$('search').value.toLocaleLowerCase('uk-UA');const filter=$('filter').value;
  visible=base.filter(c=>{
    const l=state.labels[c.id],done=complete(l,c.messages.length);
    return (!query || (c.id+' '+c.messages.map(m=>m.text).join(' ')).toLocaleLowerCase('uk-UA').includes(query))&& (filter==='all'||filter==='reviewed'&&done||filter==='unreviewed'&&!done||filter==='draft'&&l&&!done||filter==='flagged'&&l?.needsDiscussion);
  });
  $('case-list').replaceChildren();
  visible.forEach(c=>{const b=document.createElement('button');b.textContent=c.id+' · '+c.block+(complete(state.labels[c.id],c.messages.length)?' · ✓':state.labels[c.id]?' · чернетка':'');b.classList.toggle('active',c.id===state.current);b.onclick=()=>{state.current=c.id;save();render();};$('case-list').append(b);});
  const index=visible.findIndex(c=>c.id===state.current);
  $('prev').disabled=index<=0;$('next').disabled=index<0||index>=visible.length-1;
  $('case-position').textContent=`Блок ${current()?.block ?? ''} · ${index>=0?index+1:'поза фільтром'} / ${visible.length}`;
}
function formStatus(){const c=current();const l=state.labels[state.current];$('form-state').textContent=!l?'Оцінку ще не вибрано.':complete(l,c.messages.length)?'✓ Відповідь завершена. Її можна змінити.':'Чернетка: додай обґрунтування; для загрози — також тип і репліку-доказ.';}
function render(){
  updateList();if(!visible.some(c=>c.id===state.current)&&visible.length){state.current=visible[0].id;save();updateList();}
  $('empty').classList.toggle('hidden',visible.length>0);$('conversation').classList.toggle('hidden',!visible.length);$('panel').classList.toggle('hidden',!visible.length);if(!visible.length)return;
  const c=current(),l=label();$('case-title').textContent=c.id;
  $('messages').replaceChildren();c.messages.forEach((m,i)=>{
    const turn=document.createElement('article');turn.className='turn '+(m.speaker==='user'?'user':'');turn.classList.toggle('evidence',l.evidenceTurns.includes(i+1));
    const title=document.createElement('div');title.className='turn-title';title.textContent=`${i+1}. ${m.speaker==='user'?'Ви':'Співрозмовник'}`;
    const p=document.createElement('p');p.textContent=m.text;
    const lab=document.createElement('label');lab.className='evidence-label';const check=document.createElement('input');check.type='checkbox';check.checked=l.evidenceTurns.includes(i+1);check.onchange=()=>{const next=structuredClone(label());next.evidenceTurns=check.checked?[...next.evidenceTurns,i+1].sort((a,b)=>a-b):next.evidenceTurns.filter(n=>n!==i+1);state.labels[c.id]=next;turn.classList.toggle('evidence',check.checked);save();formStatus();updateList();};lab.append(check,document.createTextNode(' Репліка-доказ'));turn.append(title,p,lab);$('messages').append(turn);
  });
  document.querySelectorAll('[data-assessment]').forEach(b=>b.setAttribute('aria-pressed',String(!!state.labels[c.id]&&b.dataset.assessment===l.assessment)));
  $('type-field').classList.toggle('hidden',l.assessment!=='threat');$('type').value=l.intentType??'';
  $('action').value=l.action;$('action').disabled=l.assessment===null;Array.from($('action').options).forEach(o=>o.disabled=l.assessment==='safe'?o.value!=='ALLOW':l.assessment==='ambiguous'?o.value==='LOCK_INPUT':o.value==='ALLOW');
  $('confidence').value=l.confidence;$('rationale').value=l.rationale;$('discussion').checked=l.needsDiscussion;formStatus();
}
document.querySelectorAll('[data-assessment]').forEach(b=>b.onclick=()=>{const next=structuredClone(label());next.assessment=b.dataset.assessment;next.intentType=null;next.action=next.assessment==='threat'?'WARN':'ALLOW';state.labels[state.current]=next;save();render();});
for(const [id,field,event] of [['type','intentType','change'],['action','action','change'],['confidence','confidence','change'],['rationale','rationale','input'],['discussion','needsDiscussion','change']]) $(id).addEventListener(event,()=>{const next=structuredClone(label());next[field]=id==='discussion'?$(id).checked:id==='type'?$(id).value||null:$(id).value;state.labels[state.current]=next;save();formStatus();updateList();});
function move(delta){const i=visible.findIndex(c=>c.id===state.current);if(i+delta>=0&&i+delta<visible.length){state.current=visible[i+delta].id;save();render();$('case-title').scrollIntoView({block:'start'});}}
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);
$('sample').onclick=()=>{state.sample=true;$('filter').value='all';$('block').value='all';$('search').value='';state.current=PACK.sampleIds[0];save();render();};
$('all').onclick=()=>{state.sample=false;save();render();};
for(const id of ['block','filter','search'])$(id).addEventListener(id==='search'?'input':'change',render);
$('reviewer').value=state.reviewer;$('reviewer').oninput=()=>{state.reviewer=$('reviewer').value;save();};
$('export').onclick=()=>{
  const result={schemaVersion:1,datasetId:PACK.datasetId,datasetSha256:PACK.datasetSha256,reviewer:state.reviewer.trim()||'anonymous',exportedAt:new Date().toISOString(),sampleIds:PACK.sampleIds,cases:[],drafts:[]};
  for(const c of PACK.cases){const l=state.labels[c.id];if(l)(complete(l,c.messages.length)?result.cases:result.drafts).push({id:c.id,...l});}
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sova-review-answers.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('import').onclick=()=>$('file').click();
$('file').onchange=async()=>{try{const file=$('file').files[0];if(!file)return;const payload=JSON.parse(await file.text());const labels=importReviews(payload,PACK);const overlap=Object.keys(labels).filter(id=>state.labels[id]);if(overlap.length&&!confirm(`У файлі є ${overlap.length} відповідей, які замінять твої поточні. Відновити?`))return;state.labels={...state.labels,...labels};if(typeof payload.reviewer==='string'){state.reviewer=payload.reviewer;$('reviewer').value=state.reviewer;}save();render();}catch(e){alert('Імпорт скасовано: '+e.message);}finally{$('file').value='';}};
window.addEventListener('beforeunload',e=>{if(!storageOK&&Object.keys(state.labels).length){e.preventDefault();e.returnValue='';}});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;if(e.key==='ArrowRight')move(1);if(e.key==='ArrowLeft')move(-1);});
if(storageOK)save();render();
