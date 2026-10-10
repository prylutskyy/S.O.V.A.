import { UserWhitelistManager } from '../core/user-whitelist';
import { DESIGN_TOKENS_CSS } from './design-tokens';
import { SemanticVectorTelemetry } from '../heuristics/semantic-trigger';
import { AI_INSPECTOR_CSS, renderAIInspector, liveToolbar } from './ai-inspector-view';
import { AICheckHistory, type AICheck, type AICheckInput, type AICheckResult, type AICheckStatus } from './ai-check-history';

export interface LogItem {
  id: string;
  stepKey: string;
  data: any;
  color: string;
  time: string;
  isAi: boolean;
  isForm: boolean;
  isPending?: boolean;
  aiContext?: {
    systemPrompt?: string;
    contextRules?: string;
    textSent?: string;
    chatDialogue?: string;
    raisedFlags?: string[];
    sanitizedPrompt?: string;
    formDetails?: string;
    rawResponse?: string;
    provider?: string;
    model?: string;
    latencyMs?: number;
  };
  expanded?: boolean;
  aiCheckId?: string;
}

export type NeuromonitorTab = 'overview' | 'events' | 'ai' | 'vectors';
export type NeuromonitorCategoryFilter = 'ALL' | 'AI' | 'FORM' | 'RISK';
type ActiveDecision = {
  action: 'WARN' | 'LOCK_INPUT';
  intentType: string;
  score: number;
  source: 'local' | 'ai' | 'inherited';
};

const ICONS = {
  shield: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.5" fill="${color}"/></svg>`,
  shieldCheck: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>`,
  alertTriangle: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  alertCircle: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  zap: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  info: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  copy: (size = 12, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  download: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  minimize: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  close: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  refresh: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  cpu: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
  list: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  message: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  terminal: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  search: (size = 12, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  expand: (size = 11, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  check: (size = 12, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  activity: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  loupe: (size = 13, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
};

export class DebuggerOverlay {
  private static container: HTMLElement | null = null;
  private static shadowRoot: ShadowRoot | null = null;
  private static isVisible = false;

  /** Жорсткий ліміт кільцевого буфера подій (FIFO) для захисту від витоку пам'яті */
  private static readonly MAX_LOGS = 150;
  private static aiHistory = new AICheckHistory();
  private static reviewSnapshot: { logs: LogItem[]; checks: AICheck[]; revision: number; eventRevision: number; protection: ActiveDecision | null } | null = null;
  private static selectedCheckId: string | null = null;
  private static aiScope: 'current' | 'all' = 'current';
  private static eventRevision = 0;
  private static openAISections = new Set<string>();

  public static getAIChecks(): AICheck[] { return this.aiHistory.snapshot(); }
  public static beginAICheck(input: AICheckInput): string {
    const check = this.aiHistory.begin(input);
    this.recordCheckEvent(check);
    return check.id;
  }
  public static finishAICheck(id: string, status: Exclude<AICheckStatus, 'pending'>,
    result?: AICheckResult, message?: string): void {
    const check = this.aiHistory.finish(id, status, result, message);
    if (check) this.recordCheckEvent(check);
  }
  private static recordCheckEvent(check: AICheck): void {
    if (check.status === 'pending' && check.source !== 'inference') return;
    this.eventRevision++;
    this.state.logs.push({ id: `${check.id}-${check.status}`,
      stepKey: `Перевірка ШІ #${check.number} · ${check.status === 'pending' ? 'Початок' : 'Завершення'}`,
      data: check.status === 'pending' ? 'Початок перевірки · очікування відповіді'
        : `${this.checkStatusLabel(check)}${check.message ? `: ${check.message}` : ''}`,
      time: new Date(check.finishedAt ?? check.startedAt).toLocaleTimeString(),
      color: check.result?.isScam ? '#EF4444' : check.status === 'error' ? '#F59E0B' : '#0071E3',
      isAi: true, isForm: false, isPending: check.status === 'pending', aiCheckId: check.id,
      aiContext: { rawResponse: check.result?.rawResponse, provider: check.result?.provider,
        model: check.result?.modelUsed, latencyMs: check.result?.latencyMs } });
    // The start remains in the chronological event journal, but is no longer pending.
    if (check.status !== 'pending') this.state.logs.forEach(log => {
      if (log.aiCheckId === check.id) log.isPending = false;
    });
    this.enforceLogLimit();
    this.render();
  }
  private static checkStatusLabel(check: AICheck): string {
    if (check.source === 'cache') return 'З кешу';
    if (check.source === 'session-quarantine') return 'Карантин розмови';
    return ({ pending: 'Очікування відповіді', completed: 'Завершено', cancelled: 'Скасовано',
      timeout: 'Час очікування вичерпано', error: 'Помилка' })[check.status];
  }
  private static escape(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#39;' }[char]!));
  }

  private static state = {
    sessionId: null as string | null,
    severity: 'LOW' as string,
    score: 0,
    peakScore: 0,
    peakSeverity: 'LOW' as string,
    liveScore: 0,
    liveSeverity: 'LOW' as string,
    threatMitigated: false,
    mitigationReason: '',
    activeDecision: null as ActiveDecision | null,
    activeTab: 'overview' as NeuromonitorTab,
    filterCategory: 'ALL' as NeuromonitorCategoryFilter,
    filterSearch: '',
    isMinimized: false,
    selectedPrototypeId: 'MILITARY_SABOTAGE_RECRUITMENT' as string | null,
    vectorTelemetry: null as SemanticVectorTelemetry | null,
    logs: [] as LogItem[],
  };

  private static isDragging = false;
  private static offsetX = 0;
  private static offsetY = 0;
  private static customPos: { x: number; y: number } | null = null;
  private static savedDimensions: { width: string; height: string } | null = null;

  // Очищення емодзі для чистоти інженерного виводу
  private static stripEmoji(text: string): string {
    if (!text) return '';
    return text
      .replace(
        /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}\u{2714}\u{2716}\u{2705}\u{274C}]/gu,
        ''
      )
      .trim();
  }

  public static show() {
    if (typeof document === 'undefined') return;
    this.isVisible = true;

    if (this.container && document.body && document.body.contains(this.container)) {
      this.applyContainerGeometry();
      this.render();
      return;
    }

    this.container = document.createElement('div');
    this.container.id = 'threatshield-neuro-monitor';
    this.container.className = 'sanctuary-core-root';

    this.shadowRoot = this.container.attachShadow({ mode: 'open' });
    document.body.appendChild(this.container);

    this.setupDrag();
    this.applyContainerGeometry();
    this.render();
  }

  private static applyContainerGeometry() {
    if (!this.container) return;

    if (!this.isVisible) {
      this.container.style.display = 'none';
      return;
    }

    if (this.state.isMinimized) {
      if (this.container.style.width && this.container.style.width !== 'auto') {
        this.savedDimensions = {
          width: this.container.style.width,
          height: this.container.style.height || '580px',
        };
      }
      Object.assign(this.container.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        top: 'auto',
        left: 'auto',
        width: 'auto',
        height: 'auto',
        zIndex: '2147483647',
        display: 'block',
        resize: 'none',
        overflow: 'visible',
        borderRadius: '9999px',
        boxShadow: 'none',
      });
    } else {
      const currentWidth =
        this.savedDimensions?.width ||
        (this.container.style.width && this.container.style.width !== 'auto'
          ? this.container.style.width
          : '460px');
      const currentHeight =
        this.savedDimensions?.height ||
        (this.container.style.height && this.container.style.height !== 'auto'
          ? this.container.style.height
          : '580px');

      const baseStyles: Partial<CSSStyleDeclaration> = {
        position: 'fixed',
        width: currentWidth,
        height: currentHeight,
        minWidth: 'min(380px, calc(100vw - 40px))',
        minHeight: 'min(480px, calc(100dvh - 40px))',
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100dvh - 40px)',
        zIndex: '2147483647',
        display: 'block',
        resize: 'both',
        overflow: 'hidden',
        borderRadius: 'var(--radius-modal, 22px)',
        boxShadow: 'var(--shadow-modal, 0 8px 24px rgba(0, 0, 0, 0.16))',
      };

      if (this.customPos) {
        baseStyles.left = `${this.customPos.x}px`;
        baseStyles.top = `${this.customPos.y}px`;
        baseStyles.right = 'auto';
        baseStyles.bottom = 'auto';
      } else {
        baseStyles.top = '20px';
        baseStyles.right = '20px';
        baseStyles.left = 'auto';
        baseStyles.bottom = 'auto';
      }

      Object.assign(this.container.style, baseStyles);
    }
  }

  public static hide() {
    this.isVisible = false;
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  public static isOpen(): boolean {
    return this.isVisible;
  }

  public static clear() {
    this.aiHistory.clear();
    this.reviewSnapshot = null;
    this.selectedCheckId = null;
    this.openAISections.clear();
    this.aiScope = 'current';
    this.state.filterSearch = '';
    this.state.filterCategory = 'ALL';
    this.state.logs = [];
    this.resetSessionRisk();
    this.setSession(null);
    this.render();
  }

  public static setSession(id: string | null, severity: string = 'LOW') {
    if (id !== this.state.sessionId) {
      this.reviewSnapshot = null;
      this.selectedCheckId = null;
      this.openAISections.clear();
    }
    if (id && id === this.state.sessionId && this.state.activeDecision) return;
    this.state.activeDecision = null;
    this.state.sessionId = id;
    this.state.severity = severity;
    if (severity === 'CRITICAL') this.state.score = 100;
    else if (severity === 'HIGH') this.state.score = 75;
    else if (severity === 'MEDIUM') this.state.score = 50;
    else if (severity === 'LOW' && id) this.state.score = 25;
    else this.state.score = 0;

    this.state.peakScore = this.state.score;
    this.state.peakSeverity = severity;
    this.state.liveScore = this.state.score;
    this.state.liveSeverity = severity;
    this.state.threatMitigated = false;
    this.state.mitigationReason = '';

    this.render();
  }

  public static setAssessment(score: number, severity: string = 'LOW', forceReset: boolean = false) {
    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
    this.state.liveScore = normalizedScore;
    this.state.liveSeverity = severity;
    if (forceReset) this.state.activeDecision = null;
    if (this.state.activeDecision) {
      this.render();
      return;
    }

    if (forceReset) {
      this.state.score = normalizedScore;
      this.state.peakScore = normalizedScore;
      this.state.severity = severity;
      this.state.peakSeverity = severity;
      this.state.threatMitigated = false;
      this.state.mitigationReason = '';
      this.render();
      return;
    }

    if (normalizedScore > this.state.peakScore) {
      this.state.peakScore = normalizedScore;
      this.state.peakSeverity = severity;
      this.state.threatMitigated = false;
      this.state.mitigationReason = '';
    } else if (normalizedScore < this.state.peakScore && this.state.peakScore >= 35) {
      // Загрозу було виявлено раніше, але поточне введення користувач скасував або очистив
      this.state.threatMitigated = true;
      if (!this.state.mitigationReason) {
        this.state.mitigationReason = 'Користувач скасував або очистив введення секретних даних';
      }
    }

    // Зберігаємо сесійний піковий ризик (High-Water Mark), щоб запобігти скиданню в ZERO
    this.state.score = Math.max(this.state.peakScore, normalizedScore);
    const effectiveSeverity =
      this.state.score >= 76
        ? 'CRITICAL'
        : this.state.score >= 51
        ? 'HIGH'
        : this.state.score >= 21
        ? 'MEDIUM'
        : 'LOW';
    this.state.severity = effectiveSeverity;

    this.render();
  }

  public static setThreatDecision(action: ActiveDecision['action'], intentType: string,
    score: number, source: ActiveDecision['source'] = 'local') {
    // Background echoes of this tab's context must not replace its concrete result.
    if (source === 'inherited' && this.state.activeDecision) return;
    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
    this.state.activeDecision = { action, intentType, score: normalizedScore, source };
    this.state.score = normalizedScore;
    this.state.threatMitigated = false;
    this.state.mitigationReason = '';
    this.render();
  }

  public static recordMitigation(reason: string, score?: number, severity?: string) {
    if (this.state.activeDecision) {
      this.state.liveScore = 0;
      this.state.liveSeverity = 'LOW';
      this.log('Захист', `Введення скасовано; загроза діалогу залишається активною: ${reason}`, '#34C759');
      this.render();
      return;
    }
    const finalScore = score !== undefined ? score : this.state.peakScore;
    const finalSeverity =
      severity ||
      (finalScore >= 76 ? 'CRITICAL' : finalScore >= 51 ? 'HIGH' : finalScore >= 21 ? 'MEDIUM' : 'LOW');

    if (finalScore > this.state.peakScore) {
      this.state.peakScore = finalScore;
      this.state.peakSeverity = finalSeverity;
    }
    this.state.threatMitigated = true;
    this.state.mitigationReason = reason;
    this.state.liveScore = 0;
    this.state.liveSeverity = 'LOW';
    this.state.score = Math.max(this.state.peakScore, finalScore);
    this.state.severity =
      this.state.score >= 76
        ? 'CRITICAL'
        : this.state.score >= 51
        ? 'HIGH'
        : this.state.score >= 21
        ? 'MEDIUM'
        : 'LOW';

    this.log('Захист', `Загрозу відвернено: ${reason} (Піковий індекс R: ${this.state.score}/100)`, '#34C759');
    this.render();
  }

  public static resetSessionRisk() {
    this.state.activeDecision = null;
    this.state.score = 0;
    this.state.peakScore = 0;
    this.state.peakSeverity = 'LOW';
    this.state.severity = 'LOW';
    this.state.liveScore = 0;
    this.state.liveSeverity = 'LOW';
    this.state.threatMitigated = false;
    this.state.mitigationReason = '';
    this.state.vectorTelemetry = null;
    this.state.selectedPrototypeId = null;
    this.state.logs = this.state.logs.filter(
      (l) =>
        !l.stepKey.includes('Ризик') &&
        !l.stepKey.includes('Тригери') &&
        !l.stepKey.includes('Trap') &&
        !l.stepKey.includes('СКАМ') &&
        !l.stepKey.includes('Векторн') &&
        !l.stepKey.includes('Семантичн') &&
        l.color !== '#FF3B30' &&
        l.color !== '#FF453A' &&
        l.color !== '#EF4444'
    );
    this.render();
  }

  public static getPeakScore(): number {
    return this.state.peakScore;
  }

  public static getLiveScore(): number {
    return this.state.liveScore;
  }

  public static isThreatMitigated(): boolean {
    return this.state.threatMitigated;
  }

  public static recordVectorTelemetry(telemetry: SemanticVectorTelemetry): void {
    if (!telemetry) return;
    this.state.vectorTelemetry = telemetry;
    if (telemetry.topPrototypeId) {
      this.state.selectedPrototypeId = telemetry.topPrototypeId;
    }
    if (this.isVisible) {
      this.render();
    }
  }

  public static getVectorTelemetry(): SemanticVectorTelemetry | null {
    return this.state.vectorTelemetry;
  }

  public static log(
    stepKey: string,
    data: any,
    customColor?: string,
    broadcast: boolean = true,
    isAi: boolean = false,
    aiContext?: LogItem['aiContext'],
    logId?: string
  ) {
    const cleanStepKey = this.stripEmoji(stepKey);

    if (
      isAi ||
      aiContext ||
      logId ||
      cleanStepKey.toLowerCase().includes('ші') ||
      cleanStepKey.toLowerCase().includes('ai') ||
      cleanStepKey.toLowerCase().includes('llm')
    ) {
      return this.logAI(cleanStepKey, data, customColor, aiContext, logId);
    }

    if (broadcast && this.state.sessionId) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'BROADCAST_LOG',
            payload: {
              sessionId: this.state.sessionId,
              stepKey: cleanStepKey,
              data,
              customColor,
            },
          });
        }
      } catch {}
    }

    const time = new Date().toLocaleTimeString();
    const color = customColor || '#34C759'; // Apple Emerald default

    const isStepAi =
      cleanStepKey.toLowerCase().includes('ai') ||
      cleanStepKey.toLowerCase().includes('llm') ||
      cleanStepKey.toLowerCase().includes('ші');
    const isForm =
      cleanStepKey.toLowerCase().includes('форма') ||
      cleanStepKey.toLowerCase().includes('form') ||
      cleanStepKey.toLowerCase().includes('поле');

    const cleanData = typeof data === 'string' ? this.stripEmoji(data) : data;

    this.state.logs.push({ id: crypto.randomUUID(), stepKey: cleanStepKey, data: cleanData,
      color, time, isAi: isStepAi, isForm, expanded: false });
    this.eventRevision++;

    this.enforceLogLimit();
    this.render();
  }

  public static logAI(
    stepKey: string,
    data: any,
    customColor?: string,
    aiContext?: LogItem['aiContext'],
    logId?: string
  ): string {
    const cleanStepKey = this.stripEmoji(stepKey);
    const cleanData = typeof data === 'string' ? this.stripEmoji(data) : data;

    const time = new Date().toLocaleTimeString();
    const color = customColor || '#0071E3'; // Apple Sapphire default
    const isPending =
      typeof cleanData === 'string' &&
      (cleanData.includes('очікую') || cleanData.includes('Аналізую') || cleanData.includes('відправлено'));

    let targetIndex = -1;
    if (logId) {
      targetIndex = this.state.logs.findIndex((l) => l.id === logId);
    } else if (!isPending) {
      for (let i = this.state.logs.length - 1; i >= 0; i--) {
        if (this.state.logs[i].stepKey === cleanStepKey && this.state.logs[i].isPending) {
          targetIndex = i;
          break;
        }
      }
    }

    let currentId: string;
    if (targetIndex >= 0) {
      currentId = this.state.logs[targetIndex].id;
      const updatedContext = {
        ...(this.state.logs[targetIndex].aiContext || {}),
        ...(aiContext || {}),
      };
      this.state.logs[targetIndex] = {
        ...this.state.logs[targetIndex],
        data: cleanData,
        color,
        time,
        isPending,
        aiContext: updatedContext,
      };
    } else {
      currentId = logId || Math.random().toString(36).substring(7);
      this.state.logs.push({
        id: currentId,
        stepKey: cleanStepKey,
        data: cleanData,
        color,
        time,
        isAi: true,
        isForm: false,
        isPending,
        aiContext,
      });
    }

    this.enforceLogLimit();
    this.eventRevision++;
    this.render();
    return currentId;
  }

  /**
   * Кільцевий буфер (Ring Buffer): обмежує кількість подій у пам'яті.
   * Спершу витісняє найстаріші НЕ-AI події, щоб зберегти цінну телеметрію LLM.
   * Якщо після цього ліміт все ще перевищено — зрізає найстаріші записи незалежно від типу.
   */
  private static enforceLogLimit(): void {
    if (this.state.logs.length <= this.MAX_LOGS) return;

    // Фаза 1: Витіснення найстарших звичайних подій (не AI)
    while (this.state.logs.length > this.MAX_LOGS) {
      const oldestNonAiIndex = this.state.logs.findIndex(l => !l.isAi);
      if (oldestNonAiIndex === -1) break; // Усі записи — AI, переходимо до FIFO
      this.state.logs.splice(oldestNonAiIndex, 1);
    }

    // Фаза 2: Жорсткий FIFO-зріз, якщо AI-логів накопичилося більше за ліміт
    if (this.state.logs.length > this.MAX_LOGS) {
      this.state.logs = this.state.logs.slice(-this.MAX_LOGS);
    }
  }

  // Оцінка консенсусу (Евристика vs LLM) - Бінарна логіка
  private static assessFalsePositive() {
    const { score, severity, logs, threatMitigated, peakScore, liveScore, mitigationReason } = this.state;
    const isHeuristicRisk = score >= 40 || severity === 'HIGH' || severity === 'CRITICAL';

    const aiLogs = logs.filter((l) => l.isAi);
    let lastAiVerdict: { isScam: boolean; confidence: number; explanation: string } | null = null;

    for (let i = aiLogs.length - 1; i >= 0; i--) {
      const raw = aiLogs[i].aiContext?.rawResponse;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed.isScam === 'boolean') {
            lastAiVerdict = parsed;
            break;
          }
        } catch {}
      }
      const dataStr = String(aiLogs[i].data);
      if (dataStr.includes('СКАМ') || dataStr.includes('ШАХРАЙ')) {
        lastAiVerdict = { isScam: true, confidence: 90, explanation: dataStr };
        break;
      }
      if (dataStr.includes('Безпечно') || dataStr.includes('ЛЕГІТИМНО') || dataStr.includes('Норма')) {
        lastAiVerdict = { isScam: false, confidence: 92, explanation: dataStr };
        break;
      }
    }

    const triggers: string[] = [];
    logs.forEach((l) => {
      if (
        l.color === '#FF3B30' ||
        l.color === '#FF453A' ||
        l.color === '#EF4444' ||
        (l.stepKey.includes('Ризик') && !l.stepKey.includes('Скасовано') && !l.stepKey.includes('Нейтралізовано')) ||
        l.stepKey.includes('Trap') ||
        l.stepKey.includes('СКАМ')
      ) {
        if (!triggers.includes(l.stepKey)) {
          triggers.push(l.stepKey);
        }
      }
    });

    const isAiConfirmed = lastAiVerdict !== null && lastAiVerdict.isScam;

    const decision = this.state.activeDecision;
    if (decision) {
      const locked = decision.action === 'LOCK_INPUT';
      return {
        status: locked ? 'INPUT_LOCKED' : 'ACTIVE_WARNING',
        badgeIcon: ICONS.alertCircle(12, '#D70015'),
        badgeText: locked ? 'АКТИВНА ЗАГРОЗА: ВВІД ЗАБЛОКОВАНО' : 'АКТИВНА ЗАГРОЗА: ПОПЕРЕДЖЕННЯ',
        badgeClass: 'sc-badge-red',
        explanation: `Тип загрози: ${decision.intentType}. Джерело рішення: ${decision.source === 'local' ? 'локальні евристики' : decision.source === 'ai' ? 'ШІ-арбітр' : 'успадкований контекст'}.`,
        recommendation: locked ? 'Ввід заблоковано для захисту від критичної загрози.' : 'Перевірте прохання співрозмовника. Ввід залишається доступним.',
        heuristicVerdict: `${decision.source === 'ai' ? 'Оцінка ШІ' : 'Локальна оцінка'}: ${decision.score}/100`,
        aiVerdict: decision.source === 'ai' ? 'Загрозу підтверджено ШІ' : 'Рішення застосовано без підтвердження ШІ',
        triggers,
      };
    }

    // Якщо загрозу відвернуто
    if (threatMitigated && peakScore >= 35) {
      return {
        status: 'CLEAN',
        badgeIcon: ICONS.shieldCheck(12, '#248A3D'),
        badgeText: 'БЕЗПЕЧНО (ВВЕДЕННЯ СКАСОВАНО)',
        badgeClass: 'sc-badge-green',
        explanation: 'Спроба передачі чутливих даних була вчасно скасована користувачем.',
        recommendation: mitigationReason || 'Загрозу витоку нейтралізовано.',
        heuristicVerdict: `Пік: ${peakScore}/100`,
        aiVerdict: 'Захищено користувачем',
        triggers: triggers.length > 0 ? triggers : ['Витік відвернуто'],
      };
    }

    // ЄДИНИЙ ЧЕРВОНИЙ СТАН: Тільки якщо ШІ підтвердив загрозу, або якщо ризик критичний і ШІ ще не відповів (можливо, жорстке правило)
    if (isHeuristicRisk && (isAiConfirmed || (score >= 90 && !lastAiVerdict))) {
      return {
        status: 'CONFIRMED_THREAT',
        badgeIcon: ICONS.alertCircle(12, '#D70015'),
        badgeText: 'ПІДТВЕРДЖЕНА ЗАГРОЗА (КРИТИЧНИЙ РИЗИК)',
        badgeClass: 'sc-badge-red',
        explanation: `Консенсус безпеки: виявлено підтверджені ознаки соціальної інженерії.`,
        recommendation: 'Захисне блокування та переривання введення повністю виправдані.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: lastAiVerdict ? `СКАМ (${lastAiVerdict.confidence}%)` : 'Жорстке правило / Очікується аналіз',
        triggers,
      };
    }

    // У всіх інших випадках (ШІ відхилив, або евристика спрацювала але ШІ ще мовчить, або тригерів мало) - система мовчить (зелена/сіра)
    return {
      status: 'CLEAN',
      badgeIcon: ICONS.shieldCheck(12, '#248A3D'),
      badgeText: 'БЕЗПЕЧНО: ЗАГРОЗ НЕ ВИЯВЛЕНО',
      badgeClass: 'sc-badge-green',
      explanation: 'Моніторинг працює у фоновому режимі.',
      recommendation: 'Система функціонує штатно.',
      heuristicVerdict: `Поточний фон: ${score}/100`,
      aiVerdict: lastAiVerdict ? (lastAiVerdict.isScam ? 'СКАМ (Ігнорується)' : 'Безпечно') : 'У нормі',
      triggers: triggers.length > 0 ? triggers : ['Тригери відсутні'],
    };
  }

  // Генерація діагностичного звіту у форматі JSON
  private static exportDiagnosticReport(): string {
    const fpAssessment = this.assessFalsePositive();
    const report = {
      generator: 'С.О.В.А. · Аналітичний модуль XAI (MV3)',
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      hostname: typeof window !== 'undefined' ? window.location.hostname : '',
      sessionId: this.state.sessionId,
      severity: this.state.severity,
      score: this.state.score,
      activeDecision: this.state.activeDecision,
      falsePositiveAssessment: fpAssessment,
      semanticVectorTelemetry: this.state.vectorTelemetry || null,
      aiChecks: this.getAIChecks(),
      logsSummary: this.state.logs.map((l) => ({
        time: l.time,
        stepKey: l.stepKey,
        isAi: l.isAi,
        isForm: l.isForm,
        data: l.data,
      })),
    };
    return JSON.stringify(report, null, 2);
  }

  private static copyToClipboard(text: string, btn?: HTMLElement, successText: string = 'Скопійовано!') {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (btn) {
          const original = btn.innerHTML;
          btn.innerHTML = `${ICONS.check(12, '#248A3D')} <span>${successText}</span>`;
          setTimeout(() => {
            btn.innerHTML = original;
          }, 1600);
        }
      });
    }
  }

  private static render(force = false) {
    if (!this.shadowRoot) return;

    if (!this.isVisible) {
      if (this.container) {
        this.container.style.display = 'none';
      }
      return;
    }

    if (this.state.isMinimized) {
      this.applyContainerGeometry();
      this.renderMinimized();
      return;
    }

    const reviewTab = this.state.activeTab === 'ai' || this.state.activeTab === 'events';
    const selection = (this.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.()
      || window.getSelection();
    const hasSelection = !!selection && !selection.isCollapsed && selection.anchorNode?.getRootNode() === this.shadowRoot;
    if (!force && reviewTab && (this.reviewSnapshot || hasSelection)) {
      if (hasSelection && !this.reviewSnapshot) {
        const liveState = this.shadowRoot.querySelector('.sc-live-state');
        if (liveState) liveState.textContent = 'Перегляд затримано · виділено текст';
      }
      const badge = this.shadowRoot.getElementById('sc-new-updates');
      if (badge) badge.textContent = 'Є нові дані · Оновити перегляд';
      return;
    }

    this.applyContainerGeometry();

    const { sessionId, severity, score, activeTab, filterCategory, filterSearch, threatMitigated, liveScore } = this.state;
    const logs = reviewTab && this.reviewSnapshot ? this.reviewSnapshot.logs : this.state.logs;
    const checks = this.reviewSnapshot && reviewTab ? this.reviewSnapshot.checks : this.getAIChecks();
    const currentChecks = checks.filter(check => this.aiScope === 'all' || check.sessionId === sessionId);
    const focusedControl = this.shadowRoot.activeElement as HTMLElement | null;
    const focusedId = focusedControl?.id;
    const focusedTab = focusedControl?.dataset.tab;
    const focusedPrototype = focusedControl?.dataset.protoId;
    const focusedCheck = focusedControl?.dataset.aiCheck;
    const focusedInput = focusedControl instanceof HTMLInputElement ? focusedControl : null;
    const caret = focusedInput ? [focusedInput.selectionStart, focusedInput.selectionEnd] : null;
    const viewport = this.shadowRoot.querySelector<HTMLElement>('.sc-viewport');
    const previousTab = this.shadowRoot.querySelector<HTMLElement>('.sc-tab-btn.active')?.dataset.tab;
    const scrollTop = previousTab === activeTab ? viewport?.scrollTop || 0 : 0;
    const followEvents = activeTab === 'events' && previousTab === activeTab && !this.reviewSnapshot
      && !filterSearch && !!viewport && viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 24;
    this.shadowRoot.querySelectorAll<HTMLDetailsElement>('[data-ai-section]').forEach(details => {
      const key = details.dataset.aiSection!;
      if (details.open) this.openAISections.add(key); else this.openAISections.delete(key);
    });

    // Apple Light Theme Palette
    const riskColor =
      severity === 'CRITICAL' || severity === 'HIGH'
        ? '#FF3B30'
        : severity === 'MEDIUM'
        ? '#FF9500'
        : '#34C759';

    const strokeDasharray = 226; // 2 * pi * r (r=36)
    const strokeDashoffset = strokeDasharray - (strokeDasharray * score) / 100;

    const fpInfo = this.assessFalsePositive();

    // Підрахунок категорій
    const aiCount = currentChecks.length;
    const formCount = logs.filter((l) => l.isForm).length;
    const riskCount = logs.filter(
      (l) =>
        l.color === '#FF3B30' ||
        l.color === '#FF453A' ||
        l.color === '#EF4444' ||
        l.stepKey.includes('Ризик') ||
        l.stepKey.includes('Trap') ||
        l.stepKey.includes('СКАМ')
    ).length;

    // Фільтрація логів
    const filteredLogs = logs.filter((log) => {
      if (filterCategory === 'AI' && !log.isAi) return false;
      if (filterCategory === 'FORM' && !log.isForm) return false;
      if (
        filterCategory === 'RISK' &&
        !(
          log.color === '#FF3B30' ||
          log.color === '#FF453A' ||
          log.color === '#EF4444' ||
          log.stepKey.includes('Ризик') ||
          log.stepKey.includes('Trap') ||
          log.stepKey.includes('СКАМ')
        )
      ) {
        return false;
      }
      if (filterSearch.trim()) {
        const query = filterSearch.toLowerCase();
        const dataStr = typeof log.data === 'object' ? JSON.stringify(log.data) : String(log.data);
        return log.stepKey.toLowerCase().includes(query) || dataStr.toLowerCase().includes(query);
      }
      return true;
    });

    const currentHost = typeof window !== 'undefined' ? window.location.hostname || 'Активна сторінка' : 'Сторінка';

    // Вкладка 1: Швейцарська Лупа (Огляд)
    const renderOverviewTab = () => {
      return `
        <div class="sc-overview-view">
          <!-- 1. The Swiss Loupe Dial (Швейцарська Лупа) -->
          <div class="sc-card sc-loupe-hero">
            <div class="sc-gauge-section">
              <div class="sc-gauge-container">
                <svg class="sc-gauge-svg" viewBox="0 0 90 90">
                  <circle class="sc-gauge-bg" cx="45" cy="45" r="36"></circle>
                  <circle class="sc-gauge-progress" cx="45" cy="45" r="36" style="stroke-dasharray: ${strokeDasharray}; stroke-dashoffset: ${strokeDashoffset}; stroke: ${riskColor};"></circle>
                </svg>
                <div class="sc-gauge-text">
                  <span class="sc-gauge-value">${score}</span>
                  <span class="sc-gauge-label">Індекс R</span>
                </div>
              </div>
              <div class="sc-hero-meta">
                <div class="sc-site-name" title="${currentHost}">${currentHost}</div>
                <div class="sc-badge ${fpInfo.badgeClass}">
                  ${fpInfo.badgeIcon}
                  <span>${fpInfo.badgeText}</span>
                </div>
                <div class="sc-subtext">${threatMitigated ? `Чернетка: ${liveScore}/100 (Вилучено) · Піковий ризик збережено` : (sessionId ? `Сесія: ${sessionId.substring(0, 16)}...` : 'Пасивний фоновий моніторинг')}</div>
              </div>
            </div>

            <!-- 2. 4 Стовпи Телеметрії (Швейцарська Лупа) -->
            <div class="sc-loupe-pillars">
              <div class="sc-pillar-cell">
                <span class="sc-pillar-label">Евристичний ризик</span>
                <span class="sc-pillar-val" style="color: ${riskColor}">${score}/100${threatMitigated ? ` <span style="font-size:9.5px;color:#86868B;font-weight:400;">(Live: ${liveScore})</span>` : ''}</span>
              </div>
              <div class="sc-pillar-cell">
                <span class="sc-pillar-label">ШІ-Арбітр (LLM)</span>
                <span class="sc-pillar-val sc-val-blue">${checks.some(check => check.sessionId === sessionId && check.status === 'pending') ? 'Очікування ШІ' : checks.filter(check => check.sessionId === sessionId).at(-1)?.durationMs !== undefined ? `${checks.filter(check => check.sessionId === sessionId).at(-1)!.durationMs} мс · перевірка` : 'ШІ-Арбітр'}</span>
              </div>
              <div class="sc-pillar-cell">
                <span class="sc-pillar-label">DOM Cloaking AST</span>
                <span class="sc-pillar-val ${formCount > 0 ? 'sc-val-amber' : 'sc-val-green'}">${formCount > 0 ? `${formCount} форм` : '0 пасток'}</span>
              </div>
              <div class="sc-pillar-cell">
                <span class="sc-pillar-label">Шифрування DLP</span>
                <span class="sc-pillar-val sc-val-indigo">AES-GCM 256</span>
              </div>
            </div>
          </div>

          <!-- 3. XAI Вердикт та пояснення -->
          <div class="sc-card sc-verdict-card">
            <div class="sc-verdict-header">
              <span class="sc-card-title">Аналітичний висновок системи</span>
              <button type="button" class="sc-btn-ghost" id="btn-copy-fp-report" title="Скопіювати структурований звіт">
                ${ICONS.copy(11, '#0071E3')}
                <span>Копіювати звіт</span>
              </button>
            </div>
            <p class="sc-verdict-text">${fpInfo.explanation}</p>

            ${
              fpInfo.triggers.length > 0 && fpInfo.triggers[0] !== 'Тригери відсутні'
                ? `
              <div class="sc-triggers-wrap">
                <div class="sc-triggers-label">Фактори ризику:</div>
                <div class="sc-triggers-list">
                  ${fpInfo.triggers.map((t) => `<span class="sc-trigger-chip">${t}</span>`).join('')}
                </div>
              </div>
            `
                : ''
            }

            <div class="sc-action-row">
              <button type="button" class="sc-btn sc-btn-pill" id="btn-quick-whitelist">
                ${ICONS.shieldCheck(12, '#248A3D')}
                <span>Додати до Довірених</span>
              </button>
              <button type="button" class="sc-btn sc-btn-pill" id="btn-quick-reset-session">
                ${ICONS.refresh(12, '#515154')}
                <span>Скинути стан тривоги</span>
              </button>
            </div>
          </div>
        </div>
      `;
    };

    // Вкладка 2: Консоль подій
    const renderEventsTab = () => {
      let logsHtml = '';
      if (filteredLogs.length === 0) {
        logsHtml = `
          <div class="sc-empty-state sc-events-empty">
            ${ICONS.terminal(28, '#86868B')}
            <div class="sc-empty-title">${logs.length ? 'Нічого не знайдено' : 'Подій поки що немає'}</div>
            <div class="sc-empty-sub">${logs.length ? 'Змініть фільтр або пошуковий запит.' : 'Нові події з’являться тут під час роботи захисту.'}</div>
            ${logs.length ? '<button type="button" class="sc-btn-ghost" id="btn-reset-event-filters">Очистити фільтри</button>' : ''}
          </div>
        `;
      } else {
        filteredLogs.forEach((log) => {
          const dataStr =
            typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data);
          const previewText = dataStr.replace(/\s+/g, ' ').trim();
          const preview = previewText.length > 180 ? `${previewText.slice(0, 177)}…` : previewText;

          let badgeType = 'LOG';
          if (log.isAi) badgeType = 'AI';
          else if (log.isForm) badgeType = 'FORM';
          else if (log.color === '#FF3B30' || log.color === '#FF453A' || log.color === '#EF4444' || log.stepKey.includes('Ризик') || log.stepKey.includes('Trap') || log.stepKey.includes('СКАМ')) badgeType = 'RISK';
          else if (log.stepKey.includes('Контекст') || log.stepKey.includes('Сесій')) badgeType = 'CTX';
          else if (log.stepKey.includes('DLP') || log.stepKey.includes('Vault')) badgeType = 'VAULT';

          logsHtml += `
            <div class="sc-event-card">
              <div class="sc-event-header">
                <div class="sc-event-title-wrap">
                  <span class="sc-event-badge sc-badge-${badgeType.toLowerCase()}">${badgeType}</span>
                  <span class="sc-event-title">${this.escape(log.stepKey)}</span>
                </div>
                <div class="sc-event-right">
                  <span class="sc-event-time">${log.time}</span>
                </div>
              </div>
              <p class="sc-event-preview">${this.escape(preview || 'Додаткових даних немає')}</p>
              <details class="sc-event-details">
                <summary>Деталі події</summary>
                <pre class="sc-event-code">${this.escape(dataStr)}</pre>
                <button type="button" class="sc-btn-ghost sc-event-copy" data-copy="${encodeURIComponent(dataStr)}">${ICONS.copy(12)} Скопіювати дані</button>
              </details>
              ${log.aiCheckId ? `<button type="button" class="sc-btn-ghost" data-ai-open="${log.aiCheckId}">Відкрити перевірку</button>` : ''}
            </div>
          `;
        });
      }

      return `
        <div class="sc-events-view">
          ${liveToolbar(!!this.reviewSnapshot)}
          <section class="sc-events-controls" aria-label="Пошук і фільтри подій">
            <div class="sc-events-controls-heading">
              <div><div class="sc-events-heading">Потік подій</div><div class="sc-events-count">Показано ${filteredLogs.length} із ${logs.length}</div></div>
            </div>
            <div class="sc-filter-toolbar">
            <div class="sc-search-box">
              ${ICONS.search(12, '#86868B')}
              <input type="text" id="sc-input-search" class="sc-search-input" aria-label="Пошук у подіях" placeholder="Пошук у назві чи даних..." value="${this.escape(filterSearch)}">
              ${filterSearch ? `<button type="button" id="btn-clear-search" class="sc-search-clear">${ICONS.close(10, '#86868B')}</button>` : ''}
            </div>
              <div class="sc-filter-chips" role="group" aria-label="Категорія подій">
                <button type="button" class="sc-chip ${filterCategory === 'ALL' ? 'active' : ''}" aria-pressed="${filterCategory === 'ALL'}" data-cat="ALL">Усі <span>${logs.length}</span></button>
                <button type="button" class="sc-chip ${filterCategory === 'AI' ? 'active' : ''}" aria-pressed="${filterCategory === 'AI'}" data-cat="AI">ШІ <span>${logs.filter(log => log.isAi).length}</span></button>
                <button type="button" class="sc-chip ${filterCategory === 'FORM' ? 'active' : ''}" aria-pressed="${filterCategory === 'FORM'}" data-cat="FORM">Форми <span>${formCount}</span></button>
                <button type="button" class="sc-chip ${filterCategory === 'RISK' ? 'active' : ''}" aria-pressed="${filterCategory === 'RISK'}" data-cat="RISK">Ризики <span>${riskCount}</span></button>
              </div>
            </div>
          </section>
          <div class="sc-events-scroll" id="sc-logs-scroll">
            ${logsHtml}
          </div>
        </div>
      `;
    };

    const renderAiTab = () => renderAIInspector({ checks: currentChecks, allChecks: checks,
      selectedId: this.selectedCheckId, paused: !!this.reviewSnapshot, scope: this.aiScope,
      sessionId, openSections: this.openAISections,
      protection: this.reviewSnapshot ? this.reviewSnapshot.protection : this.state.activeDecision });

    // Вкладка 4: Семантичний Векторний Спектр (Vector Spectrum)
    const renderVectorsTab = () => {
      const telemetry = this.state.vectorTelemetry;
      if (!telemetry || telemetry.dimensions.length === 0) {
        return `
          <div class="sc-card sc-empty-state">
            ${ICONS.activity(32, 'var(--sanctuary-blue)')}
            <div class="sc-empty-title">Ще немає повідомлень для аналізу</div>
            <div class="sc-empty-sub">Після аналізу вхідного повідомлення тут з’являться його ознаки та порівняння з еталонами загроз.</div>
          </div>
        `;
      }
      const currentSelectedProto = this.state.selectedPrototypeId || telemetry.topPrototypeId || 'MILITARY_SABOTAGE_RECRUITMENT';

      const protoInfo = telemetry.allPrototypes.find((p) => p.id === currentSelectedProto) || telemetry.allPrototypes[0] || {
        id: currentSelectedProto,
        labelUk: 'ст. 111-2, 113 ККУ (Вербування / Диверсія)',
        similarity: telemetry.cosineSimilarity,
        prototypeWeights: {},
      };

      const similarity = protoInfo.similarity !== undefined ? protoInfo.similarity : telemetry.cosineSimilarity;
      const isIntentFormedForThis = Boolean(telemetry.hasFormedIntent && telemetry.intentType === protoInfo.id);
      const isHighSimilarity = similarity >= 0.40;
      const similarityPercent = Math.round(similarity * 100);

      let statusTitle = 'Низька схожість з еталоном';
      let statusSub = `Подібність ${similarityPercent}% — нижче орієнтира 40% для цього порівняння.`;

      if (isIntentFormedForThis) {
        statusTitle = 'Локальний класифікатор виявив намір';
        statusSub = telemetry.reason
          ? telemetry.reason
          : 'У повідомленні знайдено поєднання ознак цього типу загрози.';
      } else if (isHighSimilarity) {
        statusTitle = 'Підвищена схожість з еталоном';
        statusSub = 'Подібність від 40%. Сформованого наміру цього типу не виявлено.';
      }

      // Масив точок для 10 вимірів
      // Координати графіка: X від 45 до 495 (ширина 540), Y від 25 (значення 1.0) до 150 (значення 0.0)
      const graphWidth = 540;
      const graphHeight = 185;
      const originX = 45;
      const originY = 150;
      const topY = 25;
      const usableHeight = originY - topY; // 125px
      const usableWidth = graphWidth - originX - 25; // 470px
      const stepX = usableWidth / Math.max(1, telemetry.dimensions.length - 1);

      // Розрахунок точок
      const inputPoints: { x: number; y: number; val: number; key: string; label: string }[] = [];
      const protoPoints: { x: number; y: number; val: number; key: string; label: string }[] = [];

      telemetry.dimensions.forEach((dim, idx) => {
        const x = Math.round(originX + idx * stepX);
        const protoWeight = protoInfo.prototypeWeights[dim.key] !== undefined ? protoInfo.prototypeWeights[dim.key] : dim.prototypeWeight;
        const inputY = Math.round(originY - (dim.inputWeight * usableHeight));
        const protoY = Math.round(originY - (protoWeight * usableHeight));

        inputPoints.push({ x, y: inputY, val: dim.inputWeight, key: dim.key, label: dim.labelUk });
        protoPoints.push({ x, y: protoY, val: protoWeight, key: dim.key, label: dim.labelUk });
      });

      // Побудова SVG шляхів за методом кубічних кривих Безьє
      const buildPath = (pts: { x: number; y: number }[]) => {
        if (pts.length === 0) return '';
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          const cp1x = prev.x + (curr.x - prev.x) / 2;
          const cp1y = prev.y;
          const cp2x = prev.x + (curr.x - prev.x) / 2;
          const cp2y = curr.y;
          d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
        }
        return d;
      };

      const inputCurve = buildPath(inputPoints);
      const protoCurve = buildPath(protoPoints);

      const inputArea = `${inputCurve} L ${inputPoints[inputPoints.length - 1].x} ${originY} L ${inputPoints[0].x} ${originY} Z`;
      const protoArea = `${protoCurve} L ${protoPoints[protoPoints.length - 1].x} ${originY} L ${protoPoints[0].x} ${originY} Z`;

      return `
        <div class="sc-vectors-view">
          <!-- 1. Hero Card: Метрика косинусної подібності та статус -->
          <div class="sc-card sc-vector-hero">
            <div class="sc-vector-hero-top">
              <div class="sc-vector-sim-badge ${isIntentFormedForThis ? 'sc-badge-red' : isHighSimilarity ? 'sc-badge-amber' : 'sc-badge-blue'}">
                <span class="sc-sim-title">Схожість з еталоном</span>
                <span class="sc-sim-value">${similarityPercent}<span class="sc-sim-unit">%</span></span>
                <span class="sc-sim-caption">cos(θ) = ${similarity.toFixed(2)}</span>
              </div>
              <div class="sc-vector-status-block">
                <div class="sc-vector-status-title">
                  ${statusTitle}
                </div>
                <div class="sc-vector-status-sub">
                  ${statusSub}
                </div>
              </div>
            </div>

            <!-- Селектор еталонного вектора атаки -->
            <div class="sc-proto-selector">
              <span class="sc-proto-label">Еталон для порівняння</span>
              <div class="sc-proto-chips">
                ${telemetry.allPrototypes.map((p) => {
                  const isThisTriggered = Boolean(telemetry.hasFormedIntent && telemetry.intentType === p.id);
                  let shortName = p.labelUk;
                  if (p.id === 'MILITARY_SABOTAGE_RECRUITMENT' || /вербуван|диверс|розвід/i.test(p.labelUk)) {
                    shortName = 'Вербування / Диверсія';
                  } else if (p.id === 'ESCROW_DELIVERY_SCAM' || /ескроу|доставк|імітац/i.test(p.labelUk)) {
                    shortName = 'Ескроу-доставка';
                  } else if (p.id === 'PAYMENT_CREDENTIAL_THEFT' || /cvv|реквізит|платіжн|виманюван/i.test(p.labelUk)) {
                    shortName = 'Викрадення CVV';
                  }
                  return `
                    <button type="button" class="sc-chip sc-proto-chip ${p.id === currentSelectedProto ? 'active' : ''} ${isThisTriggered ? 'sc-chip-danger' : ''}" data-proto-id="${p.id}" aria-pressed="${p.id === currentSelectedProto}">
                      <span>${shortName}</span>
                      <span class="sc-chip-sim">${Math.round((p.similarity || 0) * 100)}%${isThisTriggered ? ' [ТРИГЕР]' : ''}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Контекст останнього відсканованого тексту -->
            <div class="sc-vector-raw-box">
              <span class="sc-vector-raw-label">Останнє проаналізоване повідомлення:</span>
              <div class="sc-vector-raw-text">«${telemetry.latestMessage ? (telemetry.latestMessage.length > 200 ? telemetry.latestMessage.substring(0, 200) + '...' : telemetry.latestMessage) : (telemetry.rawText ? (telemetry.rawText.length > 200 ? telemetry.rawText.substring(0, 200) + '...' : telemetry.rawText) : 'Немає даних')}»</div>
            </div>
            <p class="sc-vector-note">Схожість показує близькість ознак до еталона. Застосоване попередження або блокування відображається у вкладці «Огляд».</p>
          </div>

          <!-- 2. Візуальний SVG Графік Накладання Векторів -->
          <div class="sc-card sc-vector-graph-card">
            <div class="sc-graph-header">
              <div class="sc-graph-title-group">
                <span class="sc-card-title">Порівняння ознак</span>
                <span class="sc-graph-sub">${telemetry.dimensions.length} ознак · нормалізовані ваги від 0 до 1</span>
              </div>
              <div class="sc-graph-legend">
                <div class="sc-legend-item">
                  <span class="sc-legend-dot sc-dot-blue"></span>
                  <span>Повідомлення співрозмовника</span>
                </div>
                <div class="sc-legend-item">
                  <span class="sc-legend-dot sc-dot-red"></span>
                  <span>Обраний еталон</span>
                </div>
              </div>
            </div>

            <div class="sc-svg-wrapper">
              <svg class="sc-vector-svg" viewBox="0 0 ${graphWidth} ${graphHeight}" role="img" aria-label="Порівняння ваг повідомлення й обраного еталона; назви ознак наведені нижче">
                <defs>
                  <!-- Градієнт для вхідного повідомлення (Блакитний) -->
                  <linearGradient id="grad-input" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="var(--sanctuary-blue)" stop-opacity="0.30" />
                    <stop offset="100%" stop-color="var(--sanctuary-blue)" stop-opacity="0.02" />
                  </linearGradient>
                  <!-- Градієнт для еталона загрози (Червоний) -->
                  <linearGradient id="grad-proto" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="var(--sanctuary-red-ink)" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="var(--sanctuary-red-ink)" stop-opacity="0.02" />
                  </linearGradient>
                </defs>

                <!-- Горизонтальні лінії сітки (Grid) -->
                <line x1="${originX}" y1="${topY}" x2="${originX + usableWidth}" y2="${topY}" stroke="#E5E5EA" stroke-width="1" stroke-dasharray="2 3" />
                <text x="${originX - 8}" y="${topY + 3}" fill="var(--sanctuary-ink-secondary)" font-size="8.5" text-anchor="end">1.0</text>

                <line x1="${originX}" y1="${topY + usableHeight * 0.25}" x2="${originX + usableWidth}" y2="${topY + usableHeight * 0.25}" stroke="#E5E5EA" stroke-width="1" stroke-dasharray="2 3" />
                <text x="${originX - 8}" y="${topY + usableHeight * 0.25 + 3}" fill="var(--sanctuary-ink-secondary)" font-size="8.5" text-anchor="end">0.75</text>

                <line x1="${originX}" y1="${topY + usableHeight * 0.5}" x2="${originX + usableWidth}" y2="${topY + usableHeight * 0.5}" stroke="#E5E5EA" stroke-width="1" stroke-dasharray="2 3" />
                <text x="${originX - 8}" y="${topY + usableHeight * 0.5 + 3}" fill="var(--sanctuary-ink-secondary)" font-size="8.5" text-anchor="end">0.5</text>

                <line x1="${originX}" y1="${topY + usableHeight * 0.75}" x2="${originX + usableWidth}" y2="${topY + usableHeight * 0.75}" stroke="#E5E5EA" stroke-width="1" stroke-dasharray="2 3" />
                <text x="${originX - 8}" y="${topY + usableHeight * 0.75 + 3}" fill="var(--sanctuary-ink-secondary)" font-size="8.5" text-anchor="end">0.25</text>

                <!-- Базова лінія (Y = 0) -->
                <line x1="${originX}" y1="${originY}" x2="${originX + usableWidth}" y2="${originY}" stroke="#C7C7CC" stroke-width="1" />
                <text x="${originX - 8}" y="${originY + 3}" fill="var(--sanctuary-ink-secondary)" font-size="8.5" text-anchor="end">0.0</text>

                <!-- Вертикальні напрямні та осі -->
                ${inputPoints.map((pt) => `
                  <line x1="${pt.x}" y1="${topY}" x2="${pt.x}" y2="${originY}" stroke="#F2F2F7" stroke-width="1" />
                `).join('')}

                <!-- Заливка площі еталона загрози -->
                <path d="${protoArea}" fill="url(#grad-proto)" />
                <!-- Лінія кривої еталона загрози -->
                <path d="${protoCurve}" fill="none" stroke="var(--sanctuary-red-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

                <!-- Заливка площі вхідного повідомлення -->
                <path d="${inputArea}" fill="url(#grad-input)" />
                <!-- Лінія кривої вхідного повідомлення -->
                <path d="${inputCurve}" fill="none" stroke="var(--sanctuary-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

                <!-- Точки на графіку: Еталон загрози -->
                ${protoPoints.map(pt => `
                  <circle cx="${pt.x}" cy="${pt.y}" r="3" fill="var(--sanctuary-red-ink)" stroke="var(--sanctuary-surface)" stroke-width="1.2" />
                `).join('')}

                <!-- Точки на графіку: Вхідне повідомлення -->
                ${inputPoints.map(pt => `
                  <circle cx="${pt.x}" cy="${pt.y}" r="4" fill="var(--sanctuary-blue)" stroke="var(--sanctuary-surface)" stroke-width="1.8" />
                  ${pt.val >= 0.25 ? `<text x="${pt.x}" y="${Math.max(12, pt.y - 6)}" fill="var(--sanctuary-blue)" font-size="8" font-weight="700" text-anchor="middle">${Math.round(pt.val * 100)}%</text>` : ''}
                `).join('')}

                <!-- Підписи осей (X-Labels) -->
                ${inputPoints.map((pt, index) => `
                  <text x="${pt.x}" y="${originY + 18}" fill="var(--sanctuary-ink-secondary)" font-size="11" font-weight="500" text-anchor="middle">${index + 1}</text>
                `).join('')}
              </svg>
            </div>
          </div>

          <!-- 3. Деталізація за факторами (Поелементна матриця ваг) -->
          <div class="sc-card sc-dim-breakdown-card">
            <span class="sc-card-title">Ознаки повідомлення</span>
            <div class="sc-dim-grid">
              ${telemetry.dimensions.map((dim, index) => {
                const protoW = protoInfo.prototypeWeights[dim.key] !== undefined ? protoInfo.prototypeWeights[dim.key] : dim.prototypeWeight;
                const isDimensionMatched = dim.inputWeight >= 0.35 && protoW >= 0.40;
                return `
                  <div class="sc-dim-row ${isDimensionMatched ? 'matched' : ''}">
                    <div class="sc-dim-meta">
                      <span class="sc-dim-name"><span class="sc-dim-number">${index + 1}</span>${dim.labelUk}</span>
                      <div class="sc-dim-weights">
                        <span class="sc-val-in" title="Вхідне повідомлення">Вхід: ${(dim.inputWeight * 100).toFixed(0)}%</span>
                        <span class="sc-val-proto" title="Еталон загрози">Еталон: ${(protoW * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div class="sc-dim-bars">
                      <!-- Bar 1: Input -->
                      <div class="sc-bar-track">
                        <div class="sc-bar-fill sc-bar-blue" style="width: ${dim.inputWeight * 100}%;"></div>
                      </div>
                      <!-- Bar 2: Prototype -->
                      <div class="sc-bar-track">
                        <div class="sc-bar-fill sc-bar-red" style="width: ${protoW * 100}%;"></div>
                      </div>
                    </div>
                    ${dim.matchedTokens.length > 0 ? `
                      <div class="sc-dim-tokens">
                        ${dim.matchedTokens.map(t => `<span class="sc-dim-token-chip">${t}</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    };

    let tabBody = '';
    if (activeTab === 'overview') tabBody = renderOverviewTab();
    else if (activeTab === 'events') tabBody = renderEventsTab();
    else if (activeTab === 'ai') tabBody = renderAiTab();
    else if (activeTab === 'vectors') tabBody = renderVectorsTab();

    this.shadowRoot.innerHTML = `
      <style>
        ${DESIGN_TOKENS_CSS}
        ${AI_INSPECTOR_CSS}

        :host {
          all: initial;
          font-family: var(--font-sanctuary);
          color: var(--sanctuary-ink-primary);
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
          color-scheme: light;
          line-height: 1.5;
        }

        *, *:before, *:after {
          box-sizing: border-box;
        }

        /* 1. Pure Crystalline Ceramic Glass Container */
        .sc-window {
          container-type: inline-size;
          width: 100%;
          height: 100%;
          background: var(--sanctuary-canvas);
          backdrop-filter: blur(32px) saturate(180%);
          -webkit-backdrop-filter: blur(32px) saturate(180%);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: var(--radius-modal);
          box-shadow: var(--shadow-modal);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-size: 12.5px;
          color: var(--sanctuary-ink-primary);
        }

        /* 2. Apple Precision Titlebar */
        .sc-titlebar {
          background: var(--sanctuary-surface);
          padding: 12px 16px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: grab;
          user-select: none;
        }
        .sc-titlebar:active {
          cursor: grabbing;
        }
        .sc-brand-group {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .sc-brand-icon {
          width: 24px;
          height: 24px;
          border-radius: 7px;
          background: linear-gradient(135deg, var(--sanctuary-blue) 0%, #42A5F5 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--sanctuary-surface);
          box-shadow: 0 2px 6px rgba(0, 113, 227, 0.3);
        }
        .sc-brand-meta {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sc-brand-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          letter-spacing: -0.015em;
        }
        .sc-brand-pill {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          background: rgba(0, 0, 0, 0.05);
          color: var(--sanctuary-ink-secondary);
          border-radius: 9999px;
          letter-spacing: 0.02em;
        }

        .sc-win-controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .sc-tool-btn {
          width: var(--control-height);
          height: var(--control-height);
          border-radius: var(--radius-nested);
          border: 1px solid transparent;
          background: transparent;
          color: var(--sanctuary-ink-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sc-tool-btn:hover {
          background: rgba(0, 0, 0, 0.05);
          color: var(--sanctuary-ink-primary);
        }
        .sc-tool-btn:active {
          transform: scale(0.92);
        }
        .sc-tool-btn-close:hover {
          background: rgba(255, 59, 48, 0.12);
          color: var(--sanctuary-red-ink);
        }

        /* 3. Cupertino Segmented Tab Bar */
        .sc-tab-bar {
          display: flex;
          background: rgba(0, 0, 0, 0.04);
          border-radius: var(--radius-control);
          padding: 3px;
          margin: 10px 16px 4px 16px;
          gap: 3px;
        }
        .sc-tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 7px 4px;
          min-width: 0;
          min-height: var(--control-height);
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--sanctuary-ink-secondary);
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sc-tab-btn.active {
          background: var(--sanctuary-surface);
          color: var(--sanctuary-ink-primary);
          font-weight: 600;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }
        .sc-tab-btn.active svg { color: var(--sanctuary-blue); }
        .sc-tab-btn > svg { flex-shrink: 0; }
        .sc-tab-btn:hover:not(.active) {
          color: var(--sanctuary-ink-primary);
        }

        /* 4. Viewport Scroll Container */
        .sc-viewport {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 12px 16px 16px 16px;
        }
        .sc-viewport::-webkit-scrollbar {
          width: 5px;
        }
        .sc-viewport::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.12);
          border-radius: 9999px;
        }

        /* 5. Inset Cards */
        .sc-card {
          background: var(--sanctuary-surface);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: var(--radius-card);
          padding: var(--space-4);
          margin-bottom: 12px;
          box-shadow: var(--shadow-card);
        }

        /* Hero: The Swiss Loupe Dial */
        .sc-loupe-hero {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .sc-gauge-section {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .sc-gauge-container {
          position: relative;
          width: 78px;
          height: 78px;
          flex-shrink: 0;
        }
        .sc-gauge-svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        .sc-gauge-bg {
          fill: none;
          stroke: rgba(0, 0, 0, 0.06);
          stroke-width: 6.5;
        }
        .sc-gauge-progress {
          fill: none;
          stroke-width: 6.5;
          stroke-linecap: round;
          transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sc-gauge-text {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          line-height: 1.1;
        }
        .sc-gauge-value {
          font-size: 21px;
          font-weight: 700;
          color: var(--sanctuary-ink-primary);
          letter-spacing: -0.03em;
        }
        .sc-gauge-label {
          font-size: 8.5px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--sanctuary-ink-secondary);
          letter-spacing: 0.04em;
        }

        .sc-hero-meta {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .sc-site-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          letter-spacing: -0.015em;
        }
        .sc-subtext {
          font-size: 10.5px;
          color: var(--sanctuary-ink-secondary);
        }

        /* 4 Swiss Loupe Pillars */
        .sc-loupe-pillars {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          background: rgba(0, 0, 0, 0.025);
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: var(--radius-control);
          padding: 8px;
        }
        .sc-pillar-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px 6px;
        }
        .sc-pillar-label {
          font-size: 9.5px;
          color: var(--sanctuary-ink-secondary);
          font-weight: 500;
        }
        .sc-pillar-val {
          font-size: 11px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
        }
        .sc-val-green { color: var(--sanctuary-green-ink); }
        .sc-val-blue { color: var(--sanctuary-blue); }
        .sc-val-amber { color: var(--sanctuary-amber-ink); }
        .sc-val-indigo { color: #5E5CE6; }

        /* Badges */
        .sc-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 9999px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.01em;
          width: fit-content;
        }
        .sc-badge-green {
          background: rgba(52, 199, 89, 0.12);
          border: 1px solid rgba(52, 199, 89, 0.25);
          color: var(--sanctuary-green-ink);
        }
        .sc-badge-amber {
          background: rgba(255, 149, 0, 0.12);
          border: 1px solid rgba(255, 149, 0, 0.25);
          color: var(--sanctuary-amber-ink);
        }
        .sc-badge-red {
          background: rgba(255, 59, 48, 0.10);
          border: 1px solid rgba(255, 59, 48, 0.22);
          color: var(--sanctuary-red-ink);
        }
        .sc-badge-blue {
          background: rgba(0, 113, 227, 0.10);
          border: 1px solid rgba(0, 113, 227, 0.20);
          color: var(--sanctuary-blue);
        }

        /* Verdict Card */
        .sc-verdict-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sc-verdict-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sc-card-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
        }
        .sc-verdict-text {
          font-size: 11.5px;
          color: var(--sanctuary-ink-secondary);
          line-height: 1.45;
          margin: 0;
        }
        .sc-triggers-wrap {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .sc-triggers-label {
          font-size: 10.5px;
          font-weight: 600;
          color: var(--sanctuary-ink-secondary);
        }
        .sc-triggers-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .sc-trigger-chip {
          font-size: 10px;
          padding: 2px 7px;
          background: rgba(0, 0, 0, 0.04);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 5px;
          color: var(--sanctuary-ink-primary);
        }

        .sc-action-row {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }
        .sc-btn {
          min-height: var(--control-height);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 500;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: var(--sanctuary-surface);
          color: var(--sanctuary-ink-primary);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sc-btn:hover {
          background: rgba(0, 0, 0, 0.03);
          border-color: rgba(0, 0, 0, 0.16);
        }
        .sc-btn:active {
          transform: scale(0.97);
        }
        .sc-btn-pill {
          border-radius: 9999px;
        }
        .sc-btn-ghost {
          background: transparent;
          border: none;
          color: var(--sanctuary-blue);
          font-size: 10.5px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 5px;
          border-radius: 4px;
        }
        .sc-btn-ghost:hover {
          background: rgba(0, 113, 227, 0.08);
        }

        /* Toolbar & Search */
        .sc-filter-toolbar {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 0;
        }
        .sc-events-controls {
          background: var(--sanctuary-surface);
          border: 1px solid rgba(0, 0, 0, 0.07);
          border-radius: 14px;
          padding: 12px;
          margin: 10px 0 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.025);
        }
        .sc-events-controls-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
        .sc-events-heading { font-size: 13px; font-weight: 650; letter-spacing: -0.015em; color: var(--sanctuary-ink-primary); }
        .sc-events-count { margin-top: 1px; color: var(--sanctuary-ink-secondary); font-size: 10.5px; }
        }
        .sc-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--sanctuary-surface);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 9px;
          padding: 6px 10px;
        }
        .sc-search-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 11.5px;
          color: var(--sanctuary-ink-primary);
          outline: none;
        }
        .sc-search-input::placeholder {
          color: var(--sanctuary-ink-secondary);
        }
        .sc-search-clear {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          display: flex;
        }
        .sc-filter-chips {
          display: flex;
          gap: 4px;
        }
        .sc-chip {
          padding: 5px 9px;
          border-radius: 9999px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(0, 0, 0, 0.03);
          color: var(--sanctuary-ink-secondary);
          font-size: 10.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-height: 28px;
        }
        .sc-chip span { font-size: 9px; opacity: 0.72; font-variant-numeric: tabular-nums; }
        .sc-chip.active {
          background: var(--sanctuary-blue-bg);
          color: var(--sanctuary-blue);
          border-color: var(--sanctuary-blue-bd);
        }
        .sc-chip.sc-chip-danger {
          border-color: rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.08);
          color: var(--sanctuary-red-ink);
        }
        .sc-chip.sc-chip-danger.active {
          background: var(--sanctuary-red-bg);
          color: var(--sanctuary-red-ink);
          border-color: var(--sanctuary-red-bd);
        }

        /* Events Timeline */
        .sc-event-card {
          background: var(--sanctuary-surface);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 12px;
          padding: 11px 12px;
          margin-bottom: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          transition: all 0.15s ease;
        }
        .sc-event-card:hover {
          border-color: rgba(0, 0, 0, 0.11);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
        .sc-event-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .sc-event-preview {
          margin: 0;
          color: var(--sanctuary-ink-secondary);
          font-size: 11px;
          line-height: 1.5;
          overflow-wrap: anywhere;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .sc-event-details { margin-top: 8px; border-top: 1px solid rgba(0, 0, 0, 0.06); padding-top: 7px; }
        .sc-event-details summary { cursor: pointer; color: var(--sanctuary-blue); font-size: 10.5px; font-weight: 550; }
        .sc-event-copy { margin-top: 6px; }
        .sc-events-empty { margin: 18px 0; border: 1px dashed rgba(0, 0, 0, 0.12); border-radius: 14px; background: var(--sanctuary-surface); }
        .sc-event-title-wrap {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .sc-status-dot {
          width: 6.5px;
          height: 6.5px;
          border-radius: 9999px;
          flex-shrink: 0;
        }
        .sc-event-badge {
          font-size: 9.5px;
          font-weight: 700;
          padding: 1.5px 6px;
          border-radius: 5px;
          font-family: var(--font-mono, monospace);
          letter-spacing: 0.02em;
        }
        .sc-badge-ai {
          background: rgba(0, 113, 227, 0.08);
          color: var(--sanctuary-blue);
        }
        .sc-badge-form {
          background: rgba(52, 199, 89, 0.10);
          color: var(--sanctuary-green-ink);
        }
        .sc-badge-risk { background: var(--sanctuary-red-bg); color: var(--sanctuary-red-ink); }
        .sc-badge-ctx {
          background: rgba(94, 92, 230, 0.08);
          color: #5E5CE6;
        }
        .sc-badge-vault {
          background: rgba(175, 82, 222, 0.08);
          color: #AF52DE;
        }
        .sc-badge-log {
          background: rgba(0, 0, 0, 0.04);
          color: var(--sanctuary-ink-secondary);
        }
        .sc-event-title {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          letter-spacing: -0.01em;
        }
        .sc-event-right {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sc-event-time {
          font-size: 10px;
          color: var(--sanctuary-ink-secondary);
          font-family: var(--font-mono, monospace);
        }
        .sc-copy-icon-btn {
          background: transparent;
          border: none;
          color: var(--sanctuary-ink-secondary);
          cursor: pointer;
          padding: 1px 3px;
          border-radius: 4px;
        }
        .sc-copy-icon-btn:hover {
          color: var(--sanctuary-blue);
          background: rgba(0, 113, 227, 0.08);
        }
        .sc-event-code {
          margin: 0;
          background: var(--sanctuary-canvas);
          border: 1px solid rgba(0, 0, 0, 0.04);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 10px;
          font-family: var(--font-mono, monospace);
          color: var(--sanctuary-ink-primary);
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }

        /* Empty states */
        .sc-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 32px 16px;
          gap: 6px;
        }
        .sc-empty-title {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
        }
        .sc-empty-sub {
          font-size: 11px;
          color: var(--sanctuary-ink-secondary);
          line-height: 1.4;
        }

        @keyframes sc-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .sc-spin {
          display: inline-block;
          animation: sc-spin 1.2s linear infinite;
        }

        /* Spectrum uses the same cards, controls and type scale as every tab. */
        .sc-vectors-view { display: flex; flex-direction: column; gap: var(--space-3); }
        .sc-vectors-view > .sc-card { margin-bottom: 0; }
        .sc-vector-hero, .sc-vector-graph-card, .sc-dim-breakdown-card {
          display: flex; flex-direction: column; gap: var(--space-3);
        }
        .sc-vector-hero-top { display: flex; align-items: flex-start; gap: var(--space-3); }
        .sc-vector-sim-badge {
          display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
          padding: var(--space-3); border-radius: var(--radius-control); min-width: 116px; flex-shrink: 0;
        }
        .sc-sim-title, .sc-sim-caption { font-size: var(--text-caption); line-height: 1.4; }
        .sc-sim-value { font-size: 30px; line-height: 1.2; font-weight: 650; font-variant-numeric: tabular-nums; }
        .sc-sim-unit { font-size: 16px; font-weight: 500; margin-left: 2px; }
        .sc-vector-status-block { min-width: 0; flex: 1; padding-top: 2px; }
        .sc-vector-status-title { font-size: var(--text-title); font-weight: 600; margin-bottom: var(--space-1); }
        .sc-vector-status-sub, .sc-vector-note { font-size: var(--text-caption); color: var(--sanctuary-ink-secondary); line-height: 1.5; }
        .sc-vector-note { margin: 0; }
        .sc-proto-selector { display: flex; flex-direction: column; gap: var(--space-2); }
        .sc-proto-label, .sc-vector-raw-label { font-size: var(--text-caption); font-weight: 600; color: var(--sanctuary-ink-secondary); }
        .sc-proto-chips { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-2); }
        .sc-proto-chip { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); text-align: left; padding: 8px 10px; border-radius: var(--radius-control); min-height: var(--control-height); }
        .sc-chip-sim { flex-shrink: 0; font-size: var(--text-caption); font-weight: 600; font-variant-numeric: tabular-nums; }
        .sc-vector-raw-box { background: var(--sanctuary-surface-subtle); border: 1px solid var(--sanctuary-hairline); border-radius: var(--radius-control); padding: var(--space-3); }
        .sc-vector-raw-label { display: block; margin-bottom: var(--space-1); }
        .sc-vector-raw-text { font-size: var(--text-body); color: var(--sanctuary-ink-primary); line-height: 1.5; overflow-wrap: anywhere; }
        .sc-graph-header, .sc-graph-title-group { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); }
        .sc-graph-sub { font-size: var(--text-caption); color: var(--sanctuary-ink-secondary); }
        .sc-graph-legend { display: flex; flex-wrap: wrap; gap: var(--space-3); font-size: var(--text-caption); color: var(--sanctuary-ink-secondary); margin-top: var(--space-1); }
        .sc-legend-item { display: flex; align-items: center; gap: 6px; }
        .sc-legend-dot { width: 8px; height: 8px; border-radius: var(--radius-pill); }
        .sc-dot-blue, .sc-bar-blue { background: var(--sanctuary-blue); }
        .sc-dot-red, .sc-bar-red { background: var(--sanctuary-red-ink); }
        .sc-svg-wrapper { background: var(--sanctuary-surface-subtle); border: 1px solid var(--sanctuary-hairline); border-radius: var(--radius-control); padding: var(--space-2); overflow-x: auto; }
        .sc-vector-svg { display: block; width: 100%; min-width: 440px; height: auto; }
        .sc-dim-grid { display: flex; flex-direction: column; gap: var(--space-2); }
        .sc-dim-row { background: var(--sanctuary-surface-subtle); border: 1px solid var(--sanctuary-hairline); border-radius: var(--radius-control); padding: 10px 12px; }
        .sc-dim-row.matched { background: var(--sanctuary-red-bg); border-color: var(--sanctuary-red-bd); }
        .sc-dim-meta { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--space-1); margin-bottom: 6px; }
        .sc-dim-name { display: flex; gap: 6px; align-items: center; font-size: var(--text-body); font-weight: 600; color: var(--sanctuary-ink-primary); }
        .sc-dim-number { color: var(--sanctuary-ink-secondary); font-size: var(--text-caption); font-weight: 500; min-width: 14px; font-variant-numeric: tabular-nums; }
        .sc-dim-weights { display: flex; gap: var(--space-2); font-size: var(--text-caption); font-variant-numeric: tabular-nums; }
        .sc-val-in { color: var(--sanctuary-blue); }
        .sc-val-proto { color: var(--sanctuary-red-ink); }
        .sc-dim-bars { display: flex; flex-direction: column; gap: var(--space-1); }
        .sc-bar-track { height: 4px; background: var(--sanctuary-surface-active); border-radius: var(--radius-pill); overflow: hidden; }
        .sc-bar-fill { height: 100%; border-radius: var(--radius-pill); transition: width 0.2s ease; }
        .sc-dim-tokens { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: 6px; }
        .sc-dim-token-chip { font-size: var(--text-caption); padding: 2px 6px; background: var(--sanctuary-surface); color: var(--sanctuary-ink-secondary); border-radius: var(--radius-micro); border: 1px solid var(--sanctuary-hairline); }

        @container (max-width: 380px) {
          .sc-tab-btn { gap: 3px; font-size: 11px; }
          .sc-tab-btn > svg { display: none; }
          .sc-brand-pill { display: none; }
          .sc-vector-hero-top { flex-direction: column; }
          .sc-vector-sim-badge { width: 100%; }
          .sc-action-row { flex-wrap: wrap; }
        }
      </style>

      <div class="sc-window">
        <!-- 1. Apple Precision Titlebar -->
        <div class="sc-titlebar" id="drag-handle">
          <div class="sc-brand-group">
            <div class="sc-brand-icon" title="С.О.В.А." style="background: transparent; padding: 0; overflow: hidden; border-radius: 6px;">
              <img src="${typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('logo.png') : '/logo.png'}" alt="Logo" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
            </div>
            <div class="sc-brand-meta">
              <span class="sc-brand-name">С.О.В.А.</span>
              <span class="sc-brand-pill">Аналітичний модуль XAI</span>
            </div>
          </div>
          <div class="sc-win-controls">
            <button type="button" class="sc-tool-btn" id="btn-export-json" title="Експортувати звіт у JSON">
              ${ICONS.download(13)}
            </button>
            <button type="button" class="sc-tool-btn" id="btn-clear-all" title="Очистити події">
              ${ICONS.trash(13)}
            </button>
            <button type="button" class="sc-tool-btn" id="btn-minimize" title="Згорнути у Dynamic Island">
              ${ICONS.minimize(13)}
            </button>
            <button type="button" class="sc-tool-btn sc-tool-btn-close" id="btn-close-window" title="Закрити вікно">
              ${ICONS.close(13)}
            </button>
          </div>
        </div>

        <!-- 2. Cupertino Segmented Navigation -->
        <nav class="sc-tab-bar" aria-label="Розділи діагностики">
          <button type="button" class="sc-tab-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview" aria-pressed="${activeTab === 'overview'}">
            ${ICONS.loupe(12)}
            <span>Огляд</span>
            ${fpInfo.status === 'FP_CANDIDATE' ? '<span class="sc-badge sc-badge-amber" style="padding:1px 5px; font-size:8.5px;">FP?</span>' : ''}
          </button>
          <button type="button" class="sc-tab-btn ${activeTab === 'events' ? 'active' : ''}" data-tab="events" aria-pressed="${activeTab === 'events'}">
            ${ICONS.terminal(12)}
            <span>Події (${logs.length})</span>
          </button>
          <button type="button" class="sc-tab-btn ${activeTab === 'ai' ? 'active' : ''}" data-tab="ai" aria-pressed="${activeTab === 'ai'}">
            ${ICONS.cpu(12)}
            <span>ШІ (${aiCount})</span>
          </button>
          <button type="button" class="sc-tab-btn ${activeTab === 'vectors' ? 'active' : ''}" data-tab="vectors" aria-pressed="${activeTab === 'vectors'}" title="Векторний спектр">
            ${ICONS.activity(12)}
            <span>Спектр</span>
            ${this.state.vectorTelemetry ? `<span class="sc-badge ${this.state.vectorTelemetry.hasFormedIntent ? 'sc-badge-red' : this.state.vectorTelemetry.cosineSimilarity >= 0.4 ? 'sc-badge-amber' : 'sc-badge-blue'}" style="padding:1px 5px; font-size:8.5px;">${Math.round(this.state.vectorTelemetry.cosineSimilarity * 100)}%</span>` : ''}
          </button>
        </nav>

        <!-- 3. Viewport Content -->
        <div class="sc-viewport">
          ${tabBody}
        </div>
      </div>
    `;

    this.bindEvents();
    const nextViewport = this.shadowRoot.querySelector<HTMLElement>('.sc-viewport');
    if (nextViewport) nextViewport.scrollTop = followEvents ? nextViewport.scrollHeight : scrollTop;
    const nextFocus = focusedId ? this.shadowRoot.getElementById(focusedId)
      : Array.from(this.shadowRoot.querySelectorAll<HTMLElement>('[data-tab], [data-proto-id], [data-ai-check]'))
        .find((control) => (focusedTab && control.dataset.tab === focusedTab)
          || (focusedPrototype && control.dataset.protoId === focusedPrototype)
          || (focusedCheck && control.dataset.aiCheck === focusedCheck));
    nextFocus?.focus({ preventScroll: true });
    if (caret && nextFocus instanceof HTMLInputElement && caret[0] !== null && caret[1] !== null)
      nextFocus.setSelectionRange(caret[0], caret[1]);
    if (this.reviewSnapshot && (this.reviewSnapshot.revision !== this.aiHistory.revision
      || this.reviewSnapshot.eventRevision !== this.eventRevision)) {
      const badge = this.shadowRoot.getElementById('sc-new-updates');
      if (badge) badge.textContent = 'Є нові дані · Оновити перегляд';
    }
  }

  // Рендеринг компактного віджета (Dynamic Island Pill у світлій темі)
  private static renderMinimized() {
    if (!this.shadowRoot) return;

    const { severity, score, logs, threatMitigated } = this.state;
    const riskColor =
      severity === 'CRITICAL' || severity === 'HIGH'
        ? '#FF3B30'
        : severity === 'MEDIUM'
        ? '#FF9500'
        : '#34C759';

    this.shadowRoot.innerHTML = `
      <style>
        ${DESIGN_TOKENS_CSS}
        ${AI_INSPECTOR_CSS}

        :host {
          all: initial;
          font-family: var(--font-sanctuary);
        }
        .sc-pill {
          height: 34px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 9999px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--sanctuary-ink-primary);
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease;
          user-select: none;
        }
        .sc-pill:hover {
          transform: scale(1.03);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
        }
        .sc-pill:active {
          transform: scale(0.97);
        }
        .sc-pill-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sc-pill-text {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          letter-spacing: -0.01em;
        }
        .sc-pill-badge {
          font-size: 10px;
          font-weight: 700;
          background: ${riskColor === '#34C759' ? 'rgba(52, 199, 89, 0.14)' : riskColor === '#FF9500' ? 'rgba(255, 149, 0, 0.14)' : 'rgba(255, 59, 48, 0.14)'};
          color: ${riskColor};
          border: 1px solid ${riskColor === '#34C759' ? 'rgba(52, 199, 89, 0.28)' : riskColor === '#FF9500' ? 'rgba(255, 149, 0, 0.28)' : 'rgba(255, 59, 48, 0.28)'};
          padding: 1px 7px;
          border-radius: 9999px;
          font-family: var(--font-mono, monospace);
        }
        .sc-pill-count {
          font-size: 10.5px;
          color: var(--sanctuary-ink-secondary);
          font-family: var(--font-mono, monospace);
          display: flex;
          align-items: center;
          gap: 4px;
        }
      </style>
      <div class="sc-pill" id="btn-restore" title="Відкрити Аналітичний модуль XAI">
        <span class="sc-pill-icon">${ICONS.loupe(13, riskColor)}</span>
        <span class="sc-pill-text">Аналітичний модуль XAI</span>
        <span class="sc-pill-badge">${score}/100${threatMitigated ? ' (Пік)' : ''}</span>
        <span class="sc-pill-count">
          <span>${logs.length}</span>
          ${ICONS.expand(11, '#86868B')}
        </span>
      </div>
    `;

    this.shadowRoot.getElementById('btn-restore')?.addEventListener('click', () => {
      this.state.isMinimized = false;
      this.render();
    });
  }

  private static bindEvents() {
    if (!this.shadowRoot) return;

    this.shadowRoot.getElementById('btn-review-pause')?.addEventListener('click', () => {
      this.reviewSnapshot = this.reviewSnapshot ? null : { logs: structuredClone(this.state.logs),
        checks: this.getAIChecks(), revision: this.aiHistory.revision,
        eventRevision: this.eventRevision,
        protection: this.state.activeDecision ? structuredClone(this.state.activeDecision) : null };
      this.render(true);
    });
    this.shadowRoot.getElementById('sc-new-updates')?.addEventListener('click', () => {
      this.reviewSnapshot = null;
      this.render(true);
    });
    this.shadowRoot.getElementById('btn-ai-latest')?.addEventListener('click', () => {
      this.selectedCheckId = null;
      this.render(true);
    });
    this.shadowRoot.getElementById('sc-ai-scope')?.addEventListener('change', (event) => {
      this.aiScope = (event.target as HTMLSelectElement).value as 'current' | 'all';
      this.selectedCheckId = null;
      this.render(true);
    });
    this.shadowRoot.querySelectorAll<HTMLElement>('[data-ai-check], [data-ai-open]').forEach(button => {
      button.addEventListener('click', () => {
        this.selectedCheckId = button.dataset.aiCheck || button.dataset.aiOpen || null;
        if (button.dataset.aiOpen) { this.state.activeTab = 'ai'; this.aiScope = 'all'; }
        this.render(true);
      });
    });
    this.shadowRoot.querySelectorAll<HTMLDetailsElement>('[data-ai-section]').forEach(details => {
      details.addEventListener('toggle', () => {
        if (!details.isConnected) return;
        const key = details.dataset.aiSection!;
        if (details.open) this.openAISections.add(key); else this.openAISections.delete(key);
      });
    });

    // Window dragging handle
    const handle = this.shadowRoot.getElementById('drag-handle');
    handle?.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button, input, select, a, .sc-win-controls')) {
        return;
      }
      this.isDragging = true;
      if (this.container) {
        this.offsetX = e.clientX - this.container.getBoundingClientRect().left;
        this.offsetY = e.clientY - this.container.getBoundingClientRect().top;
      }
    });

    // Window controls
    this.shadowRoot.getElementById('btn-close-window')?.addEventListener('click', () => {
      this.hide();
      try {
        if (typeof chrome !== 'undefined') {
          chrome.storage?.local?.set({ debugModeEnabled: false });
          chrome.runtime?.sendMessage?.({ type: 'SET_DEBUG_MODE', enabled: false }).catch?.(() => {});
        }
      } catch {}
    });

    this.shadowRoot.getElementById('btn-minimize')?.addEventListener('click', () => {
      this.state.isMinimized = true;
      this.render(true);
    });

    this.shadowRoot.getElementById('btn-clear-all')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      if (btn) {
        btn.style.transform = 'scale(0.88)';
        setTimeout(() => {
          btn.style.transform = '';
        }, 140);
      }
      this.clear();
    });

    this.shadowRoot.getElementById('btn-export-json')?.addEventListener('click', (e) => {
      const json = this.exportDiagnosticReport();
      this.copyToClipboard(json, e.currentTarget as HTMLElement, 'Звіт скопійовано!');
    });

    // Tabs switching
    this.shadowRoot.querySelectorAll('.sc-tab-btn').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tab = (tabBtn as HTMLElement).dataset.tab as NeuromonitorTab;
        if (tab) {
          this.state.activeTab = tab;
          this.render(true);
        }
      });
    });

    // Quick Actions
    this.shadowRoot.getElementById('btn-copy-fp-report')?.addEventListener('click', (e) => {
      const json = this.exportDiagnosticReport();
      this.copyToClipboard(json, e.currentTarget as HTMLElement, 'Скопійовано!');
    });

    this.shadowRoot.getElementById('btn-quick-whitelist')?.addEventListener('click', async (e) => {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (host) {
        const btn = e.currentTarget as HTMLElement;
        try {
          await UserWhitelistManager.allowDomain(host);
          this.log('Білий список', `Домен ${host} додано до довірених через оверлей`, '#34C759');
          if (btn) btn.innerHTML = `${ICONS.check(12, '#248A3D')} <span>Додано!</span>`;
        } catch {
          window.postMessage({ type: 'THREAT_SHIELD_ADD_WHITELIST', host }, '*');
          if (btn) btn.innerHTML = `${ICONS.check(12, '#248A3D')} <span>Додано!</span>`;
        }
      }
    });

    this.shadowRoot.getElementById('btn-quick-reset-session')?.addEventListener('click', (e) => {
      window.postMessage({ type: 'THREAT_SHIELD_CLEAR_CONTEXT' }, '*');
      this.resetSessionRisk();
      this.log('Система', 'Користувач примусово скинув стан тривоги', '#34C759');
      const btn = e.currentTarget as HTMLElement;
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = `${ICONS.check(12, '#248A3D')} <span>Скинуто!</span>`;
        setTimeout(() => {
          btn.innerHTML = orig;
        }, 1400);
      }
    });

    // Event Console Filters
    const searchInput = this.shadowRoot.getElementById('sc-input-search') as HTMLInputElement | null;
    searchInput?.addEventListener('input', (e) => {
      this.state.filterSearch = (e.target as HTMLInputElement).value;
      this.render(true);
    });

    this.shadowRoot.getElementById('btn-clear-search')?.addEventListener('click', () => {
      this.state.filterSearch = '';
      this.render(true);
      const newInput = this.shadowRoot?.getElementById('sc-input-search') as HTMLInputElement | null;
      newInput?.focus();
    });

    this.shadowRoot.getElementById('btn-reset-event-filters')?.addEventListener('click', () => {
      this.state.filterSearch = '';
      this.state.filterCategory = 'ALL';
      this.render(true);
    });

    this.shadowRoot.querySelectorAll('.sc-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const cat = (chip as HTMLElement).dataset.cat as NeuromonitorCategoryFilter;
        if (cat) {
          this.state.filterCategory = cat;
          this.render(true);
        }
      });
    });

    this.shadowRoot.querySelectorAll('.sc-proto-chip').forEach((protoBtn) => {
      protoBtn.addEventListener('click', () => {
        const protoId = (protoBtn as HTMLElement).dataset.protoId;
        if (protoId) {
          this.state.selectedPrototypeId = protoId;
          this.render(true);
        }
      });
    });

    // Copy buttons
    this.shadowRoot.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = (btn as HTMLElement).dataset.copy;
        if (raw) {
          const decoded = decodeURIComponent(raw);
          this.copyToClipboard(decoded, btn as HTMLElement, 'Скопійовано');
        }
      });
    });

  }

  private static setupDrag() {
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging && this.container) {
        const rect = this.container.getBoundingClientRect();
        const minX = 8;
        const maxX = typeof window !== 'undefined' ? Math.max(8, window.innerWidth - rect.width - 8) : 800;
        const minY = 8;
        const maxY = typeof window !== 'undefined' ? Math.max(8, window.innerHeight - rect.height - 8) : 600;

        const newX = Math.max(minX, Math.min(maxX, e.clientX - this.offsetX));
        const newY = Math.max(minY, Math.min(maxY, e.clientY - this.offsetY));

        this.customPos = { x: newX, y: newY };

        this.container.style.left = `${newX}px`;
        this.container.style.top = `${newY}px`;
        this.container.style.right = 'auto';
        this.container.style.bottom = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.container && this.container.style.display !== 'none') {
        if (!this.state.isMinimized) {
          this.state.isMinimized = true;
          this.render();
        }
      }
    });
  }
}
