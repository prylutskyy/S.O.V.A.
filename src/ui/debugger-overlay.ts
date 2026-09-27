import { UserWhitelistManager } from '../core/user-whitelist';
import { DESIGN_TOKENS_CSS } from './design-tokens';

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
    formDetails?: string;
    rawResponse?: string;
  };
  expanded?: boolean;
}

export type NeuromonitorTab = 'overview' | 'events' | 'ai';
export type NeuromonitorUserMode = 'user' | 'dev';
export type NeuromonitorCategoryFilter = 'ALL' | 'AI' | 'FORM' | 'RISK';

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
  code: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
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
};

export class DebuggerOverlay {
  private static container: HTMLElement | null = null;
  private static shadowRoot: ShadowRoot | null = null;

  private static state = {
    sessionId: null as string | null,
    severity: 'LOW' as string,
    score: 0,
    activeTab: 'overview' as NeuromonitorTab,
    userMode: 'dev' as NeuromonitorUserMode,
    filterCategory: 'ALL' as NeuromonitorCategoryFilter,
    filterSearch: '',
    isMinimized: false,
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
    if (this.container) {
      this.container.style.display = 'block';
      this.applyContainerGeometry();
      return;
    }

    this.container = document.createElement('div');
    this.container.id = 'threatshield-neuro-monitor';
    this.container.className = 'sanctuary-core-root';
    this.applyContainerGeometry();

    this.shadowRoot = this.container.attachShadow({ mode: 'open' });
    document.body.appendChild(this.container);

    this.setupDrag();
    this.render();
  }

  private static applyContainerGeometry() {
    if (!this.container) return;

    if (this.state.isMinimized) {
      if (this.container.style.width && this.container.style.width !== 'auto') {
        this.savedDimensions = {
          width: this.container.style.width,
          height: this.container.style.height || '640px',
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
          : '480px');
      const currentHeight =
        this.savedDimensions?.height ||
        (this.container.style.height && this.container.style.height !== 'auto'
          ? this.container.style.height
          : '640px');

      const baseStyles: Partial<CSSStyleDeclaration> = {
        position: 'fixed',
        width: currentWidth,
        height: currentHeight,
        minWidth: '400px',
        minHeight: '520px',
        maxWidth: '92vw',
        maxHeight: '92vh',
        zIndex: '2147483647',
        display: 'block',
        resize: 'both',
        overflow: 'hidden',
        borderRadius: '20px',
        boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12)',
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
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  public static clear() {
    this.state.logs = [];
    this.setSession(null);
    this.render();
  }

  public static setSession(id: string | null, severity: string = 'LOW') {
    this.state.sessionId = id;
    this.state.severity = severity;
    if (severity === 'CRITICAL') this.state.score = 100;
    else if (severity === 'HIGH') this.state.score = 75;
    else if (severity === 'MEDIUM') this.state.score = 50;
    else if (severity === 'LOW' && id) this.state.score = 25;
    else this.state.score = 0;

    this.render();
  }

  public static log(
    stepKey: string,
    data: any,
    customColor?: string,
    broadcast: boolean = true,
    isAi: boolean = false,
    aiContext?: {
      systemPrompt?: string;
      contextRules?: string;
      textSent?: string;
      raisedFlags?: string[];
      formDetails?: string;
      rawResponse?: string;
      chatDialogue?: string;
    },
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

    this.show();

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
    const color = customColor || '#30D158'; // Apple Emerald default

    const isStepAi =
      cleanStepKey.toLowerCase().includes('ai') ||
      cleanStepKey.toLowerCase().includes('llm') ||
      cleanStepKey.toLowerCase().includes('ші');
    const isForm =
      cleanStepKey.toLowerCase().includes('форма') ||
      cleanStepKey.toLowerCase().includes('form') ||
      cleanStepKey.toLowerCase().includes('поле');

    const cleanData = typeof data === 'string' ? this.stripEmoji(data) : data;

    const existingIndex = this.state.logs.findIndex((l) => l.stepKey === cleanStepKey);
    if (existingIndex >= 0) {
      this.state.logs[existingIndex] = {
        ...this.state.logs[existingIndex],
        data: cleanData,
        color,
        time,
      };
    } else {
      this.state.logs.push({
        id: Math.random().toString(36).substring(7),
        stepKey: cleanStepKey,
        data: cleanData,
        color,
        time,
        isAi: isStepAi,
        isForm,
        expanded: false,
      });
    }

    this.render();
  }

  public static logAI(
    stepKey: string,
    data: any,
    customColor?: string,
    aiContext?: {
      systemPrompt?: string;
      contextRules?: string;
      textSent?: string;
      chatDialogue?: string;
      raisedFlags?: string[];
      formDetails?: string;
      rawResponse?: string;
    },
    logId?: string
  ): string {
    this.show();

    const cleanStepKey = this.stripEmoji(stepKey);
    const cleanData = typeof data === 'string' ? this.stripEmoji(data) : data;

    const time = new Date().toLocaleTimeString();
    const color = customColor || '#0A84FF'; // Apple Sapphire default
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
        expanded: false,
      });
    }

    if (this.state.sessionId) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          const effectiveContext =
            targetIndex >= 0 ? this.state.logs[targetIndex].aiContext : aiContext;
          chrome.runtime.sendMessage({
            type: 'BROADCAST_LOG',
            payload: {
              sessionId: this.state.sessionId,
              stepKey: cleanStepKey,
              data: cleanData,
              customColor: color,
              isAi: true,
              aiContext: effectiveContext,
              logId: currentId,
            },
          });
        }
      } catch {}
    }

    this.render();
    return currentId;
  }

  // Аудит хибних спрацьовувань (False Positive Inspector)
  private static assessFalsePositive() {
    const { score, severity, logs } = this.state;

    // 1. Пошук тригерів
    const triggersLog = logs.find((l) => l.stepKey.includes('Спрацьовані Тригери'));
    let triggers: string[] = [];
    if (triggersLog) {
      if (Array.isArray(triggersLog.data)) triggers = triggersLog.data.map((t) => this.stripEmoji(String(t)));
      else if (typeof triggersLog.data === 'string') triggers = [this.stripEmoji(triggersLog.data)];
    }

    // 2. Пошук останнього завершеного аналізу ШІ
    let lastAiVerdict: { isScam: boolean; text: string; confidence?: number } | null = null;
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i];
      if (l.isAi && !l.isPending && typeof l.data === 'string') {
        const textLower = l.data.toLowerCase();
        if (textLower.includes('спростовано') || textLower.includes('безпечно') || textLower.includes('clean')) {
          const confMatch = l.data.match(/Впевненість:\s*(\d+)%/);
          lastAiVerdict = {
            isScam: false,
            text: l.data,
            confidence: confMatch ? parseInt(confMatch[1], 10) : 90,
          };
          break;
        } else if (textLower.includes('скам') || textLower.includes('scam') || textLower.includes('підтверджено')) {
          const confMatch = l.data.match(/Впевненість:\s*(\d+)%/);
          lastAiVerdict = {
            isScam: true,
            text: l.data,
            confidence: confMatch ? parseInt(confMatch[1], 10) : 85,
          };
          break;
        }
      }
    }

    // 3. Аналіз розбіжності (Discrepancy)
    const isHeuristicRisk = score >= 50 || severity === 'HIGH' || severity === 'CRITICAL';
    const isAiDisproved = lastAiVerdict !== null && !lastAiVerdict.isScam;
    const isAiConfirmed = lastAiVerdict !== null && lastAiVerdict.isScam;

    if (isHeuristicRisk && isAiDisproved) {
      return {
        status: 'FP_CANDIDATE',
        badgeIcon: ICONS.alertTriangle(12, '#FF9F0A'),
        badgeText: 'РОЗБІЖНІСТЬ: ЙМОВІРНИЙ FALSE POSITIVE',
        badgeClass: 'sc-badge-amber',
        explanation: `Евристичні тригери нарахували ${score}/100 балів, але локальний ШІ-Арбітр Gemini Nano спростував шахрайство (Впевненість: ${lastAiVerdict?.confidence}%). Можливе хибне блокування на легітимному сервісі.`,
        recommendation:
          'Рекомендується перевірити акредитацію цільового платіжного домену або додати сайт до списку довірених.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: `Безпечно (${lastAiVerdict?.confidence}%)`,
        triggers,
      };
    } else if (isHeuristicRisk && isAiConfirmed) {
      return {
        status: 'CONFIRMED_THREAT',
        badgeIcon: ICONS.alertCircle(12, '#FF453A'),
        badgeText: 'ПІДТВЕРДЖЕНА ЗАГРОЗА (TRUE POSITIVE)',
        badgeClass: 'sc-badge-red',
        explanation: `Консенсус досягнуто: евристичний конвеєр (${score} балів) та Gemini Nano (${lastAiVerdict?.confidence}%) одностайно класифікували взаємодію як шкідливу.`,
        recommendation: 'Захисне тертя та блокування відправки даних повністю виправдані.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: `СКАМ (${lastAiVerdict?.confidence}%)`,
        triggers,
      };
    } else if (isHeuristicRisk && !lastAiVerdict) {
      return {
        status: 'HEURISTIC_ONLY',
        badgeIcon: ICONS.zap(12, '#FF9F0A'),
        badgeText: 'ЕВРИСТИЧНЕ СПРАЦЮВАННЯ (ОЧІКУВАННЯ ШІ)',
        badgeClass: 'sc-badge-amber',
        explanation: `Спрацювали евристичні фільтри (${score} балів). ШІ-арбітраж ще не завершено або форма заблокована за жорстким правилом.`,
        recommendation: 'Зверніть увагу на перелік активних тригерів нижче.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: 'Очікується / Не викликався',
        triggers,
      };
    } else {
      return {
        status: 'CLEAN',
        badgeIcon: ICONS.shieldCheck(12, '#30D158'),
        badgeText: 'НОРМА: АНОМАЛІЙ НЕ ВИЯВЛЕНО',
        badgeClass: 'sc-badge-green',
        explanation:
          'Форми та комунікації на цій сторінці відповідають стандартам безпеки. Ознак фішингу, прихованих полів або крадіжки реквізитів немає.',
        recommendation: 'Система працює у фоновому пасивному режимі.',
        heuristicVerdict: `Безпечно (${score}/100)`,
        aiVerdict: lastAiVerdict ? 'Безпечно' : 'У нормі',
        triggers: triggers.length > 0 ? triggers : ['Тригери відсутні'],
      };
    }
  }

  // Генерація діагностичного звіту для розробника
  private static exportDiagnosticReport(): string {
    const fpAssessment = this.assessFalsePositive();
    const report = {
      generator: 'Sanctuary Core · Telemetry Hub (MV3)',
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      hostname: typeof window !== 'undefined' ? window.location.hostname : '',
      sessionId: this.state.sessionId,
      severity: this.state.severity,
      score: this.state.score,
      falsePositiveAssessment: {
        status: fpAssessment.status,
        badgeText: fpAssessment.badgeText,
        explanation: fpAssessment.explanation,
        recommendation: fpAssessment.recommendation,
        heuristicVerdict: fpAssessment.heuristicVerdict,
        aiVerdict: fpAssessment.aiVerdict,
        triggers: fpAssessment.triggers,
      },
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
          btn.innerHTML = `${ICONS.check(12)} <span>${successText}</span>`;
          setTimeout(() => {
            btn.innerHTML = original;
          }, 1600);
        }
      });
    }
  }

  private static render() {
    if (!this.shadowRoot) return;

    if (this.state.isMinimized) {
      this.applyContainerGeometry();
      this.renderMinimized();
      return;
    }

    this.applyContainerGeometry();

    const { sessionId, severity, score, logs, activeTab, userMode, filterCategory, filterSearch } =
      this.state;

    // Apple Calibrated Sanctuary Palette
    const riskColor =
      severity === 'CRITICAL' || severity === 'HIGH'
        ? '#FF453A'
        : severity === 'MEDIUM'
        ? '#FF9F0A'
        : '#30D158';

    const strokeDasharray = 226; // 2 * pi * r (r=36)
    const strokeDashoffset = strokeDasharray - (strokeDasharray * score) / 100;

    const fpInfo = this.assessFalsePositive();

    // Підрахунок категорій для фільтрів
    const aiCount = logs.filter((l) => l.isAi).length;
    const formCount = logs.filter((l) => l.isForm).length;
    const riskCount = logs.filter(
      (l) =>
        l.color === '#FF453A' ||
        l.color === '#EF4444' ||
        l.color === '#D70022' ||
        l.color === '#FF4F5E' ||
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
          log.color === '#FF453A' ||
          log.color === '#EF4444' ||
          log.color === '#D70022' ||
          log.color === '#FF4F5E' ||
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

    // Генерація HTML для Tab 1 (Огляд & XAI)
    const renderOverviewTab = () => {
      return `
        <div class="sc-overview-view">
          <!-- Hero Card: Швейцарський хронометр ризику -->
          <div class="sc-card sc-hero-gauge-card">
            <div class="sc-gauge-section">
              <div class="sc-gauge-container">
                <svg class="sc-gauge-svg" viewBox="0 0 90 90">
                  <circle class="sc-gauge-bg" cx="45" cy="45" r="36"></circle>
                  <circle class="sc-gauge-progress" cx="45" cy="45" r="36"></circle>
                </svg>
                <div class="sc-gauge-text">
                  <span class="sc-gauge-value">${score}</span>
                  <span class="sc-gauge-label">Індекс R</span>
                </div>
              </div>
              <div class="sc-session-details">
                <div class="sc-session-id" title="${sessionId || 'Немає активної сесії'}">
                  ${sessionId ? sessionId.substring(0, 24) + '...' : 'Пасивний фоновий моніторинг'}
                </div>
                <div class="sc-badge ${severity === 'HIGH' || severity === 'CRITICAL' ? 'sc-badge-red' : severity === 'MEDIUM' ? 'sc-badge-amber' : 'sc-badge-green'}">
                  ${score === 0 ? 'НОРМАЛЬНИЙ СТАН' : `${severity} РІВЕНЬ ЗАГРОЗИ`}
                </div>
                <div class="sc-subtext">Цільовий вузол: <strong>${typeof window !== 'undefined' ? window.location.hostname || 'local' : 'n/a'}</strong></div>
              </div>
            </div>
          </div>

          <!-- False Positive & XAI Inspector Card (Apple Inset Grouped Telemetry) -->
          <div class="sc-card sc-matrix-card ${fpInfo.status === 'FP_CANDIDATE' ? 'sc-alert-warning' : fpInfo.status === 'CONFIRMED_THREAT' ? 'sc-alert-danger' : 'sc-alert-success'}">
            <div class="sc-matrix-header">
              <span class="sc-badge ${fpInfo.badgeClass}">
                ${fpInfo.badgeIcon}
                ${fpInfo.badgeText}
              </span>
              <button type="button" class="sc-btn-ghost" id="btn-copy-fp-report" title="Скопіювати структуровані дані для баг-репорту або Vitest-тесту">
                ${ICONS.copy(11, '#0A84FF')}
                <span>Копіювати звіт</span>
              </button>
            </div>
            <p class="sc-matrix-desc">${fpInfo.explanation}</p>

            <div class="sc-compare-grid">
              <div class="sc-compare-col">
                <span class="sc-col-title">Евристичний конвеєр</span>
                <span class="sc-col-val">${fpInfo.heuristicVerdict}</span>
              </div>
              <div class="sc-compare-col">
                <span class="sc-col-title">ШІ-Арбітр (Gemini Nano)</span>
                <span class="sc-col-val">${fpInfo.aiVerdict}</span>
              </div>
            </div>

            ${
              userMode === 'dev'
                ? `
              <div class="sc-triggers-box">
                <span class="sc-triggers-title">Спрацьовані фактори ризику:</span>
                <div class="sc-triggers-list">
                  ${fpInfo.triggers.length > 0 && fpInfo.triggers[0] !== 'Тригери відсутні'
                    ? fpInfo.triggers.map((t) => `<span class="sc-trigger-chip">${t}</span>`).join('')
                    : '<span class="sc-trigger-chip" style="background:rgba(48,209,88,0.12);border-color:rgba(48,209,88,0.25);color:#30D158;">Аномальних тригерів не виявлено</span>'}
                </div>
              </div>
            `
                : `
              <div class="sc-friendly-note">
                ${ICONS.info(13, '#0A84FF')}
                <span><strong>Рекомендація системи:</strong> ${fpInfo.recommendation}</span>
              </div>
            `
            }

            <div class="sc-audit-actions">
              <button type="button" class="sc-btn sc-btn-secondary" id="btn-quick-whitelist">
                ${ICONS.shieldCheck(13)}
                <span>Додати домен до Довірених</span>
              </button>
              <button type="button" class="sc-btn sc-btn-secondary" id="btn-quick-reset-session">
                ${ICONS.refresh(13)}
                <span>Скинути стан тривоги</span>
              </button>
            </div>
          </div>

          <!-- Developer vs User mode explanation -->
          ${
            userMode === 'user'
              ? `
            <div class="sc-card sc-info-callout">
              <div class="sc-callout-title">
                ${ICONS.shield(13, '#0A84FF')}
                <span>Принципи захисту «Sanctuary Core»</span>
              </div>
              <div class="sc-callout-text">
                Система функціонує за принципом нульового розголошення (Zero Knowledge): анатомічний аналізатор форм виявляє приховані поля-пастки (CSS Cloaking), контекстний модуль відстежує ланцюги переходів, а локальний нейромодуль Gemini Nano (On-Device) здійснює семантичний арбітраж без передачі ваших даних на сторонні сервери.
              </div>
            </div>
          `
              : `
            <div class="sc-card">
              <div class="sc-card-title">Декомпозиція конвеєра рішень (Pipeline Waterfall)</div>
              <div class="sc-waterfall">
                <div class="sc-waterfall-step">
                  <span>1. DOM & Form Scanners (Traps)</span>
                  <span class="sc-tag ${logs.some((l) => l.isForm) ? 'sc-tag-blue' : ''}">${logs.some((l) => l.isForm) ? 'Активно' : 'Очікування'}</span>
                </div>
                <div class="sc-waterfall-step">
                  <span>2. NLP Intent & Chat Dialogue Monitor</span>
                  <span class="sc-tag ${logs.some((l) => l.stepKey.includes('Чат')) ? 'sc-tag-blue' : ''}">${logs.some((l) => l.stepKey.includes('Чат')) ? 'Активно' : 'Очікування'}</span>
                </div>
                <div class="sc-waterfall-step">
                  <span>3. Local LLM Arbiter (Gemini Nano MV3)</span>
                  <span class="sc-tag ${logs.some((l) => l.isAi) ? 'sc-tag-blue' : ''}">${logs.some((l) => l.isAi) ? (logs.some((l) => l.isAi && l.isPending) ? 'Аналіз...' : 'Оброблено') : 'В очікуванні'}</span>
                </div>
                <div class="sc-waterfall-step">
                  <span>4. Security Friction Engine</span>
                  <span class="sc-tag ${score >= 50 ? 'sc-tag-red' : 'sc-tag-green'}">${score >= 50 ? 'Блокування' : 'Пропуск'}</span>
                </div>
              </div>
            </div>
          `
          }
        </div>
      `;
    };

    // Генерація HTML для Tab 2 (Консоль подій)
    const renderEventsTab = () => {
      let logsHtml = '';
      filteredLogs.forEach((log) => {
        const dataStr =
          typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data);

        let iconColor = log.color || '#0A84FF';
        let badgeType = 'LOG';
        if (log.isAi) badgeType = 'AI';
        else if (log.isForm) badgeType = 'FORM';
        else if (log.stepKey.includes('Контекст') || log.stepKey.includes('Сесій')) badgeType = 'CTX';
        else if (log.stepKey.includes('DLP') || log.stepKey.includes('Vault')) badgeType = 'VAULT';

        logsHtml += `
          <div class="sc-console-row" style="border-left-color: ${iconColor};">
            <div class="sc-row-header">
              <div class="sc-row-lead">
                <span class="sc-badge-type">${badgeType}</span>
                <span class="sc-row-key" style="color: ${iconColor}">${log.stepKey}</span>
              </div>
              <div class="sc-row-trail">
                <span class="sc-row-time">${log.time}</span>
                <button type="button" class="sc-copy-btn" data-copy="${encodeURIComponent(dataStr)}" title="Скопіювати дані події">
                  ${ICONS.copy(11)}
                </button>
              </div>
            </div>
            <pre class="sc-code-block">${dataStr}</pre>
          </div>
        `;
      });

      if (filteredLogs.length === 0) {
        logsHtml = `
          <div class="sc-empty-console">
            ${ICONS.info(24, 'rgba(255, 255, 255, 0.4)')}
            <span>Подій за обраними фільтрами не знайдено</span>
          </div>
        `;
      }

      return `
        <div class="sc-events-view">
          <!-- Filter toolbar: Обсидіановий фільтр-бар -->
          <div class="sc-filter-bar">
            <div class="sc-search-box">
              ${ICONS.search(12, 'rgba(255, 255, 255, 0.4)')}
              <input type="text" id="sc-input-search" class="sc-search-input" placeholder="Пошук у логах..." value="${filterSearch}">
              ${filterSearch ? `<button type="button" id="btn-clear-search" class="sc-search-clear">${ICONS.close(10, 'rgba(255, 255, 255, 0.4)')}</button>` : ''}
            </div>
            <div class="sc-filter-chips">
              <button type="button" class="sc-chip ${filterCategory === 'ALL' ? 'active' : ''}" data-cat="ALL">Всі (${logs.length})</button>
              <button type="button" class="sc-chip ${filterCategory === 'AI' ? 'active' : ''}" data-cat="AI">ШІ (${aiCount})</button>
              <button type="button" class="sc-chip ${filterCategory === 'FORM' ? 'active' : ''}" data-cat="FORM">Форми (${formCount})</button>
              <button type="button" class="sc-chip ${filterCategory === 'RISK' ? 'active' : ''}" data-cat="RISK">Ризики (${riskCount})</button>
            </div>
          </div>

          <div class="sc-logs-scroll" id="sc-logs-scroll">
            ${logsHtml}
          </div>
        </div>
      `;
    };

    // Генерація HTML для Tab 3 (ШІ-Арбітр)
    const renderAiTab = () => {
      const aiLogs = logs.filter((l) => l.isAi);
      if (aiLogs.length === 0) {
        return `
          <div class="sc-empty-console" style="padding: 40px 20px;">
            ${ICONS.cpu(32, '#0A84FF')}
            <div style="font-weight:600; color:#FFFFFF; margin-top:8px;">Запитів до Gemini Nano ще не було</div>
            <div style="color:rgba(255, 255, 255, 0.6); font-size:11px; margin-top:4px; max-width:320px; line-height:1.4;">
              Локальна нейромережа викликається селективно для перевірки шахрайських намірів у чатах та аналізу підозрілих посилань без надсилання даних на зовнішні сервери.
            </div>
          </div>
        `;
      }

      let aiDetailsHtml = '';
      aiLogs.slice().reverse().forEach((log) => {
        const ctx = log.aiContext || {};
        aiDetailsHtml += `
          <div class="sc-card sc-ai-session-card">
            <div class="sc-ai-header">
              <div class="sc-ai-title-row">
                <span class="sc-badge sc-badge-blue">${ICONS.cpu(11, '#0A84FF')} GEMINI NANO ON-DEVICE</span>
                <span class="sc-row-time">${log.time}</span>
              </div>
              <div class="sc-ai-verdict" style="color: ${log.color}">${log.isPending ? `<span class="sc-spin">${ICONS.refresh(12, log.color)}</span> ` : ''}${log.data}</div>
            </div>

            <div class="sc-ai-sections">
              ${
                ctx.systemPrompt
                  ? `
                <div class="sc-ai-block">
                  <div class="sc-ai-block-header">
                    <span class="sc-ai-block-title">${ICONS.cpu(11, '#0A84FF')} СИСТЕМНИЙ ПРОМПТ (РОЛЬ ЕКСПЕРТА)</span>
                    <button type="button" class="sc-btn-ghost" data-copy="${encodeURIComponent(ctx.systemPrompt)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="sc-code-block">${ctx.systemPrompt}</pre>
                </div>
              `
                  : ''
              }

              ${
                ctx.contextRules
                  ? `
                <div class="sc-ai-block">
                  <div class="sc-ai-block-header">
                    <span class="sc-ai-block-title">${ICONS.list(11, '#0A84FF')} ПРАВИЛА ВЕРИФІКАЦІЇ (CONTEXT RULES)</span>
                    <button type="button" class="sc-btn-ghost" data-copy="${encodeURIComponent(ctx.contextRules)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="sc-code-block">${ctx.contextRules}</pre>
                </div>
              `
                  : ''
              }

              ${
                ctx.textSent
                  ? `
                <div class="sc-ai-block">
                  <div class="sc-ai-block-header">
                    <span class="sc-ai-block-title">${ICONS.message(11, '#0A84FF')} ТЕКСТ / ПОСИЛАННЯ ДЛЯ СКАНУВАННЯ</span>
                    <button type="button" class="sc-btn-ghost" data-copy="${encodeURIComponent(ctx.textSent)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="sc-code-block">${ctx.textSent}</pre>
                </div>
              `
                  : ''
              }

              ${
                ctx.chatDialogue
                  ? `
                <div class="sc-ai-block">
                  <div class="sc-ai-block-header">
                    <span class="sc-ai-block-title">${ICONS.message(11, '#0A84FF')} ІСТОРІЯ ЧАТУ (P2P ДІАЛОГ)</span>
                    <button type="button" class="sc-btn-ghost" data-copy="${encodeURIComponent(ctx.chatDialogue)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="sc-code-block">${ctx.chatDialogue}</pre>
                </div>
              `
                  : ''
              }

              ${
                ctx.rawResponse
                  ? `
                <div class="sc-ai-block raw-block">
                  <div class="sc-ai-block-header">
                    <span class="sc-ai-block-title" style="color:#0A84FF;">${ICONS.terminal(11, '#0A84FF')} СИРА ВІДПОВІДЬ LLM (RAW JSON RESPONSE)</span>
                    <button type="button" class="sc-btn-ghost" data-copy="${encodeURIComponent(ctx.rawResponse)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="sc-code-block raw-code">${ctx.rawResponse}</pre>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `;
      });

      return `<div class="sc-ai-tab-scroll">${aiDetailsHtml}</div>`;
    };

    let tabBody = '';
    if (activeTab === 'overview') tabBody = renderOverviewTab();
    else if (activeTab === 'events') tabBody = renderEventsTab();
    else if (activeTab === 'ai') tabBody = renderAiTab();

    this.shadowRoot.innerHTML = `
      <style>
        ${DESIGN_TOKENS_CSS}

        :host {
          all: initial;
          font-family: var(--font-sanctuary, -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif);
          color: var(--sc-ink-primary, #FFFFFF);
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }

        *, *:before, *:after {
          box-sizing: border-box;
        }

        /* 1. Monolithic Window Container: Translucent Obsidian Glass */
        .sc-window {
          width: 100%;
          height: 100%;
          background: var(--sc-obsidian-bg, rgba(16, 16, 20, 0.94));
          backdrop-filter: var(--sc-obsidian-blur, blur(32px) saturate(190%));
          -webkit-backdrop-filter: var(--sc-obsidian-blur, blur(32px) saturate(190%));
          border: 1px solid var(--sc-obsidian-border, rgba(255, 255, 255, 0.12));
          border-radius: var(--sc-squircle-window, 20px);
          box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-size: 12px;
          color: var(--sc-ink-primary, #FFFFFF);
        }

        /* 2. Precision Titlebar */
        .sc-titlebar {
          background: var(--sc-obsidian-header, rgba(24, 24, 30, 0.82));
          padding: 12px 18px;
          border-bottom: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.08));
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
          gap: 10px;
        }
        .sc-brand-icon {
          width: 26px;
          height: 26px;
          border-radius: var(--sc-squircle-control, 8px);
          background: linear-gradient(135deg, #0A84FF 0%, #5E5CE6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          box-shadow: var(--sc-sapphire-glow, 0 0 14px rgba(10, 132, 255, 0.4));
          animation: sc-lens-breathe 4s ease-in-out infinite;
        }
        @keyframes sc-lens-breathe {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 12px rgba(10, 132, 255, 0.35);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 20px rgba(10, 132, 255, 0.65);
          }
        }
        @keyframes sc-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .sc-spin {
          display: inline-block;
          animation: sc-spin 1.2s linear infinite;
          vertical-align: middle;
        }
        .sc-brand-meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sc-brand-name {
          font-size: 13.5px;
          font-weight: 700;
          color: var(--sc-ink-primary, #FFFFFF);
          letter-spacing: -0.015em;
        }
        .sc-brand-badge {
          font-size: 9.5px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid var(--sc-obsidian-border, rgba(255, 255, 255, 0.12));
          color: var(--sc-ink-secondary, rgba(255, 255, 255, 0.75));
          padding: 2px 7px;
          border-radius: 5px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        /* Window Controls */
        .sc-win-controls {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .sc-segmented-mode {
          display: flex;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.08));
          border-radius: var(--radius-pill, 9999px);
          padding: 2px;
          margin-right: 6px;
        }
        .sc-mode-btn {
          background: transparent;
          border: none;
          color: var(--sc-ink-muted, rgba(255, 255, 255, 0.6));
          font-size: 10.5px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: var(--radius-pill, 9999px);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s var(--ease-apple-spring, cubic-bezier(0.16, 1, 0.3, 1));
        }
        .sc-mode-btn.active {
          background: var(--sc-obsidian-sheen, rgba(255, 255, 255, 0.18));
          color: var(--sc-ink-primary, #FFFFFF);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        }
        .sc-tool-btn {
          width: 28px;
          height: 28px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.08));
          color: var(--sc-ink-secondary, rgba(255, 255, 255, 0.75));
          cursor: pointer;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .sc-tool-btn:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #FFFFFF;
          border-color: rgba(255, 255, 255, 0.2);
        }
        .sc-tool-btn:active {
          transform: scale(0.94);
        }
        .sc-tool-btn.sc-tool-btn-close:hover {
          background: var(--sc-crimson-bg, rgba(255, 69, 58, 0.22));
          color: var(--sc-crimson, #FF453A);
          border-color: var(--sc-crimson-border, rgba(255, 69, 58, 0.4));
        }

        /* 3. Cupertino Navigation Bar */
        .sc-tab-bar {
          background: var(--sc-obsidian-nav, rgba(14, 14, 18, 0.88));
          border-bottom: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.07));
          display: flex;
          padding: 6px 14px 10px 14px;
          gap: 6px;
        }
        .sc-tab-btn {
          flex: 1;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: var(--sc-ink-muted, rgba(255, 255, 255, 0.6));
          font-size: 11.5px;
          font-weight: 500;
          padding: 6px 10px;
          cursor: pointer;
          border-radius: var(--sc-squircle-control, 8px);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s var(--ease-apple-spring, cubic-bezier(0.16, 1, 0.3, 1));
        }
        .sc-tab-btn:hover {
          color: #FFFFFF;
          background: rgba(255, 255, 255, 0.07);
        }
        .sc-tab-btn:active {
          transform: scale(0.97);
        }
        .sc-tab-btn.active {
          background: rgba(255, 255, 255, 0.14);
          color: #FFFFFF;
          font-weight: 600;
          border-color: var(--sc-obsidian-sheen, rgba(255, 255, 255, 0.18));
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
        }
        .sc-tab-badge {
          font-size: 9.5px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.85);
          padding: 1px 6px;
          border-radius: 10px;
        }
        .sc-tab-badge.warning {
          background: var(--sc-amber-bg, rgba(255, 159, 10, 0.25));
          color: var(--sc-amber, #FF9F0A);
          border: 1px solid var(--sc-amber-border, rgba(255, 159, 10, 0.32));
        }

        /* 4. Viewport & Scrollbar */
        .sc-viewport {
          flex: 1;
          overflow-y: auto;
          background: transparent;
          display: flex;
          flex-direction: column;
        }
        ::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.30);
        }

        /* 5. Cards & Gauges */
        .sc-card {
          background: var(--sc-obsidian-card, rgba(26, 26, 32, 0.7));
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.08));
          border-radius: var(--sc-squircle-card, 14px);
          padding: 14px;
          margin-bottom: 10px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .sc-overview-view {
          padding: 14px;
          display: flex;
          flex-direction: column;
        }
        .sc-hero-gauge-card {
          background: var(--sc-obsidian-card-elevated, linear-gradient(135deg, rgba(28, 28, 36, 0.85) 0%, rgba(18, 18, 24, 0.95) 100%));
          border: 1px solid var(--sc-obsidian-border, rgba(255, 255, 255, 0.1));
          padding: 16px;
        }
        .sc-gauge-section {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .sc-gauge-container {
          position: relative;
          width: 84px;
          height: 84px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .sc-gauge-svg {
          transform: rotate(-90deg);
          width: 84px;
          height: 84px;
          overflow: visible;
        }
        .sc-gauge-bg {
          fill: none;
          stroke: rgba(255, 255, 255, 0.08);
          stroke-width: 7.5;
        }
        .sc-gauge-progress {
          fill: none;
          stroke: ${riskColor};
          stroke-width: 7.5;
          stroke-linecap: round;
          stroke-dasharray: ${strokeDasharray};
          stroke-dashoffset: ${strokeDashoffset};
          transition: stroke-dashoffset 0.6s var(--ease-apple-spring, cubic-bezier(0.16, 1, 0.3, 1)), stroke 0.4s ease;
          filter: drop-shadow(0 0 10px ${riskColor});
        }
        .sc-gauge-text {
          position: absolute;
          text-align: center;
          display: flex;
          flex-direction: column;
        }
        .sc-gauge-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--sc-ink-primary, #FFFFFF);
          line-height: 1;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .sc-gauge-label {
          font-size: 8.5px;
          color: var(--sc-ink-subtle, rgba(255, 255, 255, 0.45));
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-top: 3px;
        }
        .sc-session-details {
          flex: 1;
          min-width: 0;
        }
        .sc-session-id {
          font-family: var(--font-mono, monospace);
          font-size: 11px;
          font-weight: 600;
          color: var(--sc-ink-primary, #FFFFFF);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 6px;
        }
        .sc-subtext {
          font-size: 10.5px;
          color: var(--sc-ink-muted, rgba(255, 255, 255, 0.6));
          margin-top: 6px;
        }
        .sc-subtext strong {
          color: var(--sc-ink-primary, #FFFFFF);
        }

        /* Badges */
        .sc-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 9.5px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: var(--sc-squircle-chip, 6px);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .sc-badge-red {
          background: var(--sc-crimson-bg, rgba(255, 69, 58, 0.16));
          color: var(--sc-crimson, #FF453A);
          border: 1px solid var(--sc-crimson-border, rgba(255, 69, 58, 0.32));
        }
        .sc-badge-amber {
          background: var(--sc-amber-bg, rgba(255, 159, 10, 0.16));
          color: var(--sc-amber, #FF9F0A);
          border: 1px solid var(--sc-amber-border, rgba(255, 159, 10, 0.32));
        }
        .sc-badge-green {
          background: var(--sc-emerald-bg, rgba(48, 209, 88, 0.16));
          color: var(--sc-emerald, #30D158);
          border: 1px solid var(--sc-emerald-border, rgba(48, 209, 88, 0.32));
        }
        .sc-badge-blue {
          background: var(--sc-sapphire-bg, rgba(10, 132, 255, 0.16));
          color: var(--sc-sapphire, #0A84FF);
          border: 1px solid var(--sc-sapphire-border, rgba(10, 132, 255, 0.32));
        }

        /* 6. False Positive & XAI Inspector */
        .sc-matrix-card {
          border-left: 3px solid transparent;
        }
        .sc-matrix-card.sc-alert-warning {
          border-left-color: var(--sc-amber, #FF9F0A);
          background: linear-gradient(135deg, rgba(38, 30, 20, 0.75) 0%, rgba(22, 20, 18, 0.85) 100%);
          border-color: var(--sc-amber-border, rgba(255, 159, 10, 0.25));
        }
        .sc-matrix-card.sc-alert-danger {
          border-left-color: var(--sc-crimson, #FF453A);
          background: linear-gradient(135deg, rgba(42, 22, 24, 0.75) 0%, rgba(24, 18, 19, 0.85) 100%);
          border-color: var(--sc-crimson-border, rgba(255, 69, 58, 0.25));
        }
        .sc-matrix-card.sc-alert-success {
          border-left-color: var(--sc-emerald, #30D158);
          background: linear-gradient(135deg, rgba(20, 36, 26, 0.75) 0%, rgba(18, 24, 20, 0.85) 100%);
          border-color: var(--sc-emerald-border, rgba(48, 209, 88, 0.25));
        }
        .sc-matrix-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .sc-btn-ghost {
          background: transparent;
          border: none;
          color: var(--sc-sapphire, #0A84FF);
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          padding: 3px 7px;
          border-radius: 5px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s ease;
        }
        .sc-btn-ghost:hover {
          background: var(--sc-sapphire-bg, rgba(10, 132, 255, 0.14));
        }
        .sc-btn-ghost:active {
          transform: scale(0.96);
        }
        .sc-matrix-desc {
          font-size: 11.5px;
          color: var(--sc-ink-secondary, rgba(255, 255, 255, 0.85));
          line-height: 1.5;
          margin-bottom: 10px;
        }
        .sc-compare-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 10px;
        }
        .sc-compare-col {
          background: var(--sc-obsidian-well, rgba(12, 12, 16, 0.65));
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.07));
          border-radius: var(--sc-squircle-control, 8px);
          padding: 8px 10px;
        }
        .sc-col-title {
          display: block;
          font-size: 9px;
          text-transform: uppercase;
          color: var(--sc-ink-subtle, rgba(255, 255, 255, 0.45));
          font-weight: 700;
          letter-spacing: 0.03em;
          margin-bottom: 3px;
        }
        .sc-col-val {
          font-size: 12px;
          font-weight: 600;
          color: var(--sc-ink-primary, #FFFFFF);
        }
        .sc-triggers-box {
          background: var(--sc-obsidian-well, rgba(12, 12, 16, 0.65));
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.07));
          border-radius: var(--sc-squircle-control, 8px);
          padding: 9px 10px;
          margin-bottom: 10px;
        }
        .sc-triggers-title {
          font-size: 9.5px;
          font-weight: 700;
          color: var(--sc-ink-muted, rgba(255, 255, 255, 0.6));
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .sc-triggers-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
        }
        .sc-trigger-chip {
          background: var(--sc-amber-bg, rgba(255, 159, 10, 0.12));
          border: 1px solid var(--sc-amber-border, rgba(255, 159, 10, 0.25));
          color: #FFB340;
          font-family: var(--font-mono, monospace);
          font-size: 10px;
          padding: 2px 8px;
          border-radius: var(--sc-squircle-chip, 6px);
          transition: all 0.18s ease;
          user-select: all;
        }
        .sc-trigger-chip:hover {
          background: rgba(255, 159, 10, 0.22);
          border-color: rgba(255, 159, 10, 0.45);
          box-shadow: 0 0 10px rgba(255, 159, 10, 0.25);
        }
        .sc-friendly-note {
          background: var(--sc-sapphire-bg, rgba(10, 132, 255, 0.08));
          border: 1px solid var(--sc-sapphire-border, rgba(10, 132, 255, 0.2));
          border-radius: var(--sc-squircle-control, 8px);
          padding: 8px 10px;
          font-size: 11px;
          color: var(--sc-ink-secondary, rgba(255, 255, 255, 0.85));
          line-height: 1.4;
          margin-bottom: 10px;
          display: flex;
          align-items: flex-start;
          gap: 6px;
        }
        .sc-friendly-note strong {
          color: var(--sc-ink-primary, #FFFFFF);
        }
        .sc-audit-actions {
          display: flex;
          gap: 8px;
        }
        .sc-btn {
          flex: 1;
          background: var(--sc-sapphire, #0A84FF);
          color: #FFFFFF;
          border: none;
          padding: 7px 11px;
          border-radius: var(--sc-squircle-control, 8px);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.18s var(--ease-apple-spring, cubic-bezier(0.16, 1, 0.3, 1));
        }
        .sc-btn:hover {
          background: var(--sc-sapphire-hover, #0077ED);
          box-shadow: 0 2px 8px rgba(10, 132, 255, 0.35);
        }
        .sc-btn:active {
          transform: scale(0.97);
        }
        .sc-btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          color: #FFFFFF;
          border: 1px solid var(--sc-obsidian-border, rgba(255, 255, 255, 0.12));
        }
        .sc-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.22);
        }

        /* 7. Decomposition & Callouts */
        .sc-card-title {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--sc-ink-primary, #FFFFFF);
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }
        .sc-waterfall {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sc-waterfall-step {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 10px;
          background: var(--sc-obsidian-well, rgba(12, 12, 16, 0.6));
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.06));
          border-radius: 7px;
          font-size: 11px;
          color: var(--sc-ink-secondary, rgba(255, 255, 255, 0.85));
        }
        .sc-tag {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.08);
          color: var(--sc-ink-subtle, rgba(255, 255, 255, 0.5));
        }
        .sc-tag-blue {
          background: var(--sc-sapphire-bg, rgba(10, 132, 255, 0.2));
          color: var(--sc-sapphire, #0A84FF);
          border: 1px solid var(--sc-sapphire-border, rgba(10, 132, 255, 0.32));
        }
        .sc-tag-red {
          background: var(--sc-crimson-bg, rgba(255, 69, 58, 0.2));
          color: var(--sc-crimson, #FF453A);
          border: 1px solid var(--sc-crimson-border, rgba(255, 69, 58, 0.32));
        }
        .sc-tag-green {
          background: var(--sc-emerald-bg, rgba(48, 209, 88, 0.2));
          color: var(--sc-emerald, #30D158);
          border: 1px solid var(--sc-emerald-border, rgba(48, 209, 88, 0.32));
        }
        .sc-info-callout {
          background: var(--sc-sapphire-bg, rgba(10, 132, 255, 0.08));
          border-left: 3px solid var(--sc-sapphire, #0A84FF);
          border-color: var(--sc-sapphire-border, rgba(10, 132, 255, 0.2));
        }
        .sc-callout-title {
          font-weight: 700;
          font-size: 11.5px;
          color: var(--sc-ink-primary, #FFFFFF);
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sc-callout-text {
          font-size: 11px;
          color: var(--sc-ink-secondary, rgba(255, 255, 255, 0.75));
          line-height: 1.45;
        }

        /* 8. Forensic Event Console */
        .sc-events-view {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        .sc-filter-bar {
          background: var(--sc-obsidian-header, rgba(20, 20, 26, 0.7));
          padding: 8px 12px;
          border-bottom: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.07));
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sc-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }
        .sc-search-box svg {
          position: absolute;
          left: 9px;
          pointer-events: none;
          color: var(--sc-ink-subtle, rgba(255, 255, 255, 0.4));
        }
        .sc-search-input {
          width: 100%;
          height: 28px;
          background: var(--sc-obsidian-well, rgba(10, 10, 14, 0.8));
          border: 1px solid var(--sc-obsidian-border, rgba(255, 255, 255, 0.1));
          border-radius: 7px;
          padding: 0 28px 0 28px;
          color: var(--sc-ink-primary, #FFFFFF);
          font-size: 11px;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .sc-search-input:focus {
          border-color: var(--sc-sapphire, #0A84FF);
          box-shadow: 0 0 8px rgba(10, 132, 255, 0.3);
        }
        .sc-search-clear {
          position: absolute;
          right: 6px;
          background: transparent;
          border: none;
          color: var(--sc-ink-subtle, rgba(255, 255, 255, 0.4));
          cursor: pointer;
          padding: 2px 4px;
        }
        .sc-filter-chips {
          display: flex;
          gap: 5px;
        }
        .sc-chip {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.08));
          color: var(--sc-ink-secondary, rgba(255, 255, 255, 0.65));
          font-size: 10px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: var(--sc-squircle-chip, 6px);
          cursor: pointer;
          transition: all 0.15s var(--ease-apple-spring, cubic-bezier(0.16, 1, 0.3, 1));
        }
        .sc-chip:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #FFFFFF;
        }
        .sc-chip:active {
          transform: scale(0.96);
        }
        .sc-chip.active {
          background: var(--sc-sapphire-bg, rgba(10, 132, 255, 0.22));
          border-color: var(--sc-sapphire-border, rgba(10, 132, 255, 0.4));
          color: var(--sc-sapphire, #0A84FF);
        }
        .sc-logs-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .sc-console-row {
          background: var(--sc-obsidian-card, rgba(24, 24, 30, 0.7));
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.07));
          border-left-width: 3px;
          border-radius: var(--sc-squircle-control, 8px);
          padding: 7px 9px;
          transition: background 0.15s ease;
        }
        .sc-console-row:hover {
          background: rgba(30, 30, 38, 0.85);
        }
        .sc-row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .sc-row-lead {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sc-badge-type {
          font-size: 8.5px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.09);
          border: 1px solid var(--sc-obsidian-border, rgba(255, 255, 255, 0.12));
          color: var(--sc-ink-secondary, rgba(255, 255, 255, 0.75));
          padding: 1px 5px;
          border-radius: 4px;
          letter-spacing: 0.03em;
        }
        .sc-row-key {
          font-size: 11px;
          font-weight: 600;
        }
        .sc-row-trail {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sc-row-time {
          font-family: var(--font-mono, monospace);
          font-size: 9.5px;
          color: var(--sc-ink-subtle, rgba(255, 255, 255, 0.4));
        }
        .sc-copy-btn {
          background: transparent;
          border: none;
          color: var(--sc-ink-subtle, rgba(255, 255, 255, 0.4));
          cursor: pointer;
          padding: 2px 4px;
          font-size: 10px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          transition: all 0.14s ease;
        }
        .sc-copy-btn:hover {
          color: #FFFFFF;
          background: rgba(255, 255, 255, 0.12);
        }
        .sc-copy-btn:active {
          transform: scale(0.92);
        }
        .sc-code-block {
          background: var(--sc-obsidian-well, rgba(10, 10, 14, 0.85));
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.06));
          border-radius: 6px;
          padding: 6px 8px;
          font-family: var(--font-mono, monospace);
          font-size: 10px;
          color: var(--sc-ink-primary, rgba(255, 255, 255, 0.9));
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 140px;
          overflow-y: auto;
        }
        .sc-empty-console {
          padding: 50px 20px;
          text-align: center;
          color: var(--sc-ink-subtle, rgba(255, 255, 255, 0.4));
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        /* 9. AI Inspection Details */
        .sc-ai-tab-scroll {
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .sc-ai-session-card {
          border-left: 3px solid var(--sc-sapphire, #0A84FF);
          background: var(--sc-obsidian-card, rgba(24, 24, 30, 0.7));
        }
        .sc-ai-header {
          margin-bottom: 9px;
        }
        .sc-ai-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .sc-ai-verdict {
          font-size: 11.5px;
          font-weight: 600;
          line-height: 1.4;
          white-space: pre-wrap;
        }
        .sc-ai-sections {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .sc-ai-block {
          background: var(--sc-obsidian-well, rgba(10, 10, 14, 0.85));
          border: 1px solid var(--sc-obsidian-border-subtle, rgba(255, 255, 255, 0.06));
          border-radius: 6px;
          padding: 7px 9px;
        }
        .sc-ai-block.raw-block {
          border-color: var(--sc-sapphire-border, rgba(10, 132, 255, 0.3));
          background: var(--sc-sapphire-bg, rgba(10, 132, 255, 0.06));
        }
        .sc-ai-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9.5px;
          font-weight: 700;
          color: var(--sc-ink-muted, rgba(255, 255, 255, 0.6));
          margin-bottom: 4px;
        }
        .sc-ai-block-title {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .sc-code-block.raw-code {
          background: var(--sc-obsidian-code, rgba(8, 8, 12, 0.95));
          border-color: var(--sc-sapphire-border, rgba(10, 132, 255, 0.25));
          color: #70B4FF;
        }
      </style>

      <div class="sc-window">
        <!-- Titlebar: Sanctuary Core Telemetry Precision Header -->
        <div class="sc-titlebar" id="drag-handle">
          <div class="sc-brand-group">
            <div class="sc-brand-icon" title="Sanctuary Core">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" stroke-dasharray="1.5 2" />
                <circle cx="12" cy="12" r="1.8" fill="#FFFFFF" />
              </svg>
            </div>
            <div class="sc-brand-meta">
              <span class="sc-brand-name">Sanctuary Core</span>
              <span class="sc-brand-badge">Telemetry XAI Hub</span>
            </div>
          </div>
          <div class="sc-win-controls">
            <div class="sc-segmented-mode">
              <button type="button" class="sc-mode-btn ${userMode === 'user' ? 'active' : ''}" id="btn-mode-user" title="Спрощене пояснення для користувача">
                ${ICONS.info(11)}
                <span>Інфо</span>
              </button>
              <button type="button" class="sc-mode-btn ${userMode === 'dev' ? 'active' : ''}" id="btn-mode-dev" title="Повний інспектор XAI для захисту диплому">
                ${ICONS.code(11)}
                <span>Форензік</span>
              </button>
            </div>
            <button type="button" class="sc-tool-btn" id="btn-export-json" title="Експортувати повний діагностичний звіт у JSON">
              ${ICONS.download(13)}
            </button>
            <button type="button" class="sc-tool-btn" id="btn-clear-all" title="Очистити консоль">
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

        <!-- Cupertino Segmented Tab Navigation -->
        <nav class="sc-tab-bar">
          <button type="button" class="sc-tab-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
            ${ICONS.activity(12)}
            <span>Огляд та XAI</span>
            ${fpInfo.status === 'FP_CANDIDATE' ? '<span class="sc-tab-badge warning">FP?</span>' : ''}
          </button>
          <button type="button" class="sc-tab-btn ${activeTab === 'events' ? 'active' : ''}" data-tab="events">
            ${ICONS.terminal(12)}
            <span>Консоль подій</span>
            <span class="sc-tab-badge">${logs.length}</span>
          </button>
          <button type="button" class="sc-tab-btn ${activeTab === 'ai' ? 'active' : ''}" data-tab="ai">
            ${ICONS.cpu(12)}
            <span>Gemini Nano</span>
            <span class="sc-tab-badge">${aiCount}</span>
          </button>
        </nav>

        <!-- Viewport content -->
        <div class="sc-viewport">
          ${tabBody}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  // Рендеринг компактного віджета (Dynamic Island Pill)
  private static renderMinimized() {
    if (!this.shadowRoot) return;

    const { severity, score, logs } = this.state;
    const riskColor =
      severity === 'CRITICAL' || severity === 'HIGH'
        ? '#FF453A'
        : severity === 'MEDIUM'
        ? '#FF9F0A'
        : '#30D158';

    this.shadowRoot.innerHTML = `
      <style>
        ${DESIGN_TOKENS_CSS}

        :host {
          all: initial;
          font-family: var(--font-sanctuary, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif);
        }
        .sc-pill {
          height: 32px;
          background: var(--sc-obsidian-bg, rgba(20, 20, 24, 0.92));
          backdrop-filter: blur(24px) saturate(190%);
          -webkit-backdrop-filter: blur(24px) saturate(190%);
          border: 1px solid var(--sc-obsidian-border, rgba(255, 255, 255, 0.16));
          border-radius: var(--radius-pill, 9999px);
          padding: 0 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--sc-ink-primary, #FFFFFF);
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          transition: transform 0.2s var(--ease-apple-spring), background 0.18s ease, box-shadow 0.18s ease;
          user-select: none;
        }
        .sc-pill:hover {
          transform: scale(1.03);
          background: rgba(14, 14, 18, 0.98);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
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
          font-size: 11px;
          font-weight: 600;
          color: #FFFFFF;
          letter-spacing: -0.01em;
        }
        .sc-pill-badge {
          font-size: 9.5px;
          font-weight: 700;
          background: ${riskColor === '#30D158' ? 'rgba(52, 199, 89, 0.18)' : riskColor === '#FF9F0A' ? 'rgba(255, 149, 0, 0.22)' : 'rgba(255, 59, 48, 0.22)'};
          color: ${riskColor};
          border: 1px solid ${riskColor === '#30D158' ? 'rgba(52, 199, 89, 0.35)' : riskColor === '#FF9F0A' ? 'rgba(255, 149, 0, 0.35)' : 'rgba(255, 59, 48, 0.35)'};
          padding: 1px 7px;
          border-radius: var(--radius-pill, 9999px);
          font-family: var(--font-mono, monospace);
        }
        .sc-pill-count {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.65);
          font-family: var(--font-mono, monospace);
          display: flex;
          align-items: center;
          gap: 4px;
        }
      </style>
      <div class="sc-pill" id="btn-restore" title="Відкрити турбійон телеметрії XAI">
        <span class="sc-pill-icon">${ICONS.shield(13, riskColor)}</span>
        <span class="sc-pill-text">Sanctuary Telemetry</span>
        <span class="sc-pill-badge">${score}/100</span>
        <span class="sc-pill-count">
          <span>${logs.length} logs</span>
          ${ICONS.expand(11, 'rgba(255, 255, 255, 0.65)')}
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
    });

    this.shadowRoot.getElementById('btn-minimize')?.addEventListener('click', () => {
      this.state.isMinimized = true;
      this.render();
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

    // Mode toggles (Інфо vs Форензік)
    this.shadowRoot.getElementById('btn-mode-user')?.addEventListener('click', () => {
      this.state.userMode = 'user';
      this.render();
    });
    this.shadowRoot.getElementById('btn-mode-dev')?.addEventListener('click', () => {
      this.state.userMode = 'dev';
      this.render();
    });

    // Tabs switching
    this.shadowRoot.querySelectorAll('.sc-tab-btn').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tab = (tabBtn as HTMLElement).dataset.tab as NeuromonitorTab;
        if (tab) {
          this.state.activeTab = tab;
          this.render();
        }
      });
    });

    // Quick False Positive Actions
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
          this.log('Білий список', `Домен ${host} додано до довірених через оверлей`, '#30D158');
          if (btn) btn.innerHTML = `${ICONS.check(12, '#30D158')} <span>Додано!</span>`;
        } catch {
          window.postMessage({ type: 'THREAT_SHIELD_ADD_WHITELIST', host }, '*');
          if (btn) btn.innerHTML = `${ICONS.check(12, '#30D158')} <span>Додано!</span>`;
        }
      }
    });

    this.shadowRoot.getElementById('btn-quick-reset-session')?.addEventListener('click', (e) => {
      window.postMessage({ type: 'THREAT_SHIELD_CLEAR_CONTEXT' }, '*');
      this.log('Система', 'Користувач примусово скинув стан тривоги', '#30D158');
      const btn = e.currentTarget as HTMLElement;
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = `${ICONS.check(12, '#30D158')} <span>Скинуто!</span>`;
        setTimeout(() => {
          btn.innerHTML = orig;
        }, 1400);
      }
    });

    // Event Console Filters
    const searchInput = this.shadowRoot.getElementById('sc-input-search') as HTMLInputElement | null;
    searchInput?.addEventListener('input', (e) => {
      this.state.filterSearch = (e.target as HTMLInputElement).value;
      this.render();
      const newInput = this.shadowRoot?.getElementById('sc-input-search') as HTMLInputElement | null;
      if (newInput) {
        newInput.focus();
        const len = newInput.value.length;
        newInput.setSelectionRange(len, len);
      }
    });

    this.shadowRoot.getElementById('btn-clear-search')?.addEventListener('click', () => {
      this.state.filterSearch = '';
      this.render();
      const newInput = this.shadowRoot?.getElementById('sc-input-search') as HTMLInputElement | null;
      newInput?.focus();
    });

    this.shadowRoot.querySelectorAll('.sc-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const cat = (chip as HTMLElement).dataset.cat as NeuromonitorCategoryFilter;
        if (cat) {
          this.state.filterCategory = cat;
          this.render();
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

    // Auto-scroll in logs tab
    if (this.state.activeTab === 'events') {
      const logsContainer = this.shadowRoot.getElementById('sc-logs-scroll');
      if (logsContainer && !this.state.filterSearch) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
      }
    }
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
