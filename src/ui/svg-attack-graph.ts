import { AttackChainStep } from '../types';

export class SvgAttackGraph {
  /**
   * Створення інтерактивного SVG-графа ланцюга атаки
   */
  public static render(chain: AttackChainStep[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'threat-attack-graph-wrapper';
    container.style.cssText = `
      width: 100%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px 16px;
      margin: 12px 0;
      box-sizing: border-box;
      overflow-x: auto;
    `;

    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    `;
    titleDiv.innerHTML = `
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; display: flex; align-items: center; gap: 6px;">
        <span>⚡ Візуалізація ланцюга атаки (XAI Attack Flow)</span>
      </div>
      <span style="font-size: 10px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">Кроків: ${chain.length}</span>
    `;
    container.appendChild(titleDiv);

    if (chain.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size: 12px; color: #64748b; text-align: center; padding: 12px;';
      empty.textContent = 'Ланцюг подій локалізовано в межах поточної форми.';
      container.appendChild(empty);
      return container;
    }

    // Параметри для адаптивного розміщення SVG
    const nodeWidth = 130;
    const nodeHeight = 64;
    const gap = 50;
    const totalWidth = chain.length * nodeWidth + (chain.length - 1) * gap + 20;
    const totalHeight = 84;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', `${totalHeight}px`);
    svg.style.display = 'block';

    // Маркери стрілок у defs
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="arrow-critical" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 8 5 L 0 9 z" fill="#ef4444" />
      </marker>
      <marker id="arrow-amber" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 8 5 L 0 9 z" fill="#f59e0b" />
      </marker>
      <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 8 5 L 0 9 z" fill="#3b82f6" />
      </marker>
      <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.08" />
      </filter>
    `;
    svg.appendChild(defs);

    // Малюємо з'єднувальні лінії між вузлами
    for (let i = 0; i < chain.length - 1; i++) {
      const startX = 10 + i * (nodeWidth + gap) + nodeWidth;
      const startY = 10 + nodeHeight / 2;
      const endX = startX + gap;
      const endY = startY;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${startX} ${startY} L ${endX - 2} ${endY}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', i === chain.length - 2 ? '#ef4444' : '#94a3b8');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '4 3');
      path.setAttribute('marker-end', i === chain.length - 2 ? 'url(#arrow-critical)' : 'url(#arrow-blue)');
      path.style.animation = 'threatFlowDash 1.2s linear infinite';
      svg.appendChild(path);
    }

    // Малюємо вузли
    chain.forEach((step, index) => {
      const x = 10 + index * (nodeWidth + gap);
      const y = 10;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.style.cursor = 'help';

      // Колір рамки залежно від severity
      let borderColor = '#cbd5e1';
      let bgColor = '#ffffff';
      let badgeColor = '#64748b';

      if (step.severity === 'CRITICAL') {
        borderColor = '#fca5a5';
        bgColor = '#fff5f5';
        badgeColor = '#dc2626';
      } else if (step.severity === 'HIGH') {
        borderColor = '#fde68a';
        bgColor = '#fffbeb';
        badgeColor = '#d97706';
      } else if (index === 0) {
        borderColor = '#bfdbfe';
        bgColor = '#f0f7ff';
        badgeColor = '#2563eb';
      }

      // Тіло картки
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', `${x}`);
      rect.setAttribute('y', `${y}`);
      rect.setAttribute('width', `${nodeWidth}`);
      rect.setAttribute('height', `${nodeHeight}`);
      rect.setAttribute('rx', '8');
      rect.setAttribute('fill', bgColor);
      rect.setAttribute('stroke', borderColor);
      rect.setAttribute('stroke-width', '1.5');
      rect.setAttribute('filter', 'url(#node-shadow)');
      group.appendChild(rect);

      // Іконка та крок
      const textTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textTitle.setAttribute('x', `${x + 8}`);
      textTitle.setAttribute('y', `${y + 18}`);
      textTitle.setAttribute('font-size', '11');
      textTitle.setAttribute('font-weight', '700');
      textTitle.setAttribute('fill', '#0f172a');
      textTitle.textContent = `${step.icon} ${this.truncate(step.sourceNode, 12)}`;
      group.appendChild(textTitle);

      // Підзаголовок (опис дії)
      const textDesc = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textDesc.setAttribute('x', `${x + 8}`);
      textDesc.setAttribute('y', `${y + 36}`);
      textDesc.setAttribute('font-size', '9.5');
      textDesc.setAttribute('fill', '#475569');
      textDesc.textContent = this.truncate(step.title, 17);
      group.appendChild(textDesc);

      // Бейдж статусу внизу
      const textBadge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textBadge.setAttribute('x', `${x + 8}`);
      textBadge.setAttribute('y', `${y + 52}`);
      textBadge.setAttribute('font-size', '8.5');
      textBadge.setAttribute('font-weight', '600');
      textBadge.setAttribute('fill', badgeColor);
      textBadge.textContent = step.severity;
      group.appendChild(textBadge);

      // Підказка при наведенні (native SVG title)
      const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titleEl.textContent = `Крок ${step.stepNumber}: ${step.title}\nДеталі: ${step.description}\nДжерело: ${step.sourceNode}${step.evidence ? `\nДоказ: ${step.evidence}` : ''}`;
      group.appendChild(titleEl);

      svg.appendChild(group);
    });

    container.appendChild(svg);
    return container;
  }

  private static truncate(str: string, maxLen: number): string {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }
}
