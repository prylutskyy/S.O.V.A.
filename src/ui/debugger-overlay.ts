export class DebuggerOverlay {
  private static container: HTMLElement | null = null;
  private static shadowRoot: ShadowRoot | null = null;
  
  private static state = {
    sessionId: null as string | null,
    severity: 'LOW' as string,
    score: 0,
    logs: [] as Array<{
      id: string;
      stepKey: string;
      data: any;
      color: string;
      time: string;
      isAi: boolean;
      isForm: boolean;
      isPending?: boolean;
      aiContext?: { systemPrompt?: string; contextRules?: string; textSent?: string; raisedFlags?: string[]; formDetails?: string; rawResponse?: string; };
      expanded?: boolean;
    }>
  };

  private static isDragging = false;
  private static offsetX = 0;
  private static offsetY = 0;

  public static show() {
    if (this.container) {
      this.container.style.display = 'block';
      return;
    }

    this.container = document.createElement('div');
    this.container.id = 'threatshield-neuro-monitor';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '400px',
      height: '600px',
      zIndex: '2147483647',
      display: 'block'
    });

    this.shadowRoot = this.container.attachShadow({ mode: 'open' });
    document.body.appendChild(this.container);

    this.setupDrag();
    this.render();
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
    aiContext?: { systemPrompt?: string; contextRules?: string; textSent?: string; raisedFlags?: string[]; formDetails?: string; rawResponse?: string; },
    logId?: string
  ) {
    if (isAi || aiContext || logId || stepKey.toLowerCase().includes('ші') || stepKey.toLowerCase().includes('ai') || stepKey.toLowerCase().includes('llm')) {
      return this.logAI(stepKey, data, customColor, aiContext, logId);
    }

    this.show();

    if (broadcast && this.state.sessionId) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'BROADCAST_LOG',
            payload: {
              sessionId: this.state.sessionId,
              stepKey,
              data,
              customColor
            }
          });
        }
      } catch {}
    }

    const time = new Date().toLocaleTimeString();
    const color = customColor || '#4ADE80';
    
    const isStepAi = stepKey.toLowerCase().includes('ai') || stepKey.toLowerCase().includes('llm') || stepKey.toLowerCase().includes('ші');
    const isForm = stepKey.toLowerCase().includes('форма') || stepKey.toLowerCase().includes('form');

    // Update existing if stepKey matches, else push new
    const existingIndex = this.state.logs.findIndex(l => l.stepKey === stepKey);
    if (existingIndex >= 0) {
      this.state.logs[existingIndex] = { ...this.state.logs[existingIndex], data, color, time };
    } else {
      this.state.logs.push({
        id: Math.random().toString(36).substring(7),
        stepKey,
        data,
        color,
        time,
        isAi: isStepAi,
        isForm
      });
    }

    this.render();
  }

  public static logAI(
    stepKey: string,
    data: any,
    customColor?: string,
    aiContext?: { systemPrompt?: string; contextRules?: string; textSent?: string; raisedFlags?: string[]; formDetails?: string; rawResponse?: string; },
    logId?: string
  ): string {
    this.show();

    const time = new Date().toLocaleTimeString();
    const color = customColor || '#3B82F6';
    const isPending = typeof data === 'string' && (data.includes('⏳') || data.includes('очікую') || data.includes('Аналізую'));

    let targetIndex = -1;
    if (logId) {
      targetIndex = this.state.logs.findIndex(l => l.id === logId);
    } else if (!isPending) {
      // Find the last pending AI log matching this stepKey so we update it with result
      for (let i = this.state.logs.length - 1; i >= 0; i--) {
        if (this.state.logs[i].stepKey === stepKey && this.state.logs[i].isPending) {
          targetIndex = i;
          break;
        }
      }
    }

    let currentId: string;
    if (targetIndex >= 0) {
      currentId = this.state.logs[targetIndex].id;
      // Merge existing aiContext with any new fields (e.g. rawResponse)
      const updatedContext = {
        ...(this.state.logs[targetIndex].aiContext || {}),
        ...(aiContext || {})
      };
      this.state.logs[targetIndex] = {
        ...this.state.logs[targetIndex],
        data,
        color,
        time,
        isPending,
        aiContext: updatedContext
      };
    } else {
      currentId = logId || Math.random().toString(36).substring(7);
      this.state.logs.push({
        id: currentId,
        stepKey,
        data,
        color,
        time,
        isAi: true,
        isForm: false,
        isPending,
        aiContext,
        expanded: false
      });
    }

    if (this.state.sessionId) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          const effectiveContext = targetIndex >= 0 ? this.state.logs[targetIndex].aiContext : aiContext;
          chrome.runtime.sendMessage({
            type: 'BROADCAST_LOG',
            payload: {
              sessionId: this.state.sessionId,
              stepKey,
              data,
              customColor: color,
              isAi: true,
              aiContext: effectiveContext,
              logId: currentId
            }
          });
        }
      } catch {}
    }

    this.render();
    return currentId;
  }

  private static render() {
    if (!this.shadowRoot) return;

    const { sessionId, severity, score, logs } = this.state;
    const isSessionActive = !!sessionId;

    const riskColor = severity === 'CRITICAL' || severity === 'HIGH' ? '#EF4444' : (severity === 'MEDIUM' ? '#F59E0B' : '#10B981');
    const strokeDasharray = 226; // 2 * pi * r (r=36)
    const strokeDashoffset = strokeDasharray - (strokeDasharray * score) / 100;

    let logsHtml = '';
    logs.forEach((log, index) => {
      const dataStr = typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data);
      const isLast = index === logs.length - 1;
      
      let icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${log.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      if (log.isAi) icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${log.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12l8.66-5"></path></svg>`;
      else if (log.isForm) icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${log.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`;

      const isExpanded = !!log.expanded;
      const aiInspectorHtml = log.aiContext ? `
        <div class="ai-inspector" data-id="${log.id}">
          <button class="ai-inspector-toggle" data-id="${log.id}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${isExpanded ? '6 15 12 9 18 15' : '6 9 12 15 18 9'}"></polyline></svg>
            ${isExpanded ? 'Сховати деталі запиту до ШІ' : 'Деталі запиту до ШІ'}
          </button>
          <div class="ai-inspector-body" id="ai-body-${log.id}" style="display:${isExpanded ? 'flex' : 'none'}">
            <div class="ai-section">
              <div class="ai-section-label">🤖 Системний промпт (роль ШІ)</div>
              <pre class="ai-section-code">${log.aiContext.systemPrompt}</pre>
            </div>
            <div class="ai-section">
              <div class="ai-section-label">📋 Контекст / Правила для перевірки</div>
              <pre class="ai-section-code">${log.aiContext.contextRules}</pre>
            </div>
            <div class="ai-section">
              <div class="ai-section-label">💬 Текст, переданий для аналізу</div>
              <pre class="ai-section-code">${log.aiContext.textSent}</pre>
            </div>
            ${log.aiContext.raisedFlags && log.aiContext.raisedFlags.length > 0 ? `
            <div class="ai-section">
              <div class="ai-section-label">🚩 Зафіксовані евристичні прапорці</div>
              <pre class="ai-section-code">${log.aiContext.raisedFlags.map(f => `• ${f}`).join('\n')}</pre>
            </div>` : ''}
            ${log.aiContext.formDetails ? `
            <div class="ai-section">
              <div class="ai-section-label">📝 Дані введених полів форми</div>
              <pre class="ai-section-code">${log.aiContext.formDetails}</pre>
            </div>` : ''}
            ${log.aiContext.rawResponse ? `
            <div class="ai-section raw-response">
              <div class="ai-section-label">📥 Повна сира відповідь від LLM (Raw Response)</div>
              <pre class="ai-section-code">${log.aiContext.rawResponse}</pre>
            </div>` : ''}
          </div>
        </div>
      ` : '';

      logsHtml += `
        <div class="log-node">
          <div class="node-icon" style="background: ${log.color}22; border-color: ${log.color}">
            ${icon}
          </div>
          <div class="node-content" style="border-left-color: ${log.color}">
            <div class="node-header">
              <span class="step-key" style="color: ${log.color}">${log.stepKey}</span>
              <span class="time">${log.time}</span>
            </div>
            <pre class="node-data">${dataStr}</pre>
            ${aiInspectorHtml}
          </div>
          ${!isLast ? '<div class="flow-line"></div>' : ''}
        </div>
      `;
    });

    if (logs.length === 0) {
      logsHtml = `<div class="empty-state">Система в режимі очікування...</div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .monitor-wrapper {
          width: 100%;
          height: 100%;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #e2e8f0;
          overflow: hidden;
        }
        .header {
          background: #1e293b;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #334155;
          cursor: move;
        }
        .title {
          font-size: 13px;
          font-weight: 600;
          color: #f8fafc;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pulse {
          width: 8px;
          height: 8px;
          background: #10b981;
          border-radius: 50%;
          box-shadow: 0 0 10px #10b981;
          animation: pulse-anim 2s infinite;
        }
        @keyframes pulse-anim {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .controls {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .btn {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background 0.2s, color 0.2s;
        }
        .btn:hover {
          background: #334155;
          color: #f8fafc;
        }
        .btn.danger:hover {
          background: #7f1d1d;
          color: #fca5a5;
        }
        .dashboard-grid {
          padding: 16px;
          display: flex;
          gap: 16px;
          background: #0b1120;
          border-bottom: 1px solid #1e293b;
        }
        .gauge-container {
          position: relative;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .gauge-svg {
          transform: rotate(-90deg);
          width: 80px;
          height: 80px;
        }
        .gauge-bg {
          fill: none;
          stroke: #1e293b;
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
          font-size: 9px;
          color: #64748b;
          text-transform: uppercase;
          margin-top: 2px;
        }
        .session-info {
          display: flex;
          flex-direction: column;
          justify-content: center;
          flex: 1;
        }
        .session-id {
          font-size: 14px;
          font-family: monospace;
          color: #f8fafc;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .session-status {
          font-size: 11px;
          color: ${riskColor};
          font-weight: 600;
          padding: 2px 6px;
          background: ${riskColor}22;
          border-radius: 4px;
          display: inline-block;
          width: fit-content;
        }
        .logs-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: #0f172a;
          position: relative;
        }
        .logs-container::-webkit-scrollbar {
          width: 6px;
        }
        .logs-container::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }
        .log-node {
          position: relative;
          padding-left: 28px;
          margin-bottom: 16px;
        }
        .node-icon {
          position: absolute;
          left: 0;
          top: 0;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 1.5px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f172a;
          z-index: 2;
        }
        .flow-line {
          position: absolute;
          left: 10px;
          top: 20px;
          bottom: -16px;
          width: 2px;
          background: #334155;
          z-index: 1;
        }
        .node-content {
          background: #1e293b;
          border-radius: 6px;
          padding: 10px 12px;
          border-left: 3px solid;
        }
        .node-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .step-key {
          font-size: 12px;
          font-weight: 600;
        }
        .time {
          font-size: 10px;
          color: #64748b;
          font-family: monospace;
        }
        .node-data {
          font-family: monospace;
          font-size: 11px;
          color: #cbd5e1;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.4;
        }
        .empty-state {
          color: #475569;
          text-align: center;
          padding: 40px 20px;
          font-size: 13px;
          font-weight: 500;
        }
        .ai-inspector {
          margin-top: 8px;
        }
        .ai-inspector-toggle {
          background: #1e3a5f;
          border: 1px solid #2563eb44;
          color: #60a5fa;
          font-size: 10px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          width: 100%;
          text-align: left;
          transition: background 0.15s;
        }
        .ai-inspector-toggle:hover {
          background: #1e40af44;
        }
        .ai-inspector-body {
          margin-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ai-section {
          background: #0a1628;
          border: 1px solid #1e3a5f;
          border-radius: 4px;
          padding: 7px 9px;
        }
        .ai-section-label {
          font-size: 9px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 4px;
        }
        .ai-section-code {
          font-family: monospace;
          font-size: 10px;
          color: #94a3b8;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.5;
        }
        .ai-section.raw-response {
          background: #07111e;
          border: 1px solid #2563eb55;
          border-left: 3px solid #3b82f6;
        }
        .ai-section.raw-response .ai-section-label {
          color: #60a5fa;
        }
        .ai-section.raw-response .ai-section-code {
          color: #bfdbfe;
          font-family: 'JetBrains Mono', Consolas, monospace;
          max-height: 200px;
          overflow-y: auto;
        }
      </style>
      <div class="monitor-wrapper">
        <div class="header" id="drag-handle">
          <div class="title">
            <div class="pulse" style="background: ${isSessionActive ? riskColor : '#10b981'}; box-shadow: 0 0 10px ${isSessionActive ? riskColor : '#10b981'};"></div>
            Нейромонітор
          </div>
          <div class="controls">
            <button class="btn" id="btn-clear">Очистити</button>
            <button class="btn danger" id="btn-reset" title="Скинути контекст та розблокувати сторінку">Скинути Сесію</button>
            <button class="btn" id="btn-close">✕</button>
          </div>
        </div>
        
        <div class="dashboard-grid" style="display: ${isSessionActive ? 'flex' : 'none'}">
          <div class="gauge-container">
            <svg class="gauge-svg">
              <circle class="gauge-bg" cx="40" cy="40" r="36"></circle>
              <circle class="gauge-progress" cx="40" cy="40" r="36"></circle>
            </svg>
            <div class="gauge-text">
              <span class="gauge-value">${score}</span>
              <span class="gauge-label">Ризик</span>
            </div>
          </div>
          <div class="session-info">
            <div class="session-id">${sessionId || 'Немає'}</div>
            <div class="session-status">${severity} RISK</div>
          </div>
        </div>

        <div class="logs-container" id="logs-list">
          ${logsHtml}
        </div>
      </div>
    `;

    // Attach events
    const handle = this.shadowRoot.getElementById('drag-handle');
    handle?.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      if (this.container) {
        this.offsetX = e.clientX - this.container.getBoundingClientRect().left;
        this.offsetY = e.clientY - this.container.getBoundingClientRect().top;
      }
    });

    this.shadowRoot.getElementById('btn-clear')?.addEventListener('click', () => this.clear());
    this.shadowRoot.getElementById('btn-reset')?.addEventListener('click', () => {
      window.postMessage({ type: 'THREAT_SHIELD_CLEAR_CONTEXT' }, '*');
      this.log('Система', 'Користувач примусово скинув контекст', '#22C55E');
    });
    this.shadowRoot.getElementById('btn-close')?.addEventListener('click', () => {
      this.hide();
    });

    // AI Inspector expand/collapse toggles
    this.shadowRoot.querySelectorAll('.ai-inspector-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const targetLog = this.state.logs.find(l => l.id === id);
        if (targetLog) {
          targetLog.expanded = !targetLog.expanded;
          this.render();
        }
      });
    });

    // Auto-scroll
    const logsContainer = this.shadowRoot.getElementById('logs-list');
    if (logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }

  private static setupDrag() {
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging && this.container) {
        this.container.style.left = `${e.clientX - this.offsetX}px`;
        this.container.style.top = `${e.clientY - this.offsetY}px`;
        this.container.style.right = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }
}
