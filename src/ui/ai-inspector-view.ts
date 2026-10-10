import type { AICheck } from './ai-check-history';

export const escapeDiagnosticText = (value: unknown): string => String(value ?? '')
  .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export const checkLabel = (check: AICheck): string => check.source === 'cache' ? 'З кешу'
  : check.source === 'session-quarantine' ? 'Карантин розмови'
  : ({ pending: 'Очікування відповіді', completed: 'Завершено', cancelled: 'Скасовано',
    timeout: 'Час очікування вичерпано', error: 'Помилка' })[check.status];
const intentNames: Record<string, string> = {
  IDENTITY_PROBING: 'Запит персональних даних', PAYMENT_CREDENTIAL_THEFT: 'Платіжні реквізити',
  ESCROW_DELIVERY_SCAM: 'Підроблена оплата або доставка', OFF_PLATFORM_REDIRECT: 'Перехід за межі платформи',
  VERIFICATION_PHISHING: 'Фішинг під виглядом перевірки', URGENCY_PRESSURE: 'Тиск і терміновість',
  MILITARY_SABOTAGE_RECRUITMENT: 'Вербування або диверсія', CRYPTO_WALLET_COMPROMISE: 'Компрометація криптогаманця',
  SEED_PHRASE_THEFT: 'Виманювання seed-фрази', SUSPICIOUS_LURE: 'Підозріла пропозиція',
};
const intent = (value?: string) => !value || value === 'UNKNOWN' ? 'Тип не визначено' : (intentNames[value] || value);
const time = (value: number) => new Date(value).toLocaleTimeString();
const code = (value: unknown) => `<pre class="sc-inspector-code">${escapeDiagnosticText(value)}</pre>`;
const copy = (value: string) => `<button type="button" class="sc-btn-ghost" data-copy="${escapeDiagnosticText(encodeURIComponent(value))}">Копіювати</button>`;

export function liveToolbar(paused: boolean): string {
  return `<div class="sc-review-toolbar">
    <span class="sc-live-state">${paused ? 'Перегляд призупинено' : '● Наживо'}</span>
    <button type="button" class="sc-btn-ghost" id="btn-review-pause">${paused ? 'Відновити перегляд' : 'Призупинити перегляд'}</button>
    <button type="button" class="sc-btn-ghost sc-update-button" id="sc-new-updates" aria-live="polite"></button>
  </div><p class="sc-review-note">${paused ? 'Зафіксовано знімок даних. Аналіз і захист продовжують працювати.' : 'Оновлюється автоматично.'}</p>`;
}

export function renderAIInspector(options: {
  checks: AICheck[]; allChecks: AICheck[]; selectedId: string | null; paused: boolean;
  scope: 'current' | 'all'; sessionId: string | null; openSections: Set<string>;
  protection: { action: string; source: string; score: number } | null;
}): string {
  const { checks, selectedId, openSections, sessionId, protection } = options;
  const check = checks.find(item => item.id === selectedId) || checks.at(-1);
  const section = (key: string, title: string, content: string) => `<details class="sc-inspector-section"
    data-ai-section="${check!.id}-${key}" ${openSections.has(`${check!.id}-${key}`) ? 'open' : ''}>
    <summary>${title}</summary><div class="sc-inspector-section-body">${content}</div></details>`;
  const scopeControl = `<div class="sc-ai-scope"><label for="sc-ai-scope">Розмови</label>
    <select id="sc-ai-scope"><option value="current" ${options.scope === 'current' ? 'selected' : ''}>Поточна розмова</option>
    <option value="all" ${options.scope === 'all' ? 'selected' : ''}>Усі розмови цієї сторінки</option></select></div>`;
  if (!check) return `${liveToolbar(options.paused)}${scopeControl}<div class="sc-card sc-empty-state">
    <div class="sc-empty-title">Перевірок ШІ ще немає</div>
    <div class="sc-empty-sub">Тут з’явиться результат, коли система звернеться до ШІ. Локальний захист може працювати без такого звернення.</div></div>`;
  const result = check.result;
  const original = check.originalCheckId ? options.allChecks.find(item => item.id === check.originalCheckId) : undefined;
  const evidence = original || check;
  const newer = checks.filter(item => item.number > check.number).length;
  const isPinned = !!selectedId && checks.some(item => item.id === selectedId);
  const verdict = result ? (check.source === 'session-quarantine' ? 'Застосовано карантин розмови'
    : result.isScam ? intent(result.scamType) : 'Модель не виявила загрози') : checkLabel(check);
  const tone = check.status === 'pending' ? 'blue' : check.status === 'error' ? 'red'
    : check.status === 'timeout' ? 'amber' : 'neutral';
  let evidenceBody = `<h4>Повідомлення для перевірки</h4>${code(evidence.text || 'Повідомлення не записано.')}`;
  if (evidence.dialogue) evidenceBody += `<h4>Використаний контекст розмови</h4>${code(evidence.dialogue)}`;
  if (evidence.intent) evidenceBody += `<p>Локальний тип: ${escapeDiagnosticText(intent(evidence.intent))}</p>`;
  if (evidence.flags?.length) evidenceBody += `<ul>${evidence.flags.map(flag => `<li>${escapeDiagnosticText(flag)}</li>`).join('')}</ul>`;
  evidenceBody += `<p>Прихованих чутливих фрагментів: ${evidence.redactedCount ?? 'не записано'}.</p>`;
  const messages = result?.requestMessages;
  const requestBody = messages?.length
    ? `${check.source === 'cache' ? '<p>Запит первинної перевірки. При зверненні до кешу нового запиту до моделі не було.</p>' : '<p>Збережені текстові повідомлення, передані провайдеру. Ключі доступу не включаються.</p>'}
      ${messages.map(message => `<h4>${escapeDiagnosticText(message.role)}</h4>${copy(message.content)}${code(message.content)}`).join('')}`
    : `<p>Фактичний запит провайдера не записано${check.status === 'pending' ? ': перевірка ще триває' : ''}.</p>
      ${evidence.preparedPrompt ? `<h4>Підготовлений запит диспетчеру</h4>${copy(evidence.preparedPrompt)}${code(evidence.preparedPrompt)}` : ''}`;
  const technical = result ? `${result.rawResponse ? `<h4>Сира відповідь</h4>${copy(result.rawResponse)}${code(result.rawResponse)}` : '<p>Сира відповідь не записана.</p>'}
    <h4>Розібраний результат</h4>${code(JSON.stringify({ isScam: result.isScam, scamType: result.scamType,
      confidence: result.confidence, reasoning: result.reasoning }, null, 2))}` : code(check.message || 'Відповіді ще немає.');
  const sameSession = check.sessionId === sessionId;
  const actionLabel = protection?.action === 'LOCK_INPUT' ? 'Введення заблоковане'
    : protection?.action === 'WARN' ? 'Попередження · введення доступне' : 'Активного попередження чи блокування немає';
  const sourceLabel = ({ local: 'Локальні евристики', ai: 'ШІ', inherited: 'Контекст розмови' } as Record<string, string>)[protection?.source || ''] || protection?.source;
  return `${liveToolbar(options.paused)}${scopeControl}
    <section class="sc-card sc-check-detail" aria-label="Вибрана перевірка ШІ">
      <div class="sc-check-heading"><strong>${isPinned ? 'Вибрана перевірка' : 'Остання перевірка'} #${check.number}</strong>
        <span class="sc-check-state sc-check-${tone}">${checkLabel(check)}</span></div>
      ${isPinned ? `<button type="button" class="sc-btn-ghost" id="btn-ai-latest">До останньої перевірки${newer ? ` · нових: ${newer}` : ''}</button>` : ''}
      <p class="sc-check-meta">Початок ${time(check.startedAt)}${check.finishedAt !== undefined ? ` · Завершення ${time(check.finishedAt)}` : ''}
        ${check.durationMs !== undefined ? ` · ${check.durationMs} мс загалом` : ''}</p>
      <p class="sc-check-meta">${escapeDiagnosticText(check.source === 'session-quarantine' ? 'Повторне застосування політики' : result?.provider || (check.status === 'pending' ? 'Провайдер ще не повідомлений' : 'Провайдер не записаний'))}${result?.modelUsed ? ` · ${escapeDiagnosticText(result.modelUsed)}` : ''}
        ${check.source === 'inference' && result?.latencyMs !== undefined ? ` · ${result.latencyMs} мс у провайдера` : ''}</p>
      ${check.source === 'cache' ? `<p class="sc-review-note">Повторно використано результат ${original ? `перевірки #${original.number}` : 'первинної перевірки, вже вилученої з буфера'}. Нового звернення до моделі немає.</p>` : ''}
      <p class="sc-verdict-label">${check.source === 'session-quarantine' ? 'Політика розмови' : result ? 'Висновок моделі' : 'Стан перевірки'}</p>
      <h3 class="sc-check-verdict">${escapeDiagnosticText(verdict)}</h3>
      ${result ? `<p class="sc-confidence">${check.source === 'session-quarantine' ? 'Оцінка політики карантину' : 'Впевненість моделі'}: ${result.confidence}%</p>
        <p class="sc-check-reason">${escapeDiagnosticText(result.reasoning)}</p>` : `<p class="sc-check-reason">${escapeDiagnosticText(check.message || 'Очікуємо відповідь арбітра. Це ще не рішення про загрозу.')}</p>`}
      <div class="sc-check-protection"><strong>Захист зараз${options.paused ? ' · на момент призупинення' : ''}</strong>
        <p>${sameSession ? actionLabel : 'Ця перевірка належить іншій розмові.'}</p>
        ${sameSession && protection ? `<p>Джерело: ${escapeDiagnosticText(sourceLabel)} · ${protection.score}/100</p>` : ''}
        <span>Поточна дія розмови може відрізнятися від висновку цієї перевірки.</span></div>
      ${section('evidence', 'Що перевіряли', evidenceBody)}
      ${section('request', 'Запит до моделі', requestBody)}
      ${section('response', 'Технічна відповідь', technical)}
    </section>
    <section class="sc-card"><h3 class="sc-history-title">Історія перевірок (${checks.length})</h3>
      <div class="sc-check-history">${checks.slice().reverse().map(item => `<button type="button" class="sc-history-row ${item.id === check.id ? 'selected' : ''}"
        data-ai-check="${item.id}" aria-pressed="${item.id === check.id}">
        <span class="sc-history-meta">#${item.number} · ${time(item.startedAt)}${options.scope === 'all' ? ` · ${escapeDiagnosticText(item.sessionId || 'Без розмови')}` : ''}</span>
        <span>${escapeDiagnosticText(item.source === 'session-quarantine' ? 'Карантин розмови' : item.result ? item.result.isScam ? intent(item.result.scamType) : 'Загрозу спростовано' : intent(item.intent))}</span>
        <span class="sc-history-meta">${checkLabel(item)}${item.durationMs !== undefined ? ` · ${item.durationMs} мс` : ''}</span>
      </button>`).join('')}</div>
      <p class="sc-review-note">До 150 перевірок у пам’яті. Старі записи вилучаються; очищення та перезавантаження сторінки скидають історію.</p>
    </section>`;
}

export const AI_INSPECTOR_CSS = `
  .sc-review-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .sc-review-toolbar .sc-btn-ghost { min-height:32px; padding:4px 8px; font-size:11px; }
  .sc-live-state { color:var(--sanctuary-blue-active); font-weight:600; }
  .sc-review-note,.sc-check-meta,.sc-history-meta { color:var(--sanctuary-ink-secondary); font-size:var(--text-caption); line-height:1.5; overflow-wrap:anywhere; }
  .sc-review-note { margin:6px 0 12px; }
  .sc-update-button:empty { display:none; }
  .sc-ai-scope { display:flex; gap:8px; align-items:center; margin:12px 0; }
  .sc-ai-scope select { min-width:0; flex:1; height:32px; border:1px solid var(--sanctuary-hairline); background:var(--sanctuary-surface); color:var(--sanctuary-ink-primary); border-radius:var(--radius-control); padding:0 8px; }
  .sc-check-heading { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; }
  .sc-check-state { font-size:11px; padding:3px 7px; border-radius:var(--radius-nested); background:var(--sanctuary-surface-active); }
  .sc-check-red { color:var(--sanctuary-red-ink); background:var(--sanctuary-red-bg); }
  .sc-check-green { color:var(--sanctuary-green-ink); background:var(--sanctuary-green-bg); }
  .sc-check-blue { color:var(--sanctuary-blue-active); background:var(--sanctuary-blue-bg); }
  .sc-check-amber { color:var(--sanctuary-amber-ink); background:var(--sanctuary-amber-bg); }
  .sc-check-verdict { font-size:15px; margin:14px 0 4px; line-height:1.4; }
  .sc-verdict-label { color:var(--sanctuary-ink-secondary); font-size:11px; margin:14px 0 0; }
  .sc-verdict-label + .sc-check-verdict { margin-top:3px; }
  .sc-confidence { font-size:11px; color:var(--sanctuary-ink-secondary); margin:0 0 8px; }
  .sc-check-reason { font-size:12px; line-height:1.6; overflow-wrap:anywhere; }
  .sc-check-protection { background:var(--sanctuary-surface-subtle); border:1px solid var(--sanctuary-hairline); padding:12px; border-radius:var(--radius-control); margin:12px 0; }
  .sc-check-protection p { margin:4px 0; }
  .sc-check-protection span { font-size:11px; color:var(--sanctuary-ink-secondary); }
  .sc-inspector-section { border-top:1px solid var(--sanctuary-hairline); }
  .sc-inspector-section summary { cursor:pointer; padding:12px 0; font-size:12px; font-weight:600; }
  .sc-inspector-section-body { padding-bottom:12px; overflow-wrap:anywhere; }
  .sc-inspector-section h4 { font-size:11px; margin:8px 0; }
  .sc-inspector-code { white-space:pre-wrap; overflow-wrap:anywhere; font:11px/1.6 var(--font-mono); background:var(--sanctuary-canvas); border:1px solid var(--sanctuary-hairline); border-radius:var(--radius-nested); padding:10px; margin:8px 0; max-height:260px; overflow:auto; }
  .sc-history-title { font-size:13px; margin:0 0 8px; }
  .sc-check-history { display:flex; flex-direction:column; gap:4px; }
  .sc-history-row { text-align:left; cursor:pointer; color:var(--sanctuary-ink-primary); background:transparent; border:1px solid transparent; border-radius:var(--radius-control); padding:8px; display:flex; flex-direction:column; gap:3px; overflow-wrap:anywhere; font-size:12px; }
  .sc-history-row:hover { background:var(--sanctuary-surface-hover); }
  .sc-history-row.selected { background:var(--sanctuary-blue-bg); border-color:var(--sanctuary-blue-bd); }
`;
