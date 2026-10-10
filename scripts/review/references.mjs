import { createHash } from 'node:crypto';
import { importReviews } from './state.mjs';
export const reviewHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function buildReferences(pack, submissions, relations) {
  if (reviewHash(pack.cases) !== pack.datasetSha256) throw new Error('Blind text hash mismatch');
  const files = Object.keys(submissions).sort();
  const validated = {};
  for (const name of files) {
    const submission = submissions[name];
    if (submission.drafts?.length) throw new Error('Reviewer submissions must contain completed answers only');
    validated[name] = importReviews(submission,pack);
    const block = name.includes('block-a') ? 'A' : 'B';
    const ids = pack.cases.filter(c=>c.block===block).map(c=>c.id).sort();
    if (JSON.stringify(Object.keys(validated[name]).sort()) !== JSON.stringify(ids)) throw new Error('Incomplete or wrong block: '+name);
  }
  const cases = pack.cases.map(c=>{
    const names = files.filter(name=>name.includes('block-'+c.block.toLowerCase()));
    if(names.length!==2) throw new Error('Exactly two reviews per block required');
    const votes = names.map(name=>({submission:name,...validated[name][c.id]}));
    const assessmentAgreement = votes[0].assessment===votes[1].assessment;
    const typeAgreement = votes[0].intentType===votes[1].intentType;
    const actionAgreement = votes[0].action===votes[1].action;
    return {id:c.id,block:c.block,family:relations[c.id].family,sourceId:relations[c.id].sourceId,transform:relations[c.id].transform,
      assessmentAgreement,typeAgreement,actionAgreement,
      assessment:assessmentAgreement ? votes[0].assessment : 'disputed',
      expectedType:typeAgreement ? votes[0].intentType : null,
      expectedAction:actionAgreement ? votes[0].action : null,votes};
  });
  const reviewSha256=reviewHash(Object.fromEntries(files.map(name=>[name,submissions[name]])));
  return {schemaVersion:1,datasetId:pack.datasetId,datasetSha256:pack.datasetSha256,reviewSha256,
    corpusSha256:reviewHash({datasetSha256:pack.datasetSha256,reviewSha256}),
    policy:'Only agreed threat/safe assessments enter consensus binary metrics. Type/action disagreements are excluded from exact classification. Uncertain labels are not SAFE. AI consensus is provisional, no human adjudication.',
    reviewers:Object.fromEntries(files.map(name=>[name,submissions[name].reviewer])),cases};
}
