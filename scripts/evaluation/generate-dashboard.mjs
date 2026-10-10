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
const percent = (value) => typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
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
    ['Precision', 'precision', 'var(--precision)', ''],
    ['Recall', 'recall', 'var(--recall)', '8 4'],
    ['F1', 'f1', 'var(--f1)', '3 3'],
    ['Точний збіг', 'exactMatchRate', 'var(--exact)', '10 3 2 3'],
  ];
  const metricValue = (entry, key) => {
    const value = key === 'exactMatchRate' ? entry[key] : entry.overall?.[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  };
  const x = (index) => pad.left + (data.length < 2 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
  const y = (value) => pad.top + (1 - Math.max(0, Math.min(1, Number(value ?? 0)))) * plotHeight;
  const grid = [0, 25, 50, 75, 100].map((tick) => {
    const yy = y(tick / 100);
    return `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="var(--line)"/><text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end" fill="var(--muted)" font-size="12">${tick}%</text>`;
  }).join('');
  const lines = series.map(([label, key, color, dash]) => {
    const segments = [];
    let segment = [];
    const dots = data.map((entry, index) => {
      const value = metricValue(entry, key);
      if (value === null) {
        if (segment.length) segments.push(segment);
        segment = [];
        return '';
      }
      if (index > 0 && entry.corpusSha256 !== data[index - 1].corpusSha256) {
        if (segment.length) segments.push(segment);
        segment = [];
      }
      segment.push(`${x(index)},${y(value)}`);
      return `<circle cx="${x(index)}" cy="${y(value)}" r="3" fill="${color}"><title>${escapeHtml(entry.generatedAt)} · ${escapeHtml(label)} ${percent(value)} · ${escapeHtml(shortSha(entry.commit))}</title></circle>`;
    }).join('');
    if (segment.length) segments.push(segment);
    const paths = segments.map((points) => `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${dash}"/>`).join('');
    return `<g data-series="${key}">${paths}${dots}</g>`;
  }).join('');
  const labelStride = Math.max(1, Math.ceil((data.length - 1) / 7));
  const labels = data.map((entry, index) => {
    if (index % labelStride !== 0 && index !== data.length - 1) return '';
    // Avoid crowding the final label with the preceding sampled label.
    if (index !== data.length - 1 && index > 0 && data.length - 1 - index < labelStride) return '';
    const date = new Date(entry.generatedAt).toISOString().slice(0, 10);
    return `<g data-axis-label="${index}"><text x="${x(index)}" y="${height - 38}" text-anchor="middle" fill="var(--muted)" font-size="10">${escapeHtml(date)}</text><text x="${x(index)}" y="${height - 20}" text-anchor="middle" fill="var(--muted)" font-size="10">${escapeHtml(shortSha(entry.commit))}</text></g>`;
  }).join('');
  const legend = series.map(([label, , color, dash]) => `<span><svg width="28" height="12" aria-hidden="true"><line x1="0" y1="6" x2="28" y2="6" stroke="${color}" stroke-width="3" stroke-dasharray="${dash}"/></svg>${escapeHtml(label)}</span>`).join('');
  return `<div class="chart-legend">${legend}</div><div class="chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Історія метрик корпусу за комітами" style="width:100%;min-width:640px;height:auto">${grid}${lines}${labels}</svg></div>`;
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
const regression = report.groups?.regression ?? report;
const challenge = report.groups?.challenge;
const combined = report.combined;
let privacy;
try {
  const snapshot = JSON.parse(readFileSync(resolve('tests/results/groq-privacy-smoke.json'), 'utf8'));
  if (!snapshot.inProgress) privacy = snapshot;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const privacySection = privacy ? `<section class="panel" id="privacy"><h2>Анонімізація перед Groq · останній ручний smoke-прогін</h2><p>Дата: ${escapeHtml(privacy.generatedAt)} · ${escapeHtml(privacy.model)}. Це збережений ручний запуск, не live-перевірка поточного CI.</p><div class="cards"><div class="card">Preflight<strong>${privacy.preflightPassed}/${privacy.plannedRequests}</strong></div><div class="card">Перевірені відправки<strong>${privacy.boundaryChecks}</strong></div><div class="card">Відповіді<strong>${privacy.completed}/${privacy.plannedRequests}</strong></div><div class="card">Точні класи<strong>${privacy.exactMatches}/${privacy.completed}</strong></div><div class="card">Токени<strong>${privacy.totalTokens}</strong></div></div><p>Синтетичні значення; перевірка лише підтриманих форматів. Немає raw-контролю, тому не доведено незмінність якості після анонімізації. Звичайний CI не звертається до Groq. Цей результат не включено до локального зведеного F1.</p><p><a href="groq-privacy-smoke.json">JSON цього ручного прогону</a> · <a href="https://github.com/${escapeHtml(process.env.GITHUB_REPOSITORY ?? 'prylutskyy/S.O.V.A.')}/blob/main/tests/results/GROQ_PRIVACY_SMOKE_REPORT.md">Методика, розбіжність і межі</a></p></section>` : '';

function cards(group) {
  if (!group) return '<p>Ще не виміряно. Відсутність прогону не дорівнює 0%.</p>';
  return `<div class="cards"><div class="card">Діалоги<strong>${group.totalCases}</strong></div><div class="card">У binary-оцінці<strong>${group.scoredCases ?? group.totalCases}</strong></div><div class="card">Precision<strong>${percent(group.overall?.precision)}</strong></div><div class="card">Recall<strong>${percent(group.overall?.recall)}</strong></div><div class="card">F1<strong>${percent(group.overall?.f1)}</strong></div><div class="card">Точний збіг<strong>${percent(group.exactMatchRate)}</strong></div><div class="card">Хибні блокування<strong>${group.falseLockInputs ?? 0}</strong></div></div>`;
}
const challengeRecords = records.map(r => ({ ...r, overall: r.groups?.challenge?.overall ?? {}, exactMatchRate: r.groups?.challenge?.exactMatchRate, corpusSha256: r.groups?.challenge?.corpusSha256 }));
const caseRows = (report.cases ?? []).filter(c => c.corpus === 'challenge-v1').map(c =>
  `<tr><td><code>${escapeHtml(c.id)}</code></td><td>${escapeHtml(c.assessment)}</td><td>${escapeHtml(c.expectedType ?? '—')}</td><td>${escapeHtml(c.actualType ?? '—')}</td><td>${escapeHtml(c.actualAction)}</td><td>${c.assessment === 'ambiguous' ? 'Уточнити / не оцінюється як SAFE' : c.exactMatch ? 'Збіг' : 'Розбіжність'}</td></tr>`
).join('');
const html = `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Відкрита історія локальної оцінки детектора загроз С.О.В.А."><title>С.О.В.А. — регресії та нові діалоги</title><style>
:root{color-scheme:light;--ink:#172033;--muted:#536174;--line:#dbe2ea;--panel:#fff;--bg:#f3f6fa;--accent:#174ea6}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1120px;margin:0 auto;padding:32px 20px 64px}h1{margin:.2em 0}h2{margin-top:1.8em}.muted,small{color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;margin:18px 0;overflow:auto}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.card{border:1px solid var(--line);border-radius:10px;padding:14px}.card strong{display:block;font-size:1.55rem}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line);white-space:nowrap}thead th{background:#fff;color:#172033;border-bottom:2px solid #94a3b8;font-weight:700}a{color:var(--accent)}.note{border-left:4px solid #d97706;padding:10px 14px;background:#fff7ed}.footer{margin-top:32px;font-size:.9rem}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--ink:#e6edf5;--muted:#a7b3c2;--line:#354154;--panel:#182233;--bg:#0d1420;--accent:#8ab4f8}.note{background:#332512}}
:root{--precision:#2563eb;--recall:#15803d;--f1:#dc2626;--exact:#9333ea}.chart-legend{display:flex;flex-wrap:wrap;gap:12px 24px;margin:12px 0;color:var(--ink);font-size:.9rem}.chart-legend span{display:flex;align-items:center;gap:8px}.chart-scroll{overflow-x:auto}@media(prefers-color-scheme:dark){:root{--precision:#60a5fa;--recall:#4ade80;--f1:#f87171;--exact:#c084fc}}
</style></head><body><main>
<p><a href="https://github.com/${escapeHtml(process.env.GITHUB_REPOSITORY ?? 'prylutskyy/S.O.V.A.')}">← Репозиторій С.О.В.А.</a></p>
<h1>Перевірки С.О.В.А.: два окремі корпуси</h1><p class="muted">Автоматичний звіт локального класифікатора сценаріїв. Останнє оновлення: ${escapeHtml(latestDate)} · commit <code>${escapeHtml(shortSha(report.commit))}</code>.</p>
<section class="panel" id="combined"><h2>Зведений результат двох локальних корпусів</h2>${cards(combined)}<p>Це сума TP/FP/FN/TN визначених сценаріїв обох блоків (526), а не середнє двох F1. 100 неоднозначних діалогів виключено. Відомий набір підвищує цей результат: він не є незалежною оцінкою якості. Groq та privacy-smoke не входять до цього показника.</p></section>
<p class="note"><strong>Що означає відсоток?</strong> Це збіг із розміткою конкретного синтетичного набору, а не ймовірність захисту у реальному чаті. Precision — частка розмічених загроз серед спрацьовувань; recall — частка виявлених розмічених загроз; F1 — їх гармонійне середнє. Точний збіг також вимагає правильного типу та дії. 100% на знайомому корпусі після підлаштування правил не доводить узагальнення. Тут вимірюються локальні правила та політика дії, без Groq і без браузерного DOM.</p>
<section class="panel" id="regression"><h2>Відомий корпус · регресійна відповідність</h2><p>326 сценаріїв development/regressions/історичного holdout використовувалися для вдосконалення правил. CI суворо перевіряє всі очікування; зелений статус означає відсутність перевірених регресій.</p>${cards(regression)}<p class="muted">SHA-256: <code>${escapeHtml(regression.corpusSha256)}</code></p><h3>Історія відомого корпусу</h3>${chart(records)}</section>
<section class="panel" id="challenge"><h2>Новий корпус · поступове входження в довіру</h2><p>300 діалогів: 120 загрозливих, 80 безпечних, 100 неоднозначних. У binary Precision/Recall/F1 і точному збігу оцінюються лише 200 визначених випадків. 20 споріднених контрастних сімейств, синтетичні тексти та розмітка створені ШІ; незалежного аудиту ще немає. Це нова дослідницька перевірка, не незалежний доказ реальної якості.</p>${cards(challenge)}<p>Неоднозначні: ${challenge?.ambiguous?.n ?? '—'}; локальні спрацьовування: ${challenge?.ambiguous?.detected ?? '—'}; блокування: ${challenge?.ambiguous?.locked ?? '—'}. Відсутність тривоги тут не означає SAFE. Передавання таких випадків до ШІ не вимірюється цим прогоном.</p><p class="muted">SHA-256: <code>${escapeHtml(challenge?.corpusSha256 ?? 'ще не виміряно')}</code>. Розбіжності визначених сценаріїв — дослідницький результат, не помилка виконання CI.</p><h3>Історія нового корпусу</h3><p>До першого прогону немає значень; лінія переривається при зміні SHA корпусу. Зелений CI не означає, що новий корпус розпізнано на 100%.</p>${chart(challengeRecords)}</section>
<section class="panel"><h2>Binary-результати за частинами корпусу</h2><p>Для challenge-v1 N = 200: неоднозначні діалоги виключено.</p><div class="table-wrap"><table><thead><tr><th>Набір</th><th>N</th><th>TP</th><th>FP</th><th>FN</th><th>TN</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>${overviewRows}</tbody></table></div></section>
<section class="panel"><h2>Класи відомого регресійного корпусу</h2><p class="muted">One-vs-rest: кожен клас оцінюється проти всіх інших класів і безпечних прикладів.</p><div class="table-wrap"><table><thead><tr><th>Клас</th><th>N</th><th>TP</th><th>FP</th><th>FN</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>${classRows}</tbody></table></div></section>
<section class="panel"><h2>Невідповідності останнього прогону</h2><p>${(report.mismatches ?? []).length} сценаріїв не збіглися повністю; показано не більше 100. Тексти повідомлень у звіт не записуються.</p><div class="table-wrap"><table><thead><tr><th>ID</th><th>Набір</th><th>Очікуваний клас</th><th>Фактичний клас</th><th>Очікувана дія</th><th>Фактична дія</th></tr></thead><tbody>${mismatchRows || '<tr><td colspan="6">Невідповідностей немає.</td></tr>'}</tbody></table></div></section>
<section class="panel"><h2>Усі 300 нових сценаріїв</h2><p>Очікування визначено до першого прогону; неоднозначні діалоги не мають підтвердженого класу. <a href="evaluation.json">Завантажити повний звіт із прогнозами обох корпусів</a>. Історія зберігає агрегати, цей файл — останні детальні результати.</p><div class="table-wrap"><table><thead><tr><th>ID</th><th>Розмітка</th><th>Очікуваний тип</th><th>Локальний тип</th><th>Дія</th><th>Результат</th></tr></thead><tbody>${caseRows || '<tr><td colspan="6">Ще не виміряно.</td></tr>'}</tbody></table></div></section>${privacySection}<p class="footer muted">SHA-256 корпусу: <code>${escapeHtml(report.corpusSha256)}</code>. Для відтворення див. <a href="https://github.com/${escapeHtml(process.env.GITHUB_REPOSITORY ?? 'prylutskyy/S.O.V.A.')}/tree/main/tests/evaluation">інструкції оцінювання</a>. Звіти не містять текстів тестових повідомлень.</p>
</main></body></html>`;

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, 'index.html'), html);
if (privacy) writeFileSync(resolve(outputDirectory, 'groq-privacy-smoke.json'), JSON.stringify(privacy, null, 2) + '\n');
writeFileSync(resolve(outputDirectory, 'evaluation.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(resolve(outputDirectory, 'history.json'), `${JSON.stringify(records, null, 2)}\n`);
mkdirSync(resolve(outputDirectory, 'badges'), { recursive: true });
writeFileSync(resolve(outputDirectory, 'badges/f1.svg'), badge('reg F1', percent(report.overall.f1), '#dc2626'));
writeFileSync(resolve(outputDirectory, 'badges/recall.svg'), badge('reg recall', percent(report.overall.recall), '#16a34a'));
console.info(`Dashboard generated at ${outputDirectory} with ${records.length} history points.`);

writeFileSync(resolve(outputDirectory, 'badges/challenge-f1.svg'), badge('new F1', percent(challenge?.overall?.f1), '#a16207'));
writeFileSync(resolve(outputDirectory, 'badges/challenge-recall.svg'), badge('new recall', percent(challenge?.overall?.recall), '#a16207'));

writeFileSync(resolve(outputDirectory, 'badges/combined-f1.svg'), badge('all F1', percent(combined?.overall?.f1), '#2563eb'));
writeFileSync(resolve(outputDirectory, 'badges/combined-recall.svg'), badge('all recall', percent(combined?.overall?.recall), '#2563eb'));
