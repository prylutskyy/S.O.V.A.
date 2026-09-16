export class DebuggerOverlay {
  private static container: HTMLElement | null = null;
  private static logsList: HTMLElement | null = null;
  private static isDragging = false;
  private static offsetX = 0;
  private static offsetY = 0;

  public static show() {
    if (this.container) {
      this.container.style.display = 'flex';
      return;
    }

    this.container = document.createElement('div');
    this.container.id = 'threatshield-debugger';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '350px',
      maxHeight: '400px',
      backgroundColor: 'rgba(26, 26, 26, 0.95)',
      color: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
      zIndex: '9999999',
      fontFamily: 'monospace',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid #444',
      overflow: 'hidden'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '8px 12px',
      backgroundColor: '#333',
      borderBottom: '1px solid #555',
      cursor: 'move',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontWeight: 'bold'
    });
    header.innerText = 'Threat Shield Pipeline';

    const closeBtn = document.createElement('span');
    closeBtn.innerText = '×';
    Object.assign(closeBtn.style, {
      cursor: 'pointer',
      fontSize: '16px',
      color: '#aaa'
    });
    closeBtn.onclick = () => {
      this.container?.remove();
      this.container = null;
    };
    header.appendChild(closeBtn);

    this.logsList = document.createElement('div');
    Object.assign(this.logsList.style, {
      padding: '10px',
      overflowY: 'auto',
      flex: '1',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    });

    this.container.appendChild(header);
    this.container.appendChild(this.logsList);
    document.body.appendChild(this.container);

    // Make it draggable
    header.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.offsetX = e.clientX - this.container!.getBoundingClientRect().left;
      this.offsetY = e.clientY - this.container!.getBoundingClientRect().top;
    });

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

  public static hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  public static log(step: string, data: any, color: string = '#4ADE80') {
    this.show();
    if (!this.logsList) return;

    const logItem = document.createElement('div');
    Object.assign(logItem.style, {
      borderLeft: `3px solid ${color}`,
      paddingLeft: '8px',
      backgroundColor: 'rgba(255,255,255,0.05)',
      padding: '6px',
      borderRadius: '4px'
    });

    const stepLabel = document.createElement('div');
    stepLabel.style.fontWeight = 'bold';
    stepLabel.style.color = color;
    stepLabel.innerText = step;
    
    const dataLabel = document.createElement('div');
    dataLabel.style.marginTop = '4px';
    dataLabel.style.wordBreak = 'break-word';
    dataLabel.innerText = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);

    logItem.appendChild(stepLabel);
    logItem.appendChild(dataLabel);

    this.logsList.appendChild(logItem);
    this.logsList.scrollTop = this.logsList.scrollHeight;
  }
}
