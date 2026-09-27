import { UserWhitelistManager } from '../core/user-whitelist';

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
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  shieldCheck: (size = 14, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
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

  // Утиліта для очищення емодзі
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
    this.applyContainerGeometry();

    this.shadowRoot = this.container.attachShadow({ mode: 'open' });
    document.body.appendChild(this.container);

    this.setupDrag();
    this.render();
  }

  private static applyContainerGeometry() {
    if (!this.container) return;

    if (this.state.isMinimized) {
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
      });
    } else {
      Object.assign(this.container.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '460px',
        height: '620px',
        minWidth: '380px',
        minHeight: '480px',
        maxWidth: '92vw',
        maxHeight: '92vh',
        zIndex: '2147483647',
        display: 'block',
        resize: 'both',
        overflow: 'hidden',
      });
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
    const color = customColor || '#008A52';

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
    const color = customColor || '#0060DF';
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
        badgeIcon: ICONS.alertTriangle(12, '#D76E00'),
        badgeText: 'РОЗБІЖНІСТЬ: ЙМОВІРНИЙ FALSE POSITIVE',
        badgeClass: 'badge-amber',
        explanation: `Евристичні тригери нарахували ${score}/100 балів, але локальний ШІ-Арбітр спростував шахрайство (Впевненість: ${lastAiVerdict?.confidence}%). Можливе хибне блокування на легітимному сервісі.`,
        recommendation:
          'Рекомендується перевірити акредитацію цільового платіжного домену або додати сайт до списку довірених.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: `Безпечно (${lastAiVerdict?.confidence}%)`,
        triggers,
      };
    } else if (isHeuristicRisk && isAiConfirmed) {
      return {
        status: 'CONFIRMED_THREAT',
        badgeIcon: ICONS.alertCircle(12, '#D70022'),
        badgeText: 'ПІДТВЕРДЖЕНА ЗАГРОЗА (TRUE POSITIVE)',
        badgeClass: 'badge-red',
        explanation: `Консенсус досягнуто: евристичний конвеєр (${score} балів) та Gemini Nano (${lastAiVerdict?.confidence}%) одностайно класифікували взаємодію як шкідливу.`,
        recommendation: 'Захисне тертя та блокування відправки даних повністю виправдані.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: `СКАМ (${lastAiVerdict?.confidence}%)`,
        triggers,
      };
    } else if (isHeuristicRisk && !lastAiVerdict) {
      return {
        status: 'HEURISTIC_ONLY',
        badgeIcon: ICONS.zap(12, '#D76E00'),
        badgeText: 'ЕВРИСТИЧНЕ СПРАЦЮВАННЯ (ОЧІКУВАННЯ ШІ)',
        badgeClass: 'badge-amber',
        explanation: `Спрацювали евристичні фільтри (${score} балів). ШІ-арбітраж ще не завершено або форма заблокована за жорстким правилом.`,
        recommendation: 'Зверніть увагу на перелік активних тригерів нижче.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: 'Очікується / Не викликався',
        triggers,
      };
    } else {
      return {
        status: 'CLEAN',
        badgeIcon: ICONS.shieldCheck(12, '#008A52'),
        badgeText: 'НОРМА: АНОМАЛІЙ НЕ ВИЯВЛЕНО',
        badgeClass: 'badge-green',
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
      generator: 'Threat Shield Firefox Neuromonitor',
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

    // Світлі кольори Firefox Proton tokens
    const riskColor =
      severity === 'CRITICAL' || severity === 'HIGH'
        ? '#D70022'
        : severity === 'MEDIUM'
        ? '#D76E00'
        : '#008A52';

    const strokeDasharray = 226; // 2 * pi * r (r=36)
    const strokeDashoffset = strokeDasharray - (strokeDasharray * score) / 100;

    const fpInfo = this.assessFalsePositive();

    // Підрахунок категорій для фільтрів
    const aiCount = logs.filter((l) => l.isAi).length;
    const formCount = logs.filter((l) => l.isForm).length;
    const riskCount = logs.filter(
      (l) =>
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
        <div class="fx-overview-layout">
          <!-- Hero Card: Score & Status (Firefox Proton Style) -->
          <div class="fx-card fx-hero-card">
            <div class="fx-gauge-section">
              <div class="gauge-container">
                <svg class="gauge-svg" viewBox="0 0 90 90">
                  <circle class="gauge-bg" cx="45" cy="45" r="36"></circle>
                  <circle class="gauge-progress" cx="45" cy="45" r="36"></circle>
                </svg>
                <div class="gauge-text">
                  <span class="gauge-value">${score}</span>
                  <span class="gauge-label">Ризик</span>
                </div>
              </div>
              <div class="fx-session-details">
                <div class="fx-session-id" title="${sessionId || 'Немає активної сесії'}">
                  ${sessionId ? sessionId.substring(0, 24) + '...' : 'Пасивний монітор сторінки'}
                </div>
                <div class="fx-badge ${severity === 'HIGH' || severity === 'CRITICAL' ? 'badge-red' : severity === 'MEDIUM' ? 'badge-amber' : 'badge-green'}">
                  ${severity} РІВЕНЬ ЗАГРОЗИ
                </div>
                <div class="fx-subtext">Домен сторінки: <strong>${typeof window !== 'undefined' ? window.location.hostname || 'local' : 'n/a'}</strong></div>
              </div>
            </div>
          </div>

          <!-- False Positive & XAI Inspector Card (Firefox Warning Banner Style) -->
          <div class="fx-card fx-audit-box ${fpInfo.status === 'FP_CANDIDATE' ? 'alert-warning' : fpInfo.status === 'CONFIRMED_THREAT' ? 'alert-danger' : 'alert-success'}">
            <div class="fx-audit-header">
              <span class="fx-badge ${fpInfo.badgeClass}">
                ${fpInfo.badgeIcon}
                ${fpInfo.badgeText}
              </span>
              <button type="button" class="fx-btn-text" id="btn-copy-fp-report" title="Скопіювати структуровані дані для баг-репорту або Vitest-тесту">
                ${ICONS.copy(11, '#0060DF')}
                <span>Копіювати звіт</span>
              </button>
            </div>
            <p class="fx-audit-desc">${fpInfo.explanation}</p>

            <div class="fx-compare-grid">
              <div class="fx-compare-col">
                <span class="fx-col-title">Евристичний конвеєр</span>
                <span class="fx-col-val">${fpInfo.heuristicVerdict}</span>
              </div>
              <div class="fx-compare-col">
                <span class="fx-col-title">ШІ-Арбітр (Gemini Nano)</span>
                <span class="fx-col-val">${fpInfo.aiVerdict}</span>
              </div>
            </div>

            ${
              userMode === 'dev'
                ? `
              <div class="fx-triggers-box">
                <span class="fx-triggers-title">Спрацьовані фактори ризику:</span>
                <ul class="fx-triggers-list">
                  ${fpInfo.triggers.map((t) => `<li>${t}</li>`).join('')}
                </ul>
              </div>
            `
                : `
              <div class="fx-friendly-note">
                ${ICONS.info(13, '#0060DF')}
                <span><strong>Порада користувачеві:</strong> ${fpInfo.recommendation}</span>
              </div>
            `
            }

            <div class="fx-audit-actions">
              <button type="button" class="fx-btn fx-btn-secondary" id="btn-quick-whitelist">
                ${ICONS.shieldCheck(13)}
                <span>Додати домен до Довірених</span>
              </button>
              <button type="button" class="fx-btn fx-btn-secondary" id="btn-quick-reset-session">
                ${ICONS.refresh(13)}
                <span>Скинути стан тривоги</span>
              </button>
            </div>
          </div>

          <!-- Developer vs User mode explanation -->
          ${
            userMode === 'user'
              ? `
            <div class="fx-card fx-info-callout">
              <div class="fx-callout-title">
                ${ICONS.shield(13, '#0060DF')}
                <span>Як працює захист Threat Shield?</span>
              </div>
              <div class="fx-callout-text">
                Розширення одночасно аналізує структуру веб-форм, перевіряє приховані поля-пастки (CSS Cloaking), моніторить чати на спроби переведення в сторонні месенджери та звіряє підозрілі сайти з локальною нейромережею. Обробка здійснюється повністю локально без надсилання ваших даних на зовнішні сервери.
              </div>
            </div>
          `
              : `
            <div class="fx-card">
              <div class="fx-card-title">Декомпозиція конвеєра рішень</div>
              <div class="fx-waterfall">
                <div class="fx-waterfall-step">
                  <span>1. DOM & Form Scanners</span>
                  <span class="fx-tag">${logs.some((l) => l.isForm) ? 'Активно' : 'Очікування'}</span>
                </div>
                <div class="fx-waterfall-step">
                  <span>2. NLP Intent & Chat Monitor</span>
                  <span class="fx-tag">${logs.some((l) => l.stepKey.includes('Чат')) ? 'Активно' : 'Очікування'}</span>
                </div>
                <div class="fx-waterfall-step">
                  <span>3. Local LLM Arbiter (MV3)</span>
                  <span class="fx-tag ${logs.some((l) => l.isAi) ? 'fx-tag-blue' : ''}">${logs.some((l) => l.isAi) ? 'Оброблено' : 'В очікуванні'}</span>
                </div>
                <div class="fx-waterfall-step">
                  <span>4. Security Friction Engine</span>
                  <span class="fx-tag ${score >= 50 ? 'fx-tag-red' : ''}">${score >= 50 ? 'Блокування' : 'Пропуск'}</span>
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

        let iconColor = log.color || '#0060DF';
        let badgeType = 'LOG';
        if (log.isAi) badgeType = 'AI';
        else if (log.isForm) badgeType = 'FORM';
        else if (log.stepKey.includes('Контекст') || log.stepKey.includes('Сесій')) badgeType = 'CTX';
        else if (log.stepKey.includes('DLP') || log.stepKey.includes('Vault')) badgeType = 'VAULT';

        logsHtml += `
          <div class="fx-console-row" style="border-left-color: ${iconColor};">
            <div class="fx-row-header">
              <div class="fx-row-lead">
                <span class="fx-badge-type">${badgeType}</span>
                <span class="fx-row-key" style="color: ${iconColor}">${log.stepKey}</span>
              </div>
              <div class="fx-row-trail">
                <span class="fx-row-time">${log.time}</span>
                <button type="button" class="fx-copy-btn" data-copy="${encodeURIComponent(dataStr)}" title="Скопіювати дані події">
                  ${ICONS.copy(11)}
                </button>
              </div>
            </div>
            <pre class="fx-code-block">${dataStr}</pre>
          </div>
        `;
      });

      if (filteredLogs.length === 0) {
        logsHtml = `
          <div class="fx-empty-console">
            ${ICONS.info(24, '#8F8F9D')}
            <span>Подій за обраними фільтрами не знайдено</span>
          </div>
        `;
      }

      return `
        <div class="fx-events-wrapper">
          <!-- Filter toolbar (Firefox Proton Style) -->
          <div class="fx-filter-bar">
            <div class="fx-search-box">
              ${ICONS.search(12, '#8F8F9D')}
              <input type="text" id="fx-input-search" class="fx-search-input" placeholder="Пошук у логах..." value="${filterSearch}">
              ${filterSearch ? `<button type="button" id="btn-clear-search" class="fx-search-clear">${ICONS.close(10, '#8F8F9D')}</button>` : ''}
            </div>
            <div class="fx-filter-chips">
              <button type="button" class="fx-chip ${filterCategory === 'ALL' ? 'active' : ''}" data-cat="ALL">Всі (${logs.length})</button>
              <button type="button" class="fx-chip ${filterCategory === 'AI' ? 'active' : ''}" data-cat="AI">ШІ (${aiCount})</button>
              <button type="button" class="fx-chip ${filterCategory === 'FORM' ? 'active' : ''}" data-cat="FORM">Форми (${formCount})</button>
              <button type="button" class="fx-chip ${filterCategory === 'RISK' ? 'active' : ''}" data-cat="RISK">Ризики (${riskCount})</button>
            </div>
          </div>

          <div class="fx-logs-scroll" id="fx-logs-scroll">
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
          <div class="fx-empty-console" style="padding: 40px 20px;">
            ${ICONS.cpu(32, '#0060DF')}
            <div style="font-weight:600; color:#15141A; margin-top:8px;">Запитів до Gemini Nano ще не було</div>
            <div style="color:#5B5B66; font-size:11px; margin-top:4px; max-width:320px; line-height:1.4;">
              Локальна нейромережа викликається селективно для перевірки шахрайських намірів у чатах та аналізу підозрілих посилань без надсилання даних на зовнішні сервери.
            </div>
          </div>
        `;
      }

      let aiDetailsHtml = '';
      aiLogs.slice().reverse().forEach((log) => {
        const ctx = log.aiContext || {};
        aiDetailsHtml += `
          <div class="fx-card fx-ai-session-card">
            <div class="fx-ai-header">
              <div class="fx-ai-title-row">
                <span class="fx-badge badge-blue">GEMINI NANO API</span>
                <span class="fx-row-time">${log.time}</span>
              </div>
              <div class="fx-ai-verdict" style="color: ${log.color}">${log.data}</div>
            </div>

            <div class="fx-ai-sections">
              ${
                ctx.systemPrompt
                  ? `
                <div class="fx-ai-block">
                  <div class="fx-ai-block-header">
                    <span class="fx-ai-block-title">${ICONS.cpu(11, '#0060DF')} СИСТЕМНИЙ ПРОМПТ (РОЛЬ ЕКСПЕРТА)</span>
                    <button type="button" class="fx-btn-text" data-copy="${encodeURIComponent(ctx.systemPrompt)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="fx-code-block">${ctx.systemPrompt}</pre>
                </div>
              `
                  : ''
              }

              ${
                ctx.contextRules
                  ? `
                <div class="fx-ai-block">
                  <div class="fx-ai-block-header">
                    <span class="fx-ai-block-title">${ICONS.list(11, '#0060DF')} ПРАВИЛА ВЕРИФІКАЦІЇ (CONTEXT RULES)</span>
                    <button type="button" class="fx-btn-text" data-copy="${encodeURIComponent(ctx.contextRules)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="fx-code-block">${ctx.contextRules}</pre>
                </div>
              `
                  : ''
              }

              ${
                ctx.textSent
                  ? `
                <div class="fx-ai-block">
                  <div class="fx-ai-block-header">
                    <span class="fx-ai-block-title">${ICONS.message(11, '#0060DF')} ТЕКСТ / ПОСИЛАННЯ ДЛЯ СКАНУВАННЯ</span>
                    <button type="button" class="fx-btn-text" data-copy="${encodeURIComponent(ctx.textSent)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="fx-code-block">${ctx.textSent}</pre>
                </div>
              `
                  : ''
              }

              ${
                ctx.chatDialogue
                  ? `
                <div class="fx-ai-block">
                  <div class="fx-ai-block-header">
                    <span class="fx-ai-block-title">${ICONS.message(11, '#0060DF')} ІСТОРІЯ ЧАТУ (P2P ДІАЛОГ)</span>
                    <button type="button" class="fx-btn-text" data-copy="${encodeURIComponent(ctx.chatDialogue)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="fx-code-block">${ctx.chatDialogue}</pre>
                </div>
              `
                  : ''
              }

              ${
                ctx.rawResponse
                  ? `
                <div class="fx-ai-block raw-block">
                  <div class="fx-ai-block-header">
                    <span class="fx-ai-block-title" style="color:#0060DF;">${ICONS.terminal(11, '#0060DF')} СИРА ВІДПОВІДЬ LLM (RAW JSON RESPONSE)</span>
                    <button type="button" class="fx-btn-text" data-copy="${encodeURIComponent(ctx.rawResponse)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="fx-code-block raw-code">${ctx.rawResponse}</pre>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `;
      });

      return `<div class="fx-ai-tab-scroll">${aiDetailsHtml}</div>`;
    };

    let tabBody = '';
    if (activeTab === 'overview') tabBody = renderOverviewTab();
    else if (activeTab === 'events') tabBody = renderEventsTab();
    else if (activeTab === 'ai') tabBody = renderAiTab();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          /* Mozilla Firefox Proton Light Tokens */
          --fx-canvas:         #F0F0F4;
          --fx-surface:        #FFFFFF;
          --fx-surface-hover:  #E8E8EE;
          --fx-surface-active: #DFDFE6;
          --fx-border:         #CFCFD8;
          --fx-border-subtle:  #E5E5EB;
          --fx-text:           #15141A;
          --fx-text-secondary: #5B5B66;
          --fx-text-muted:     #8F8F9D;

          --fx-blue:           #0060DF;
          --fx-blue-hover:     #003EAA;
          --fx-blue-bg:        #E8F2FF;
          --fx-blue-bd:        #B0D5FF;

          --fx-green:          #008A52;
          --fx-green-bg:       #EAF7F3;
          --fx-green-bd:       #A3E5D0;

          --fx-amber:          #D76E00;
          --fx-amber-bg:       #FFF4E5;
          --fx-amber-bd:       #FFD599;

          --fx-red:            #D70022;
          --fx-red-hover:      #A4001A;
          --fx-red-bg:         #FDF2F5;
          --fx-red-bd:         #F8B4C0;

          --shadow-panel: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.1);
          --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.05);

          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          color: var(--fx-text);
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }

        *, *:before, *:after {
          box-sizing: border-box;
        }

        .fx-window {
          width: 100%;
          height: 100%;
          background: var(--fx-canvas);
          border: 1px solid var(--fx-border);
          border-radius: 8px;
          box-shadow: var(--shadow-panel);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-size: 12px;
        }

        /* Header (Firefox Proton Light Header) */
        .fx-titlebar {
          background: var(--fx-surface);
          padding: 9px 12px;
          border-bottom: 1px solid var(--fx-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: move;
          user-select: none;
        }
        .fx-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .fx-brand-icon {
          width: 22px;
          height: 22px;
          border-radius: 5px;
          background: linear-gradient(135deg, #0060DF 0%, #7542E5 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          box-shadow: 0 1px 4px rgba(0, 96, 223, 0.25);
        }
        .fx-app-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--fx-text);
          letter-spacing: 0.01em;
        }
        .fx-badge-edition {
          font-size: 9px;
          font-weight: 700;
          background: var(--fx-canvas);
          border: 1px solid var(--fx-border-subtle);
          color: var(--fx-text-secondary);
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        /* Window Controls */
        .fx-win-controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .fx-segmented-mode {
          display: flex;
          background: var(--fx-canvas);
          border: 1px solid var(--fx-border);
          border-radius: 4px;
          padding: 1px;
          margin-right: 4px;
        }
        .fx-mode-btn {
          background: transparent;
          border: none;
          color: var(--fx-text-secondary);
          font-size: 10px;
          font-weight: 600;
          padding: 3px 7px;
          border-radius: 3px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.12s;
        }
        .fx-mode-btn.active {
          background: var(--fx-blue);
          color: #FFFFFF;
        }
        .fx-tool-icon-btn {
          background: transparent;
          border: 1px solid transparent;
          color: var(--fx-text-secondary);
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 4px;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.12s;
        }
        .fx-tool-icon-btn:hover {
          background: var(--fx-surface-hover);
          color: var(--fx-text);
        }
        .fx-tool-icon-btn.danger:hover {
          background: var(--fx-red-bg);
          color: var(--fx-red);
          border-color: var(--fx-red-bd);
        }

        /* Tab Navigation (Firefox Proton 3-Tab Bar) */
        .fx-navbar {
          background: var(--fx-canvas);
          border-bottom: 1px solid var(--fx-border);
          display: flex;
          padding: 5px 10px 0;
          gap: 4px;
        }
        .fx-tab-item {
          background: transparent;
          border: none;
          color: var(--fx-text-secondary);
          font-size: 11.5px;
          font-weight: 500;
          padding: 7px 11px;
          cursor: pointer;
          border-radius: 4px 4px 0 0;
          border-bottom: 2px solid transparent;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.12s;
        }
        .fx-tab-item:hover {
          color: var(--fx-text);
          background: var(--fx-surface-hover);
        }
        .fx-tab-item.active {
          background: var(--fx-surface);
          color: var(--fx-blue);
          border-bottom-color: var(--fx-blue);
          font-weight: 600;
          box-shadow: 0 -1px 2px rgba(0, 0, 0, 0.04);
        }
        .fx-tab-counter {
          font-size: 9.5px;
          font-weight: 700;
          background: var(--fx-border-subtle);
          color: var(--fx-text-secondary);
          padding: 1px 5px;
          border-radius: 10px;
        }
        .fx-tab-item.active .fx-tab-counter {
          background: var(--fx-blue-bg);
          color: var(--fx-blue);
        }

        /* Viewport */
        .fx-viewport {
          flex: 1;
          overflow-y: auto;
          background: var(--fx-canvas);
          display: flex;
          flex-direction: column;
        }

        /* Firefox Light Scrollbar */
        ::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: var(--fx-border);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--fx-text-muted);
        }

        /* Cards & Components */
        .fx-card {
          background: var(--fx-surface);
          border: 1px solid var(--fx-border);
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 10px;
          box-shadow: var(--shadow-card);
        }
        .fx-overview-layout {
          padding: 12px;
          display: flex;
          flex-direction: column;
        }
        .fx-hero-card {
          padding: 12px 14px;
        }
        .fx-gauge-section {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .gauge-container {
          position: relative;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .gauge-svg {
          transform: rotate(-90deg);
          width: 80px;
          height: 80px;
          overflow: visible;
        }
        .gauge-bg {
          fill: none;
          stroke: var(--fx-border-subtle);
          stroke-width: 8;
        }
        .gauge-progress {
          fill: none;
          stroke: ${riskColor};
          stroke-width: 8;
          stroke-linecap: round;
          stroke-dasharray: ${strokeDasharray};
          stroke-dashoffset: ${strokeDashoffset};
          transition: stroke-dashoffset 0.5s ease-out, stroke 0.5s ease;
        }
        .gauge-text {
          position: absolute;
          text-align: center;
          display: flex;
          flex-direction: column;
        }
        .gauge-value {
          font-size: 18px;
          font-weight: 700;
          color: ${riskColor};
          line-height: 1;
        }
        .gauge-label {
          font-size: 8.5px;
          color: var(--fx-text-muted);
          text-transform: uppercase;
          margin-top: 2px;
        }
        .fx-session-details {
          flex: 1;
          min-width: 0;
        }
        .fx-session-id {
          font-family: 'JetBrains Mono', Consolas, monospace;
          font-size: 11px;
          font-weight: 600;
          color: var(--fx-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }
        .fx-subtext {
          font-size: 10.5px;
          color: var(--fx-text-secondary);
          margin-top: 4px;
        }
        .fx-subtext strong {
          color: var(--fx-text);
        }

        /* Badges (Firefox Proton Tags) */
        .fx-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 9.5px;
          font-weight: 700;
          padding: 3px 7px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .badge-red { background: var(--fx-red-bg); color: var(--fx-red); border: 1px solid var(--fx-red-bd); }
        .badge-amber { background: var(--fx-amber-bg); color: var(--fx-amber); border: 1px solid var(--fx-amber-bd); }
        .badge-green { background: var(--fx-green-bg); color: var(--fx-green); border: 1px solid var(--fx-green-bd); }
        .badge-blue { background: var(--fx-blue-bg); color: var(--fx-blue); border: 1px solid var(--fx-blue-bd); }

        /* Audit Box (Firefox Proton Warning / Protection Hero Style) */
        .fx-audit-box {
          border-left-width: 4px;
        }
        .fx-audit-box.alert-warning {
          border-left-color: var(--fx-amber);
          background: linear-gradient(180deg, #FFFFFF 0%, #FFFDF9 100%);
          border-color: var(--fx-amber-bd);
        }
        .fx-audit-box.alert-danger {
          border-left-color: var(--fx-red);
          background: linear-gradient(180deg, #FFFFFF 0%, #FFF9F9 100%);
          border-color: var(--fx-red-bd);
        }
        .fx-audit-box.alert-success {
          border-left-color: var(--fx-green);
          background: linear-gradient(180deg, #FFFFFF 0%, #FDFEFE 100%);
          border-color: var(--fx-green-bd);
        }
        .fx-audit-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .fx-btn-text {
          background: transparent;
          border: none;
          color: var(--fx-blue);
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: background 0.12s;
        }
        .fx-btn-text:hover {
          background: var(--fx-blue-bg);
        }
        .fx-audit-desc {
          font-size: 11.5px;
          color: var(--fx-text);
          line-height: 1.45;
          margin-bottom: 10px;
        }
        .fx-compare-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 10px;
        }
        .fx-compare-col {
          background: #F7F7FA;
          border: 1px solid var(--fx-border-subtle);
          border-radius: 4px;
          padding: 7px 9px;
        }
        .fx-col-title {
          display: block;
          font-size: 9px;
          text-transform: uppercase;
          color: var(--fx-text-muted);
          font-weight: 700;
          margin-bottom: 3px;
        }
        .fx-col-val {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--fx-text);
        }

        .fx-triggers-box {
          background: #F7F7FA;
          border: 1px solid var(--fx-border-subtle);
          border-radius: 4px;
          padding: 8px;
          margin-bottom: 10px;
        }
        .fx-triggers-title {
          font-size: 9.5px;
          font-weight: 700;
          color: var(--fx-text-secondary);
          text-transform: uppercase;
        }
        .fx-triggers-list {
          list-style: square inside;
          font-family: 'JetBrains Mono', Consolas, monospace;
          font-size: 10.5px;
          color: var(--fx-amber);
          margin-top: 4px;
          line-height: 1.4;
        }

        .fx-friendly-note {
          background: #F0F0F4;
          border: 1px solid var(--fx-border-subtle);
          border-radius: 4px;
          padding: 8px 10px;
          font-size: 11px;
          color: var(--fx-text-secondary);
          line-height: 1.35;
          margin-bottom: 10px;
          display: flex;
          align-items: flex-start;
          gap: 6px;
        }
        .fx-friendly-note strong {
          color: var(--fx-text);
        }

        .fx-audit-actions {
          display: flex;
          gap: 8px;
        }
        .fx-btn {
          flex: 1;
          background: var(--fx-blue);
          color: #FFFFFF;
          border: none;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: background 0.12s;
        }
        .fx-btn:hover {
          background: var(--fx-blue-hover);
        }
        .fx-btn-secondary {
          background: var(--fx-canvas);
          color: var(--fx-text);
          border: 1px solid var(--fx-border);
        }
        .fx-btn-secondary:hover {
          background: var(--fx-surface-hover);
          border-color: var(--fx-text-muted);
        }

        /* Callout */
        .fx-info-callout {
          background: var(--fx-surface);
          border-left: 3px solid var(--fx-blue);
        }
        .fx-callout-title {
          font-weight: 700;
          font-size: 11.5px;
          color: var(--fx-text);
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fx-callout-text {
          font-size: 11px;
          color: var(--fx-text-secondary);
          line-height: 1.45;
        }

        /* Waterfall */
        .fx-card-title {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--fx-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .fx-waterfall {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .fx-waterfall-step {
          background: #F7F7FA;
          border: 1px solid var(--fx-border-subtle);
          border-radius: 4px;
          padding: 6px 9px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: var(--fx-text);
        }
        .fx-tag {
          font-size: 9.5px;
          font-weight: 600;
          padding: 1px 5px;
          border-radius: 3px;
          background: var(--fx-border-subtle);
          color: var(--fx-text-secondary);
        }
        .fx-tag-blue {
          background: var(--fx-blue-bg);
          color: var(--fx-blue);
          border: 1px solid var(--fx-blue-bd);
        }
        .fx-tag-red {
          background: var(--fx-red-bg);
          color: var(--fx-red);
          border: 1px solid var(--fx-red-bd);
        }

        /* Events Tab Styles */
        .fx-events-wrapper {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .fx-filter-bar {
          background: var(--fx-surface);
          padding: 8px 10px;
          border-bottom: 1px solid var(--fx-border);
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .fx-search-box {
          position: relative;
          flex: 1;
          min-width: 140px;
          display: flex;
          align-items: center;
        }
        .fx-search-box svg {
          position: absolute;
          left: 8px;
          pointer-events: none;
        }
        .fx-search-input {
          width: 100%;
          background: var(--fx-surface);
          border: 1px solid var(--fx-border);
          border-radius: 4px;
          padding: 4px 22px 4px 26px;
          color: var(--fx-text);
          font-size: 11.5px;
          outline: none;
          transition: border-color 0.12s, box-shadow 0.12s;
        }
        .fx-search-input:focus {
          border-color: var(--fx-blue);
          outline: 2px solid var(--fx-blue);
          outline-offset: 1px;
        }
        .fx-search-clear {
          position: absolute;
          right: 5px;
          background: transparent;
          border: none;
          color: var(--fx-text-muted);
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .fx-search-clear:hover {
          color: var(--fx-text);
        }
        .fx-filter-chips {
          display: flex;
          gap: 4px;
        }
        .fx-chip {
          background: var(--fx-canvas);
          border: 1px solid var(--fx-border);
          color: var(--fx-text-secondary);
          font-size: 10.5px;
          font-weight: 500;
          padding: 3px 8px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.12s;
        }
        .fx-chip:hover {
          background: var(--fx-surface-hover);
          color: var(--fx-text);
        }
        .fx-chip.active {
          background: var(--fx-blue-bg);
          border-color: var(--fx-blue);
          color: var(--fx-blue);
          font-weight: 600;
        }
        .fx-logs-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .fx-console-row {
          background: var(--fx-surface);
          border: 1px solid var(--fx-border);
          border-left-width: 3px;
          border-radius: 6px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          box-shadow: var(--shadow-card);
        }
        .fx-row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .fx-row-lead {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fx-badge-type {
          font-size: 8.5px;
          font-weight: 700;
          background: var(--fx-canvas);
          border: 1px solid var(--fx-border-subtle);
          color: var(--fx-text-secondary);
          padding: 1px 4px;
          border-radius: 3px;
        }
        .fx-row-key {
          font-size: 11.5px;
          font-weight: 600;
        }
        .fx-row-trail {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fx-row-time {
          font-family: 'JetBrains Mono', Consolas, monospace;
          font-size: 10px;
          color: var(--fx-text-muted);
        }
        .fx-copy-btn {
          background: transparent;
          border: none;
          color: var(--fx-text-muted);
          cursor: pointer;
          padding: 2px 4px;
          font-size: 10px;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.12s;
        }
        .fx-copy-btn:hover {
          color: var(--fx-text);
          background: var(--fx-surface-hover);
        }
        .fx-code-block {
          background: #F7F7FA;
          border: 1px solid var(--fx-border-subtle);
          border-radius: 4px;
          padding: 7px 9px;
          font-family: 'JetBrains Mono', Consolas, monospace;
          font-size: 10.5px;
          color: var(--fx-text);
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.45;
          max-height: 180px;
          overflow-y: auto;
        }
        .fx-empty-console {
          padding: 50px 20px;
          text-align: center;
          color: var(--fx-text-muted);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        /* AI Tab Styles */
        .fx-ai-tab-scroll {
          padding: 10px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .fx-ai-session-card {
          border-left: 3px solid var(--fx-blue);
        }
        .fx-ai-header {
          margin-bottom: 10px;
        }
        .fx-ai-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .fx-ai-verdict {
          font-size: 12px;
          font-weight: 600;
          line-height: 1.4;
          white-space: pre-wrap;
        }
        .fx-ai-sections {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .fx-ai-block {
          background: #F7F7FA;
          border: 1px solid var(--fx-border-subtle);
          border-radius: 4px;
          padding: 8px;
        }
        .fx-ai-block.raw-block {
          border-color: var(--fx-blue-bd);
          background: var(--fx-blue-bg);
        }
        .fx-ai-block-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9.5px;
          font-weight: 700;
          color: var(--fx-text-secondary);
          margin-bottom: 5px;
        }
        .fx-ai-block-title {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .fx-code-block.raw-code {
          background: var(--fx-surface);
          border-color: var(--fx-blue-bd);
          color: #0040A8;
        }
      </style>

      <div class="fx-window">
        <!-- Titlebar (Firefox Light Proton Header) -->
        <div class="fx-titlebar" id="drag-handle">
          <div class="fx-title-group">
            <div class="fx-brand-icon">
              ${ICONS.shield(14, '#FFFFFF')}
            </div>
            <span class="fx-app-name">Threat Shield</span>
            <span class="fx-badge-edition">DevTools MV3</span>
          </div>
          <div class="fx-win-controls">
            <div class="fx-segmented-mode">
              <button type="button" class="fx-mode-btn ${userMode === 'user' ? 'active' : ''}" id="btn-mode-user" title="Спрощене пояснення для користувача">
                ${ICONS.info(11)}
                <span>Інфо</span>
              </button>
              <button type="button" class="fx-mode-btn ${userMode === 'dev' ? 'active' : ''}" id="btn-mode-dev" title="Повний інспектор для розробника">
                ${ICONS.code(11)}
                <span>Dev</span>
              </button>
            </div>
            <button type="button" class="fx-tool-icon-btn" id="btn-export-json" title="Експортувати повний діагностичний звіт у JSON">
              ${ICONS.download(13)}
            </button>
            <button type="button" class="fx-tool-icon-btn" id="btn-clear-all" title="Очистити консоль">
              ${ICONS.trash(13)}
            </button>
            <button type="button" class="fx-tool-icon-btn" id="btn-minimize" title="Згорнути у плаваючий віджет">
              ${ICONS.minimize(13)}
            </button>
            <button type="button" class="fx-tool-icon-btn danger" id="btn-close-window" title="Закрити">
              ${ICONS.close(13)}
            </button>
          </div>
        </div>

        <!-- DevTools Tabs Navigation (Proton 3-Tab Style) -->
        <nav class="fx-navbar">
          <button type="button" class="fx-tab-item ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
            ${ICONS.activity(12)}
            <span>Огляд та XAI</span>
            ${fpInfo.status === 'FP_CANDIDATE' ? '<span class="fx-tab-counter" style="background:#FFF4E5; color:#D76E00;">FP?</span>' : ''}
          </button>
          <button type="button" class="fx-tab-item ${activeTab === 'events' ? 'active' : ''}" data-tab="events">
            ${ICONS.terminal(12)}
            <span>Консоль подій</span>
            <span class="fx-tab-counter">${logs.length}</span>
          </button>
          <button type="button" class="fx-tab-item ${activeTab === 'ai' ? 'active' : ''}" data-tab="ai">
            ${ICONS.cpu(12)}
            <span>ШІ-Арбітр</span>
            <span class="fx-tab-counter">${aiCount}</span>
          </button>
        </nav>

        <!-- Viewport content -->
        <div class="fx-viewport">
          ${tabBody}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  // Рендеринг компактного віджета (Minimized Pill у світлому стилі Firefox)
  private static renderMinimized() {
    if (!this.shadowRoot) return;

    const { severity, score, logs } = this.state;
    const riskColor =
      severity === 'CRITICAL' || severity === 'HIGH'
        ? '#D70022'
        : severity === 'MEDIUM'
        ? '#D76E00'
        : '#008A52';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .fx-pill {
          background: #FFFFFF;
          border: 1px solid #CFCFD8;
          border-left: 4px solid ${riskColor};
          border-radius: 20px;
          padding: 6px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #15141A;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
          transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          user-select: none;
        }
        .fx-pill:hover {
          transform: translateY(-2px);
          background: #F7F7FA;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
        }
        .fx-pill-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .fx-pill-text {
          font-size: 11.5px;
          font-weight: 700;
          color: #15141A;
        }
        .fx-pill-badge {
          font-size: 9.5px;
          font-weight: 700;
          background: ${riskColor === '#008A52' ? '#EAF7F3' : riskColor === '#D76E00' ? '#FFF4E5' : '#FDF2F5'};
          color: ${riskColor};
          border: 1px solid ${riskColor === '#008A52' ? '#A3E5D0' : riskColor === '#D76E00' ? '#FFD599' : '#F8B4C0'};
          padding: 1px 6px;
          border-radius: 3px;
        }
        .fx-pill-count {
          font-size: 10px;
          color: #8F8F9D;
          font-family: monospace;
          display: flex;
          align-items: center;
          gap: 4px;
        }
      </style>
      <div class="fx-pill" id="btn-restore">
        <span class="fx-pill-icon">${ICONS.shield(14, riskColor)}</span>
        <span class="fx-pill-text">Threat Shield Dev</span>
        <span class="fx-pill-badge">${score}/100</span>
        <span class="fx-pill-count">
          <span>${logs.length} logs</span>
          ${ICONS.expand(11, '#8F8F9D')}
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

    // Window controls
    const handle = this.shadowRoot.getElementById('drag-handle');
    handle?.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      if (this.container) {
        this.offsetX = e.clientX - this.container.getBoundingClientRect().left;
        this.offsetY = e.clientY - this.container.getBoundingClientRect().top;
      }
    });

    this.shadowRoot.getElementById('btn-close-window')?.addEventListener('click', () => {
      this.hide();
    });

    this.shadowRoot.getElementById('btn-minimize')?.addEventListener('click', () => {
      this.state.isMinimized = true;
      this.render();
    });

    this.shadowRoot.getElementById('btn-clear-all')?.addEventListener('click', () => {
      this.clear();
    });

    this.shadowRoot.getElementById('btn-export-json')?.addEventListener('click', (e) => {
      const json = this.exportDiagnosticReport();
      this.copyToClipboard(json, e.currentTarget as HTMLElement, 'Звіт скопійовано!');
    });

    // Mode toggles
    this.shadowRoot.getElementById('btn-mode-user')?.addEventListener('click', () => {
      this.state.userMode = 'user';
      this.render();
    });
    this.shadowRoot.getElementById('btn-mode-dev')?.addEventListener('click', () => {
      this.state.userMode = 'dev';
      this.render();
    });

    // Tabs switching
    this.shadowRoot.querySelectorAll('.fx-tab-item').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tab = (tabBtn as HTMLElement).dataset.tab as NeuromonitorTab;
        if (tab) {
          this.state.activeTab = tab;
          this.render();
        }
      });
    });

    // Quick FP actions
    this.shadowRoot.getElementById('btn-copy-fp-report')?.addEventListener('click', (e) => {
      const json = this.exportDiagnosticReport();
      this.copyToClipboard(json, e.currentTarget as HTMLElement, 'Скопійовано!');
    });

    this.shadowRoot.getElementById('btn-quick-whitelist')?.addEventListener('click', async (e) => {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (host) {
        try {
          await UserWhitelistManager.allowDomain(host);
          this.log('Білий список', `Домен ${host} додано до довірених через оверлей`, '#008A52');
          const btn = e.currentTarget as HTMLElement;
          if (btn) btn.innerHTML = `${ICONS.check(12)} <span>Додано!</span>`;
        } catch {
          window.postMessage({ type: 'THREAT_SHIELD_ADD_WHITELIST', host }, '*');
        }
      }
    });

    this.shadowRoot.getElementById('btn-quick-reset-session')?.addEventListener('click', () => {
      window.postMessage({ type: 'THREAT_SHIELD_CLEAR_CONTEXT' }, '*');
      this.log('Система', 'Користувач примусово скинув стан тривоги', '#008A52');
    });

    // Event Console Filter events
    const searchInput = this.shadowRoot.getElementById('fx-input-search') as HTMLInputElement | null;
    searchInput?.addEventListener('input', (e) => {
      this.state.filterSearch = (e.target as HTMLInputElement).value;
      this.render();
    });

    this.shadowRoot.getElementById('btn-clear-search')?.addEventListener('click', () => {
      this.state.filterSearch = '';
      this.render();
    });

    this.shadowRoot.querySelectorAll('.fx-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const cat = (chip as HTMLElement).dataset.cat as NeuromonitorCategoryFilter;
        if (cat) {
          this.state.filterCategory = cat;
          this.render();
        }
      });
    });

    // Generic Copy buttons
    this.shadowRoot.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = (btn as HTMLElement).dataset.copy;
        if (raw) {
          const decoded = decodeURIComponent(raw);
          this.copyToClipboard(decoded, btn as HTMLElement, 'Скопійовано');
        }
      });
    });

    // Auto-scroll on logs tab
    if (this.state.activeTab === 'events') {
      const logsContainer = this.shadowRoot.getElementById('fx-logs-scroll');
      if (logsContainer && !this.state.filterSearch) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
      }
    }
  }

  private static setupDrag() {
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging && this.container) {
        this.container.style.left = `${e.clientX - this.offsetX}px`;
        this.container.style.top = `${e.clientY - this.offsetY}px`;
        this.container.style.right = 'auto';
        this.container.style.bottom = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }
}
