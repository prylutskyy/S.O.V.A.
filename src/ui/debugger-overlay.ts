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

  private static state = {
    sessionId: null as string | null,
    severity: 'LOW' as string,
    score: 0,
    activeTab: 'overview' as NeuromonitorTab,
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
        minWidth: '380px',
        minHeight: '480px',
        maxWidth: '92vw',
        maxHeight: '92vh',
        zIndex: '2147483647',
        display: 'block',
        resize: 'both',
        overflow: 'hidden',
        borderRadius: '22px',
        boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.06)',
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

    this.render();
    return currentId;
  }

  // Оцінка консенсусу (Евристика vs Gemini Nano)
  private static assessFalsePositive() {
    const { score, severity, logs } = this.state;
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
        l.stepKey.includes('Ризик') ||
        l.stepKey.includes('Trap') ||
        l.stepKey.includes('СКАМ')
      ) {
        triggers.push(l.stepKey);
      }
    });

    const isAiDisproved = lastAiVerdict !== null && !lastAiVerdict.isScam;
    const isAiConfirmed = lastAiVerdict !== null && lastAiVerdict.isScam;

    if (isHeuristicRisk && isAiDisproved) {
      return {
        status: 'FP_CANDIDATE',
        badgeIcon: ICONS.alertTriangle(12, '#B25900'),
        badgeText: 'РОЗБІЖНІСТЬ: ЙМОВІРНИЙ FALSE POSITIVE',
        badgeClass: 'sc-badge-amber',
        explanation: `Евристика зафіксувала ${score}/100 балів, але локальний ШІ Gemini Nano підтвердив безпечність (${lastAiVerdict?.confidence}% впевненості). Рекомендується довірити або уточнити статус сторінки.`,
        recommendation: 'Можливе надмірне спрацювання на легітимній формі.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: `Безпечно (${lastAiVerdict?.confidence}%)`,
        triggers,
      };
    } else if (isHeuristicRisk && isAiConfirmed) {
      return {
        status: 'CONFIRMED_THREAT',
        badgeIcon: ICONS.alertCircle(12, '#D70015'),
        badgeText: 'ПІДТВЕРДЖЕНА ЗАГРОЗА (TRUE POSITIVE)',
        badgeClass: 'sc-badge-red',
        explanation: `Консенсус безпеки: евристика (${score} балів) та Gemini Nano (${lastAiVerdict?.confidence}%) підтвердили зловмисний намір або фішинг.`,
        recommendation: 'Захисне блокування та переривання введення повністю виправдані.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: `СКАМ (${lastAiVerdict?.confidence}%)`,
        triggers,
      };
    } else if (isHeuristicRisk && !lastAiVerdict) {
      return {
        status: 'HEURISTIC_ONLY',
        badgeIcon: ICONS.zap(12, '#B25900'),
        badgeText: 'ЕВРИСТИЧНЕ СПРАЦЮВАННЯ',
        badgeClass: 'sc-badge-amber',
        explanation: `Спрацювали анатомічні фільтри форм (${score} балів). ШІ-арбітраж ще триває або форма заблокована жорстким правилом.`,
        recommendation: 'Перевірте виявлені підозрілі поля у списку тригерів нижче.',
        heuristicVerdict: `Ризик ${score}/100 (${severity})`,
        aiVerdict: 'Очікується аналіз',
        triggers,
      };
    } else {
      return {
        status: 'CLEAN',
        badgeIcon: ICONS.shieldCheck(12, '#248A3D'),
        badgeText: 'НОРМА: АНОМАЛІЙ НЕ ВИЯВЛЕНО',
        badgeClass: 'sc-badge-green',
        explanation:
          'Форми та комунікації на цій сторінці відповідають стандартам безпеки. Ознак фішингу, прихованих полів або викрадення балансу немає.',
        recommendation: 'Система функціонує у фоновому пасивному режимі.',
        heuristicVerdict: `Безпечно (${score}/100)`,
        aiVerdict: lastAiVerdict ? 'Безпечно' : 'У нормі',
        triggers: triggers.length > 0 ? triggers : ['Тригери відсутні'],
      };
    }
  }

  // Генерація діагностичного звіту у форматі JSON
  private static exportDiagnosticReport(): string {
    const fpAssessment = this.assessFalsePositive();
    const report = {
      generator: 'Sanctuary Core · Swiss Loupe Telemetry (MV3 Light)',
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      hostname: typeof window !== 'undefined' ? window.location.hostname : '',
      sessionId: this.state.sessionId,
      severity: this.state.severity,
      score: this.state.score,
      falsePositiveAssessment: fpAssessment,
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

  private static render() {
    if (!this.shadowRoot) return;

    if (this.state.isMinimized) {
      this.applyContainerGeometry();
      this.renderMinimized();
      return;
    }

    this.applyContainerGeometry();

    const { sessionId, severity, score, logs, activeTab, filterCategory, filterSearch } = this.state;

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
    const aiCount = logs.filter((l) => l.isAi).length;
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
                <div class="sc-subtext">${sessionId ? `Сесія: ${sessionId.substring(0, 16)}...` : 'Пасивний фоновий моніторинг'}</div>
              </div>
            </div>

            <!-- 2. 4 Стовпи Телеметрії (Швейцарська Лупа) -->
            <div class="sc-loupe-pillars">
              <div class="sc-pillar-cell">
                <span class="sc-pillar-label">Евристичний ризик</span>
                <span class="sc-pillar-val" style="color: ${riskColor}">${score}/100</span>
              </div>
              <div class="sc-pillar-cell">
                <span class="sc-pillar-label">Gemini Nano XAI</span>
                <span class="sc-pillar-val sc-val-blue">${aiCount > 0 ? (logs.some((l) => l.isAi && l.isPending) ? 'Аналіз Nano...' : 'On-Device (~140ms)') : 'Вбудований ШІ'}</span>
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
          <div class="sc-empty-state">
            ${ICONS.terminal(28, '#86868B')}
            <div class="sc-empty-title">Подій поки що немає</div>
            <div class="sc-empty-sub">Евристичний сканер безперервно відстежує активність сторінки.</div>
          </div>
        `;
      } else {
        filteredLogs.forEach((log) => {
          const dataStr =
            typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data);

          let badgeType = 'LOG';
          if (log.isAi) badgeType = 'AI';
          else if (log.isForm) badgeType = 'FORM';
          else if (log.stepKey.includes('Контекст') || log.stepKey.includes('Сесій')) badgeType = 'CTX';
          else if (log.stepKey.includes('DLP') || log.stepKey.includes('Vault')) badgeType = 'VAULT';

          logsHtml += `
            <div class="sc-event-card">
              <div class="sc-event-header">
                <div class="sc-event-title-wrap">
                  <span class="sc-status-dot" style="background: ${log.color};"></span>
                  <span class="sc-event-badge sc-badge-${badgeType.toLowerCase()}">${badgeType}</span>
                  <span class="sc-event-title">${log.stepKey}</span>
                </div>
                <div class="sc-event-right">
                  <span class="sc-event-time">${log.time}</span>
                  <button type="button" class="sc-copy-icon-btn" data-copy="${encodeURIComponent(dataStr)}" title="Скопіювати">
                    ${ICONS.copy(11)}
                  </button>
                </div>
              </div>
              <pre class="sc-event-code">${dataStr}</pre>
            </div>
          `;
        });
      }

      return `
        <div class="sc-events-view">
          <div class="sc-filter-toolbar">
            <div class="sc-search-box">
              ${ICONS.search(12, '#86868B')}
              <input type="text" id="sc-input-search" class="sc-search-input" placeholder="Пошук у подіях..." value="${filterSearch}">
              ${filterSearch ? `<button type="button" id="btn-clear-search" class="sc-search-clear">${ICONS.close(10, '#86868B')}</button>` : ''}
            </div>
            <div class="sc-filter-chips">
              <button type="button" class="sc-chip ${filterCategory === 'ALL' ? 'active' : ''}" data-cat="ALL">Всі (${logs.length})</button>
              <button type="button" class="sc-chip ${filterCategory === 'AI' ? 'active' : ''}" data-cat="AI">ШІ (${aiCount})</button>
              <button type="button" class="sc-chip ${filterCategory === 'FORM' ? 'active' : ''}" data-cat="FORM">Форми (${formCount})</button>
              <button type="button" class="sc-chip ${filterCategory === 'RISK' ? 'active' : ''}" data-cat="RISK">Ризики (${riskCount})</button>
            </div>
          </div>
          <div class="sc-events-scroll" id="sc-logs-scroll">
            ${logsHtml}
          </div>
        </div>
      `;
    };

    // Вкладка 3: Gemini Nano
    const renderAiTab = () => {
      const aiLogs = logs.filter((l) => l.isAi);
      if (aiLogs.length === 0) {
        return `
          <div class="sc-empty-state" style="padding: 48px 24px;">
            ${ICONS.cpu(36, '#0071E3')}
            <div class="sc-empty-title">Запитів до Gemini Nano ще не було</div>
            <div class="sc-empty-sub" style="max-width: 320px;">
              Локальна нейромережа викликається селективно для перевірки шахрайських намірів у чатах та аналізу підозрілих форм без передачі даних у хмару.
            </div>
          </div>
        `;
      }

      let aiDetailsHtml = '';
      aiLogs.slice().reverse().forEach((log) => {
        const ctx = log.aiContext || {};
        aiDetailsHtml += `
          <div class="sc-card sc-ai-card">
            <div class="sc-ai-header">
              <div class="sc-badge sc-badge-blue">
                ${ICONS.cpu(11, '#0071E3')}
                <span>GEMINI NANO ON-DEVICE</span>
              </div>
              <span class="sc-event-time">${log.time}</span>
            </div>
            <div class="sc-ai-verdict" style="color: ${log.color}">${log.isPending ? '<span class="sc-spin">⏳</span> ' : ''}${log.data}</div>

            <div class="sc-ai-sections">
              ${
                ctx.systemPrompt
                  ? `
                <div class="sc-ai-box">
                  <div class="sc-ai-box-title">
                    <span>СИСТЕМНИЙ ПРОМПТ</span>
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
                ctx.textSent
                  ? `
                <div class="sc-ai-box">
                  <div class="sc-ai-box-title">
                    <span>АНАЛІЗОВАНИЙ КОНТЕНТ</span>
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
                ctx.rawResponse
                  ? `
                <div class="sc-ai-box">
                  <div class="sc-ai-box-title">
                    <span style="color:#0071E3;">ВІДПОВІДЬ МОДЕЛІ (RAW JSON)</span>
                    <button type="button" class="sc-btn-ghost" data-copy="${encodeURIComponent(ctx.rawResponse)}">
                      ${ICONS.copy(10)} <span>Копіювати</span>
                    </button>
                  </div>
                  <pre class="sc-code-block" style="color: #0071E3;">${ctx.rawResponse}</pre>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `;
      });

      return `<div class="sc-ai-scroll">${aiDetailsHtml}</div>`;
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
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1D1D1F;
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }

        *, *:before, *:after {
          box-sizing: border-box;
        }

        /* 1. Pure Crystalline Ceramic Glass Container */
        .sc-window {
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.90);
          backdrop-filter: blur(32px) saturate(180%);
          -webkit-backdrop-filter: blur(32px) saturate(180%);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 22px;
          box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.03);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-size: 12.5px;
          color: #1D1D1F;
        }

        /* 2. Apple Precision Titlebar */
        .sc-titlebar {
          background: rgba(255, 255, 255, 0.95);
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
          background: linear-gradient(135deg, #0071E3 0%, #42A5F5 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
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
          color: #1D1D1F;
          letter-spacing: -0.015em;
        }
        .sc-brand-pill {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          background: rgba(0, 0, 0, 0.05);
          color: #515154;
          border-radius: 9999px;
          letter-spacing: 0.02em;
        }

        .sc-win-controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .sc-tool-btn {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: #6E6E73;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sc-tool-btn:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #1D1D1F;
        }
        .sc-tool-btn:active {
          transform: scale(0.92);
        }
        .sc-tool-btn-close:hover {
          background: rgba(255, 59, 48, 0.12);
          color: #D70015;
        }

        /* 3. Cupertino Segmented Tab Bar */
        .sc-tab-bar {
          display: flex;
          background: rgba(0, 0, 0, 0.04);
          border-radius: 10px;
          padding: 3px;
          margin: 10px 16px 4px 16px;
          gap: 3px;
        }
        .sc-tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #6E6E73;
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sc-tab-btn.active {
          background: #FFFFFF;
          color: #1D1D1F;
          font-weight: 600;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }
        .sc-tab-btn:hover:not(.active) {
          color: #1D1D1F;
        }

        /* 4. Viewport Scroll Container */
        .sc-viewport {
          flex: 1;
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
          background: #FFFFFF;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 14px;
          padding: 14px;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.02);
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
          color: #1D1D1F;
          letter-spacing: -0.03em;
        }
        .sc-gauge-label {
          font-size: 8.5px;
          font-weight: 600;
          text-transform: uppercase;
          color: #86868B;
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
          color: #1D1D1F;
          letter-spacing: -0.015em;
        }
        .sc-subtext {
          font-size: 10.5px;
          color: #86868B;
        }

        /* 4 Swiss Loupe Pillars */
        .sc-loupe-pillars {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          background: rgba(0, 0, 0, 0.025);
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: 10px;
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
          color: #86868B;
          font-weight: 500;
        }
        .sc-pillar-val {
          font-size: 11px;
          font-weight: 600;
          color: #1D1D1F;
        }
        .sc-val-green { color: #248A3D; }
        .sc-val-blue { color: #0071E3; }
        .sc-val-amber { color: #B25900; }
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
          color: #248A3D;
        }
        .sc-badge-amber {
          background: rgba(255, 149, 0, 0.12);
          border: 1px solid rgba(255, 149, 0, 0.25);
          color: #B25900;
        }
        .sc-badge-red {
          background: rgba(255, 59, 48, 0.10);
          border: 1px solid rgba(255, 59, 48, 0.22);
          color: #D70015;
        }
        .sc-badge-blue {
          background: rgba(0, 113, 227, 0.10);
          border: 1px solid rgba(0, 113, 227, 0.20);
          color: #0071E3;
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
          color: #1D1D1F;
        }
        .sc-verdict-text {
          font-size: 11.5px;
          color: #515154;
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
          color: #6E6E73;
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
          color: #1D1D1F;
        }

        .sc-action-row {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }
        .sc-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 500;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: #FFFFFF;
          color: #1D1D1F;
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
          color: #0071E3;
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
          margin-bottom: 10px;
        }
        .sc-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #FFFFFF;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 9px;
          padding: 6px 10px;
        }
        .sc-search-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 11.5px;
          color: #1D1D1F;
          outline: none;
        }
        .sc-search-input::placeholder {
          color: #86868B;
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
          padding: 3px 9px;
          border-radius: 9999px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(0, 0, 0, 0.03);
          color: #6E6E73;
          font-size: 10.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sc-chip.active {
          background: #0071E3;
          color: #FFFFFF;
          border-color: #0071E3;
        }

        /* Events Timeline */
        .sc-event-card {
          background: #FFFFFF;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 12px;
          padding: 10px 12px;
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
          color: #0071E3;
        }
        .sc-badge-form {
          background: rgba(52, 199, 89, 0.10);
          color: #248A3D;
        }
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
          color: #6E6E73;
        }
        .sc-event-title {
          font-size: 11.5px;
          font-weight: 600;
          color: #1D1D1F;
          letter-spacing: -0.01em;
        }
        .sc-event-right {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sc-event-time {
          font-size: 10px;
          color: #86868B;
          font-family: var(--font-mono, monospace);
        }
        .sc-copy-icon-btn {
          background: transparent;
          border: none;
          color: #86868B;
          cursor: pointer;
          padding: 1px 3px;
          border-radius: 4px;
        }
        .sc-copy-icon-btn:hover {
          color: #0071E3;
          background: rgba(0, 113, 227, 0.08);
        }
        .sc-event-code {
          margin: 0;
          background: #F5F5F7;
          border: 1px solid rgba(0, 0, 0, 0.04);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 10px;
          font-family: var(--font-mono, monospace);
          color: #1D1D1F;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }

        /* AI Cards */
        .sc-ai-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sc-ai-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sc-ai-verdict {
          font-size: 12px;
          font-weight: 600;
        }
        .sc-ai-sections {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sc-ai-box {
          background: #F5F5F7;
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: 7px;
          padding: 6px 8px;
        }
        .sc-ai-box-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9.5px;
          font-weight: 700;
          color: #6E6E73;
          margin-bottom: 3px;
        }
        .sc-code-block {
          margin: 0;
          font-size: 10px;
          font-family: var(--font-mono, monospace);
          color: #1D1D1F;
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
          color: #1D1D1F;
        }
        .sc-empty-sub {
          font-size: 11px;
          color: #86868B;
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
      </style>

      <div class="sc-window">
        <!-- 1. Apple Precision Titlebar -->
        <div class="sc-titlebar" id="drag-handle">
          <div class="sc-brand-group">
            <div class="sc-brand-icon" title="Sanctuary Core">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" stroke-dasharray="1.5 2" />
                <circle cx="12" cy="12" r="1.8" fill="#FFFFFF" />
              </svg>
            </div>
            <div class="sc-brand-meta">
              <span class="sc-brand-name">Sanctuary Core</span>
              <span class="sc-brand-pill">Швейцарська Лупа</span>
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
        <nav class="sc-tab-bar">
          <button type="button" class="sc-tab-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
            ${ICONS.loupe(12)}
            <span>Огляд (Лупа)</span>
            ${fpInfo.status === 'FP_CANDIDATE' ? '<span class="sc-badge sc-badge-amber" style="padding:1px 5px; font-size:8.5px;">FP?</span>' : ''}
          </button>
          <button type="button" class="sc-tab-btn ${activeTab === 'events' ? 'active' : ''}" data-tab="events">
            ${ICONS.terminal(12)}
            <span>Події (${logs.length})</span>
          </button>
          <button type="button" class="sc-tab-btn ${activeTab === 'ai' ? 'active' : ''}" data-tab="ai">
            ${ICONS.cpu(12)}
            <span>Gemini Nano (${aiCount})</span>
          </button>
        </nav>

        <!-- 3. Viewport Content -->
        <div class="sc-viewport">
          ${tabBody}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  // Рендеринг компактного віджета (Dynamic Island Pill у світлій темі)
  private static renderMinimized() {
    if (!this.shadowRoot) return;

    const { severity, score, logs } = this.state;
    const riskColor =
      severity === 'CRITICAL' || severity === 'HIGH'
        ? '#FF3B30'
        : severity === 'MEDIUM'
        ? '#FF9500'
        : '#34C759';

    this.shadowRoot.innerHTML = `
      <style>
        ${DESIGN_TOKENS_CSS}

        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
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
          color: #1D1D1F;
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
          color: #1D1D1F;
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
          color: #86868B;
          font-family: var(--font-mono, monospace);
          display: flex;
          align-items: center;
          gap: 4px;
        }
      </style>
      <div class="sc-pill" id="btn-restore" title="Відкрити Швейцарську Лупу">
        <span class="sc-pill-icon">${ICONS.loupe(13, riskColor)}</span>
        <span class="sc-pill-text">Швейцарська Лупа</span>
        <span class="sc-pill-badge">${score}/100</span>
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
