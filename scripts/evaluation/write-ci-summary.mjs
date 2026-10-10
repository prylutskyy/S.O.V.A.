import { readFileSync, appendFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const percent = n => n == null ? '—' : `${(n * 100).toFixed(1)}%`;
const rows = Object.entries({ ...report.groups, ...(report.combined ? { combined: report.combined } : {}) }).map(([name, g]) =>
  `| ${name} | ${g.totalCases} | ${g.scoredCases} | ${percent(g.overall.precision)} | ${percent(g.overall.recall)} | ${percent(g.overall.f1)} | ${percent(g.exactMatchRate)} | ${g.falseLockInputs} |`
).join('\n');
let text = `## Два корпуси: відповідність та дослідження

| Корпус | Діалоги | В оцінці | Precision | Recall | F1 | Точний збіг | Хибні блокування |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

Regression: відомі 326 прикладів після налаштування правил, суворий gate CI. Challenge: 300 нових синтетичних діалогів, 200 визначених + 100 неоднозначних; розмітка очікує незалежного аудиту. Пропуски challenge — результат вимірювання, не автоматичне падіння CI. Технічні помилки та некоректний корпус залишають CI червоним. Зелений статус не доводить реальну точність. Groq не викликався.
`;
try {
  const privacy = JSON.parse(readFileSync('tests/results/groq-privacy-smoke.json', 'utf8'));
  if (!privacy.inProgress) text += `\n### Останній ручний Groq privacy-smoke (не цей CI)\n\n${privacy.generatedAt}: ${privacy.completed}/${privacy.plannedRequests} відповідей, ${privacy.boundaryChecks} перевірених outbound-запитів, ${privacy.exactMatches}/${privacy.completed} точних класів, ${privacy.totalTokens} токенів. Синтетичні дані; підтримані формати, не універсальна гарантія приватності. Живі API-запити в цьому workflow не виконуються.\n`;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
else console.info(text);
