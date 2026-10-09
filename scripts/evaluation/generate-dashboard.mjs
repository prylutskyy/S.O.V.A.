import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
  if (item.startsWith('--')) pairs.push([item.slice(2), all[index + 1]]);
  return pairs;
}, []));
const reportPath = resolve(args.report ?? 'metrics/evaluation.json');
const historyPath = resolve(args.history ?? 'metrics/history.json');
const outputDirectory = resolve(args.out ?? 'site');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
let history = [];
try {
  history = JSON.parse(readFileSync(historyPath, 'utf8'));
} catch {
  // A first run starts a new history.
}
if (!Array.isArray(history)) throw new Error('Evaluation history must be a JSON array.');
const records = [...history.filter((record) => record.commit !== report.commit), report]
  .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const percent = (value) => `${(Number(value ?? 0) * 100).toFixed(1)}%`;
const shortSha = (value) => value === 'local' ? 'local' : String(value ?? '').slice(0, 7);
const latestDate = new Date(report.generatedAt).toLocaleString('uk-UA', { timeZone: 'UTC' }) + ' UTC';

function badge(label, value, color) {
  const width = 188;
  const labelWidth = 80;
  const valueText = escapeHtml(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeHtml(label)}: ${valueText}"><title>${escapeHtml(label)}: ${valueText}</title><linearGradient id="b" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><path fill="#555" d="M0 0h${labelWidth}v20H0z"/><path fill="${color}" d="M${labelWidth} 0h${width - labelWidth}v20H${labelWidth}z"/><path fill="url(#b)" d="M0 0h${width}v20H0z"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11"><text x="${labelWidth / 2}" y="14">${escapeHtml(label)}</text><text x="${labelWidth + (width - labelWidth) / 2}" y="14">${valueText}</text></g></svg>`;
}

function chart(data) {
  const width = 900;
  const height = 330;
  const pad = { left: 56, right: 24, top: 30, bottom: 62 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const series = [
    ['Precision', 'precision', '#2563eb'],
    ['Recall', 'recall', '#16a34a'],
    ['F1', 'f1', '#dc2626'],
    ['Exact match', 'exactMatchRate', '#9333ea'],
  ];
  const x = (index) => pad.left + (data.length < 2 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
  const y = (value) => pad.top + (1 - Math.max(0, Math.min(1, Number(value ?? 0)))) * plotHeight;
  const grid = [0, 25, 50, 75, 100].map((tick) => {
    const yy = y(tick / 100);
    return `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="#d1d5db"/><text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end" fill="#4b5563" font-size="12">${tick}%</text>`;
  }).join('');
  const lines = series.map(([label, key, color]) => {
    const points = data.map((entry, index) => `${x(index)},${y(entry[key])}`).join(' ');
    const dots = data.map((entry, index) => `<circle cx="${x(index)}" cy="${y(entry[key])}" r="3" fill="${color}"><title>${escapeHtml(entry.generatedAt)} · ${escapeHtml(label)} ${percent(entry[key])} · ${shortSha(entry.commit)}</title></circle>`).join('');
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}`;
  }).join('');
  const labels = data.map((entry, index) => {
    const date = new Date(entry.generatedAt).toISOString().slice(0, 10);
    return `<text x="${x(index)}" y="${height - 38}" text-anchor="middle" fill="#4b5563" font-size="10">${escapeHtml(date)}</text><text x="${x(index)}" y="${height - 20}" text-anchor="middle" fill="#6b7280" font-size="10">${escapeHtml(shortSha(entry.commit))}</text>`;
  }).join('');
  const legend = series.map(([label, , color], index) => `<g transform="translate(${pad.left + index * 175},12)"><line x1="0" y1="0" x2="20" y2="0" stroke="${color}" stroke-width="3"/><text x="27" y="4" fill="#374151" font-size="12">${label}</text></g>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Історія метрик корпусу за комітами" style="width:100%;height:auto">${legend}${grid}${lines}${labels}</svg>`;
}

const overviewRows = Object.entries(report.byCorpus ?? {}).map(([name, metric]) =>
  `<tr><th scope="row">${escapeHtml(name)}</th><td>${metric.n}</td><td>${metric.tp}</td><td>${metric.fp}</td><td>${metric.fn}</td><td>${metric.tn}</td><td>${percent(metric.precision)}</td><td>${percent(metric.recall)}</td><td>${percent(metric.f1)}</td></tr>`
).join('');
const classRows = Object.entries(report.byIntentType ?? {}).map(([name, metric]) =>
  `<tr><th scope="row">${escapeHtml(name)}</th><td>${metric.n}</td><td>${metric.tp}</td><td>${metric.fp}</td><td>${metric.fn}</td><td>${percent(metric.precision)}</td><td>${percent(metric.recall)}</td><td>${percent(metric.f1)}</td></tr>`
).join('');
const mismatchRows = (report.mismatches ?? []).slice(0, 100).map((item) =>
  `<tr><td><code>${escapeHtml(item.id)}</code></td><td>${escapeHtml(item.corpus)}</td><td>${escapeHtml(item.expectedType ?? '—')}</td><td>${escapeHtml(item.actualType ?? '—')}</td><td>${escapeHtml(item.expectedAction)}</td><td>${escapeHtml(item.actualAction)}</td></tr>`
).join('');
const html = `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Відкрита історія локальної оцінки детектора загроз С.О.В.А."><title>С.О.В.А. — ефективність детектора</title><style>
:root{color-scheme:light;--ink:#172033;--muted:#536174;--line:#dbe2ea;--panel:#fff;--bg:#f3f6fa;--accent:#174ea6}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1120px;margin:0 auto;padding:32px 20px 64px}h1{margin:.2em 0}h2{margin-top:1.8em}.muted,small{color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;margin:18px 0;overflow:auto}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.card{border:1px solid var(--line);border-radius:10px;padding:14px}.card strong{display:block;font-size:1.55rem}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line);white-space:nowrap}thead th{background:#eef2f7}a{color:var(--accent)}.note{border-left:4px solid #d97706;padding:10px 14px;background:#fff7ed}.footer{margin-top:32px;font-size:.9rem}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--ink:#e6edf5;--muted:#a7b3c2;--line:#354154;--panel:#182233;--bg:#0d1420;--accent:#8ab4f8}.note{background:#332512}}
</style></head><body><main>
<p><a href="https://github.com/${escapeHtml(process.env.GITHUB_REPOSITORY ?? 'prylutskyy/S.O.V.A.')}">← Репозиторій С.О.В.А.</a></p>
<h1>Оцінка ефективності детектора</h1><p class="muted">Автоматичний звіт локального класифікатора сценаріїв. Останнє оновлення: ${escapeHtml(latestDate)} · commit <code>${escapeHtml(shortSha(report.commit))}</code>.</p>
<div class="cards"><div class="card">Сценарії<strong>${report.totalCases}</strong></div><div class="card">Precision<strong>${percent(report.overall.precision)}</strong></div><div class="card">Recall<strong>${percent(report.overall.recall)}</strong></div><div class="card">F1<strong>${percent(report.overall.f1)}</strong></div><div class="card">Точний збіг<strong>${percent(report.exactMatchRate)}</strong></div><div class="card">Хибні блокування вводу<strong>${report.falseLockInputs ?? 0}</strong></div></div>
<p class="note"><strong>Як читати:</strong> precision/recall/F1 тут оцінюють бінарне виявлення загрози. «Точний збіг» додатково вимагає правильної категорії та дії. Результати вимірюють лише версійований синтетичний корпус, а не реальні чати. Порівнюйте точки з однаковим SHA-256 корпусу; зміна корпусу може змінити складність оцінки.</p>
<section class="panel"><h2>Історія змін</h2><p class="muted">Значення за кожним commit. Зміни складу корпусу позначені в таблиці нижче.</p>${chart(records)}</section>
<section class="panel"><h2>Результати за частинами корпусу</h2><div class="table-wrap"><table><thead><tr><th>Набір</th><th>N</th><th>TP</th><th>FP</th><th>FN</th><th>TN</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>${overviewRows}</tbody></table></div></section>
<section class="panel"><h2>Результати за класами</h2><p class="muted">One-vs-rest: кожен клас оцінюється проти всіх інших класів і безпечних прикладів.</p><div class="table-wrap"><table><thead><tr><th>Клас</th><th>N</th><th>TP</th><th>FP</th><th>FN</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>${classRows}</tbody></table></div></section>
<section class="panel"><h2>Невідповідності останнього прогону</h2><p>${(report.mismatches ?? []).length} сценаріїв не збіглися повністю; показано не більше 100. Тексти повідомлень у звіт не записуються.</p><div class="table-wrap"><table><thead><tr><th>ID</th><th>Набір</th><th>Очікуваний клас</th><th>Фактичний клас</th><th>Очікувана дія</th><th>Фактична дія</th></tr></thead><tbody>${mismatchRows || '<tr><td colspan="6">Невідповідностей немає.</td></tr>'}</tbody></table></div></section>
<p class="footer muted">SHA-256 корпусу: <code>${escapeHtml(report.corpusSha256)}</code>. Для відтворення див. <a href="https://github.com/${escapeHtml(process.env.GITHUB_REPOSITORY ?? 'prylutskyy/S.O.V.A.')}/tree/main/tests/evaluation">інструкції оцінювання</a>. Звіти не містять текстів тестових повідомлень.</p>
</main></body></html>`;

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, 'index.html'), html);
writeFileSync(resolve(outputDirectory, 'history.json'), `${JSON.stringify(records, null, 2)}\n`);
mkdirSync(resolve(outputDirectory, 'badges'), { recursive: true });
writeFileSync(resolve(outputDirectory, 'badges/f1.svg'), badge('eval F1', percent(report.overall.f1), '#dc2626'));
writeFileSync(resolve(outputDirectory, 'badges/recall.svg'), badge('eval recall', percent(report.overall.recall), '#16a34a'));
console.info(`Dashboard generated at ${outputDirectory} with ${records.length} history points.`);
