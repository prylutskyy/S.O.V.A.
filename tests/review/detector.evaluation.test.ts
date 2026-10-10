import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe,it,expect } from 'vitest';
import { ChatSessionState } from '../../src/heuristics/chat-session-state';
import { getThreatMitigationAction } from '../../src/heuristics/threat-mitigation-policy';
import { summarizeGroup } from '../evaluation/group-metrics';
import { createHash } from 'node:crypto';

type Vote={submission:string;assessment:string;intentType:string|null;action:string};
type Reference={id:string;block:string;family:string;sourceId:string|null;transform:string;assessment:string;expectedType:string|null;expectedAction:string|null;typeAgreement:boolean;actionAgreement:boolean;votes:Vote[]};
const read=(name:string)=>JSON.parse(readFileSync(resolve('tests/review',name),'utf8'));
const a=read('share/block-a.json'),b=read('share/block-b.json');
const pack=[...a.cases,...b.cases].sort((a,b)=>a.id.localeCompare(b.id)) as Array<{id:string;messages:Array<{speaker:string;text:string}>}>;
const reference=read('references.json');
const refs=new Map<string,Reference>(reference.cases.map((r:Reference)=>[r.id,r]));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
describe('AI-reviewed stress evaluation (research, not a zero-mismatch gate)',()=>{
  it('evaluates every conversation with isolated session state and exports all predictions',()=>{
    expect(hash([...a.cases,...b.cases].sort((a,b)=>a.id.localeCompare(b.id)))).toBe(reference.datasetSha256);
    expect(refs.size).toBe(600);
    const latencies:number[]=[];
    const cases=pack.map(c=>{
      const ref=refs.get(c.id)!;
      ChatSessionState.reset();
      let result:ReturnType<typeof ChatSessionState.addMessageAndEvaluate>|undefined;
      const trajectory:Array<{turn:number;detected:boolean;type:string|null;action:string}>=[];
      for(const [index,m] of c.messages.entries()){
        const start=performance.now();
        result=ChatSessionState.addMessageAndEvaluate(m.text,m.speaker==='interlocutor'?'inbound':'outbound');
        latencies.push(performance.now()-start);
        const type=result.hasFormedIntent ? result.intentType||null : null;
        trajectory.push({turn:index+1,detected:result.hasFormedIntent,type,action:getThreatMitigationAction(result.hasFormedIntent,type)});
        expect(Number.isFinite(result.confidence??0)).toBe(true);
      }
      const final=trajectory.at(-1)!;
      const scored=['threat','safe'].includes(ref.assessment);
      const exactScored=scored&&ref.typeAgreement&&ref.actionAgreement;
      return {...ref,actualDetected:final.detected,actualType:final.type,actualAction:final.action,confidence:result?.confidence??0,
        expectedDetected:ref.assessment==='threat',expectedType:ref.expectedType,expectedAction:ref.expectedAction??'ALLOW',
        scored,exactScored,exactMatch:exactScored&&final.detected===(ref.assessment==='threat')&&final.type===ref.expectedType&&final.action===ref.expectedAction,trajectory};
    });
    const summarize=(rows:typeof cases)=>{
      const base=summarizeGroup(rows.map(c=>({...c,assessment:c.scored?c.assessment:'ambiguous'})));
      const exact=rows.filter(c=>c.exactScored);
      return {...base,exactScoredCases:exact.length,exactMatches:exact.filter(c=>c.exactMatch).length,exactMatchRate:exact.length?exact.filter(c=>c.exactMatch).length/exact.length:null,
        disputedCases:rows.filter(c=>c.assessment==='disputed').length,
        agreedAmbiguousCases:rows.filter(c=>c.assessment==='ambiguous').length,
        uncertain:{n:rows.filter(c=>!c.scored).length,detected:rows.filter(c=>!c.scored&&c.actualDetected).length,locked:rows.filter(c=>!c.scored&&c.actualAction==='LOCK_INPUT').length},
        corpusSha256:hash({reference:reference.corpusSha256,ids:rows.map(c=>c.id)}),status:'ai-consensus-no-human-adjudication'};
    };
    const groups={reviewA:summarize(cases.filter(c=>c.block==='A')),reviewB:summarize(cases.filter(c=>c.block==='B'))};
    const reviewerMetrics=Object.fromEntries(Object.keys(reference.reviewers).map(name=>{
      const rows=cases.filter(c=>c.votes.some(v=>v.submission===name)).map(c=>{const v=c.votes.find(v=>v.submission===name)!;return {...c,assessment:v.assessment,expectedDetected:v.assessment==='threat',expectedType:v.intentType,expectedAction:v.action,exactMatch:c.actualDetected===(v.assessment==='threat')&&c.actualType===v.intentType&&c.actualAction===v.action};});
      return [name,summarizeGroup(rows)];
    }));
    const paired=cases.filter(c=>c.sourceId).map(c=>{const source=cases.find(s=>s.id===c.sourceId)!;return {id:c.id,sourceId:c.sourceId,transform:c.transform,binaryStable:c.actualDetected===source.actualDetected,typeStable:c.actualType===source.actualType,actionStable:c.actualAction===source.actualAction,
      threatLost:c.scored&&c.expectedDetected&&source.actualDetected&&!c.actualDetected,
      threatGained:c.scored&&c.expectedDetected&&!source.actualDetected&&c.actualDetected,
      falseAlarmAdded:c.scored&&!c.expectedDetected&&!source.actualDetected&&c.actualDetected,
      falseAlarmRemoved:c.scored&&!c.expectedDetected&&source.actualDetected&&!c.actualDetected};});
    const pairedByTransform=Object.fromEntries([...new Set(paired.map(c=>c.transform))].map(kind=>{const rows=paired.filter(c=>c.transform===kind);return [kind,{n:rows.length,binaryChanged:rows.filter(c=>!c.binaryStable).length,typeChanged:rows.filter(c=>!c.typeStable).length,actionChanged:rows.filter(c=>!c.actionStable).length,
      threatLost:rows.filter(c=>c.threatLost).length,threatGained:rows.filter(c=>c.threatGained).length,falseAlarmAdded:rows.filter(c=>c.falseAlarmAdded).length,falseAlarmRemoved:rows.filter(c=>c.falseAlarmRemoved).length}];}));
    const prematureLocks=cases.filter(c=>c.trajectory.some(t=>t.turn<=8&&t.action==='LOCK_INPUT')).map(c=>c.id);
    latencies.sort((a,b)=>a-b);
    const report={schemaVersion:1,generatedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA??'local',datasetId:reference.datasetId,datasetSha256:reference.datasetSha256,referenceSha256:reference.corpusSha256,groups,reviewerMetrics,pairedByTransform,prematureLocks,
      timing:{environment:'Node CPU, local heuristics only; not browser latency or extension peak RAM',messages:latencies.length,medianMs:latencies[Math.floor(latencies.length/2)],p95Ms:latencies[Math.floor(latencies.length*.95)],maxMs:latencies.at(-1)},cases};
    expect(cases).toHaveLength(600);
    expect(paired).toHaveLength(300);
    ChatSessionState.reset();
    const destination=process.env.SOVA_REVIEW_REPORT;
    if(destination){mkdirSync(dirname(resolve(destination)),{recursive:true});writeFileSync(destination,JSON.stringify(report,null,2)+'\n');}
    console.info('[review stress] '+JSON.stringify({groups,pairedByTransform,timing:report.timing}));
  },30_000);
});
