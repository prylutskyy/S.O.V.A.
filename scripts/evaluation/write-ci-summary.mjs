import { readFileSync, appendFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const percent = n => n == null ? '—' : `${(n * 100).toFixed(1)}%`;
const rows = Object.entries(report.groups ?? {}).map(([name, g]) =>
  `| ${name} | ${g.totalCases} | ${g.scoredCases} | ${percent(g.overall.precision)} | ${percent(g.overall.recall)} | ${percent(g.overall.f1)} | ${percent(g.exactMatchRate)} | ${g.falseLockInputs} |`
).join('\n');
const text = `## Два корпуси: відповідність та дослідження

| Корпус | Діалоги | В оцінці | Precision | Recall | F1 | Точний збіг | Хибні блокування |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

Regression: відомі 326 прикладів після налаштування правил, суворий gate CI. Challenge: 300 нових синтетичних діалогів, 200 визначених + 100 неоднозначних; розмітка очікує незалежного аудиту. Пропуски challenge — результат вимірювання, не автоматичне падіння CI. Технічні помилки та некоректний корпус залишають CI червоним. Зелений статус не доводить реальну точність. Groq не викликався.
`;
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
else console.info(text);
