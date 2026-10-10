import { readFileSync,writeFileSync } from 'node:fs';
const [mainPath='metrics/evaluation.json',reviewPath='metrics/review-evaluation.json']=process.argv.slice(2);
const main=JSON.parse(readFileSync(mainPath,'utf8'));
const review=JSON.parse(readFileSync(reviewPath,'utf8'));
if(review.cases?.length!==600 || review.commit!==main.commit) throw new Error('Incomplete or incompatible review evaluation');
main.reviewEvaluation=review;
main.groups={...main.groups,...review.groups};
writeFileSync(mainPath,JSON.stringify(main,null,2)+'\n');
console.log('Appended two separate AI-reviewed stress groups; legacy combined metrics keep their original scope.');
