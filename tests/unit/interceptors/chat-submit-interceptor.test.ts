// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatSubmitInterceptor } from '../../../src/interceptors/chat-submit.interceptor';
import { SessionOutboundMemory } from '../../../src/heuristics/session-outbound-memory';
import { SecurityFriction } from '../../../src/ui/friction';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';
import { ShadowHost } from '../../../src/ui/shadow-host';
import { ChatLivePill } from '../../../src/ui/chat-live-pill';

describe('ChatSubmitInterceptor (TDD Suite)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    SessionOutboundMemory.reset();
    ChatSubmitInterceptor.destroy();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    ChatSubmitInterceptor.destroy();
    SessionOutboundMemory.reset();
  });

  describe('findAssociatedChatInput (DOM discovery accuracy)', () => {
    it('correctly associates send button with active chat input on marketplace-chat.html structure', () => {
      // Recreate marketplace-chat.html DOM layout with sidebar textarea and chat input area
      document.body.innerHTML = `
        <div class="chat-layout" data-testid="conversation-layout">
          <div class="chat-sidebar">
            <div id="customGoalBox">
              <textarea id="customGoalInput" placeholder="Опишіть поведінку..."></textarea>
            </div>
          </div>
          <div class="chat-main">
            <div class="chat-messages" id="chatWindow">
              <div class="msg received">Доброго дня! Велосипед ще в наявності?</div>
            </div>
            <div class="chat-input-area">
              <input type="text" id="chatInput" placeholder="Напишіть повідомлення...">
              <button id="btnSend">Надіслати</button>
            </div>
          </div>
        </div>
      `;

      const btnSend = document.getElementById('btnSend') as HTMLButtonElement;
      const chatInput = document.getElementById('chatInput') as HTMLInputElement;
      const customGoalInput = document.getElementById('customGoalInput') as HTMLTextAreaElement;

      chatInput.value = '4149 4390 1234 5678, 123';

      const foundInput = ChatSubmitInterceptor.findAssociatedChatInput(btnSend);

      // Must find chatInput, NOT customGoalInput!
      expect(foundInput).toBe(chatInput);
      expect(foundInput).not.toBe(customGoalInput);
    });
  });

  describe('interceptChatSend and cross-message blocking', () => {
    it('blocks combined card + CVV submission and invokes SecurityFriction.applyToChat', () => {
      const applyToChatSpy = vi.spyOn(SecurityFriction, 'applyToChat').mockImplementation(() => {});

      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => false,
      });

      const input = document.createElement('input');
      input.value = '4149 4390 1234 5678, 123';
      document.body.appendChild(input);

      const fakeEvent = new Event('click', { cancelable: true });
      const blocked = ChatSubmitInterceptor.interceptChatSend(input, fakeEvent);

      expect(blocked).toBe(true);
      expect(fakeEvent.defaultPrevented).toBe(true);
      expect(applyToChatSpy).toHaveBeenCalled();
    });

    it('allows card number alone on first message, but blocks on second message when CVV is sent', () => {
      const applyToChatSpy = vi.spyOn(SecurityFriction, 'applyToChat').mockImplementation(() => {});

      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => false,
      });

      const input = document.createElement('input');
      document.body.appendChild(input);

      // Message 1: P2P card alone
      input.value = '4149 4390 1234 5678';
      const event1 = new Event('click', { cancelable: true });
      const blocked1 = ChatSubmitInterceptor.interceptChatSend(input, event1);

      expect(blocked1).toBe(false);
      expect(event1.defaultPrevented).toBe(false);
      expect(applyToChatSpy).not.toHaveBeenCalled();
      expect(SessionOutboundMemory.hasSentCard()).toBe(true);

      // Message 2: Victim replies with CVV 123
      input.value = '123';
      const event2 = new Event('click', { cancelable: true });
      const blocked2 = ChatSubmitInterceptor.interceptChatSend(input, event2);

      expect(blocked2).toBe(true);
      expect(event2.defaultPrevented).toBe(true);
      expect(applyToChatSpy).toHaveBeenCalled();
      const lastCallArgs = applyToChatSpy.mock.calls[0];
      expect(lastCallArgs[1].isCrossMessage).toBe(true);
    });
  });

  describe('Real-time typing feedback', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('proactively renders ChatLivePill on sensitive leak in debugMode without popup toasts', () => {
      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => true,
      });

      const input = document.createElement('input');
      document.body.appendChild(input);

      input.value = '4149 4390 1234 5678, 123';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      vi.advanceTimersByTime(150);

      const shadowRoot = ShadowHost.getRoot();
      const pill = shadowRoot.querySelector('.ts-chat-live-pill');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toContain('chatPillLabelCvv');
      // Native outline remains pristine (no aggressive red border)
      expect(input.style.outline).toBe('');
      // No popup toast container in Shadow DOM
      expect(shadowRoot.querySelector('#threat-shield-toast-container')).toBeNull();
    });

    it('renders ChatLivePill without noisy toast and keeps input outline native when debugMode is false (Apple-grade Silence)', () => {
      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => false,
      });

      const input = document.createElement('input');
      document.body.appendChild(input);

      input.value = '4149 4390 1234 5678, 123';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      vi.advanceTimersByTime(150);

      // NO popup toast container
      const shadowRoot = ShadowHost.getRoot();
      expect(shadowRoot.querySelector('#threat-shield-toast-container')).toBeNull();
      // Native input frame is NOT corrupted with red outline
      expect(input.style.outline).toBe('');

      // Elegant pill in Shadow DOM is displayed
      const pill = shadowRoot.querySelector('.ts-chat-live-pill');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toContain('chatPillLabelCvv');
    });

    it('shows popover on hover and strips sensitive CVV when action button is clicked', () => {
      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => false,
      });

      const input = document.createElement('input');
      input.value = '4149 4390 1234 5678, cvv 789';
      document.body.appendChild(input);

      input.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(150);

      const shadowRoot = ShadowHost.getRoot();
      const pill = shadowRoot.querySelector('.ts-chat-live-pill') as HTMLElement;
      expect(pill).not.toBeNull();

      // Trigger hover
      pill.dispatchEvent(new MouseEvent('mouseenter'));

      const popover = shadowRoot.querySelector('.ts-chat-live-popover') as HTMLElement;
      expect(popover).not.toBeNull();
      expect(popover.textContent).toContain('chatPillExplainCvv');

      // Click "Видалити з тексту"
      const cleanBtn = popover.querySelector('#ts-pill-clean-btn') as HTMLButtonElement;
      expect(cleanBtn).not.toBeNull();
      cleanBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Input value has CVV stripped
      expect(input.value).not.toContain('789');
      expect(input.value).toContain('4149 4390 1234 5678');
      expect(shadowRoot.querySelector('.ts-chat-live-pill')).toBeNull();
    });

    it('blocks civic defense GPS coordinates and invokes SecurityFriction.applyToChat', () => {
      const applyToChatSpy = vi.spyOn(SecurityFriction, 'applyToChat').mockImplementation(() => {});

      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => false,
      });

      const input = document.createElement('input');
      input.value = 'Ось точні координати ппо: 50.4501, 30.5234';
      document.body.appendChild(input);

      const fakeEvent = new Event('click', { cancelable: true });
      const blocked = ChatSubmitInterceptor.interceptChatSend(input, fakeEvent);

      expect(blocked).toBe(true);
      expect(fakeEvent.defaultPrevented).toBe(true);
      expect(applyToChatSpy).toHaveBeenCalled();
      const lastCallArgs = applyToChatSpy.mock.calls[0];
      expect(lastCallArgs[1].hasGps).toBe(true);
    });

    it('monitors chat inputs wrapped inside <form> and shows ChatLivePill on CVV detection', () => {
      vi.useFakeTimers();

      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => false,
      });

      const form = document.createElement('form');
      form.className = 'chat-composer-form';
      const textarea = document.createElement('textarea');
      textarea.placeholder = 'Напишіть повідомлення...';
      form.appendChild(textarea);
      document.body.appendChild(form);

      textarea.value = '4149 4390 1234 5678, cvv: 999';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(150);

      const shadowRoot = ShadowHost.getRoot();
      const pill = shadowRoot.querySelector('.ts-chat-live-pill');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toContain('chatPillLabelCvv');

      vi.useRealTimers();
    });

    it('intercepts submission when send button is clicked inside a form chat composer', () => {
      const applyToChatSpy = vi.spyOn(SecurityFriction, 'applyToChat').mockImplementation(() => {});

      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => false,
      });

      const form = document.createElement('form');
      form.className = 'chat-composer-form';

      const textarea = document.createElement('textarea');
      textarea.placeholder = 'Напишіть повідомлення...';
      textarea.value = '4149 4390 1234 5678, cvv 999';

      const sendBtn = document.createElement('button');
      sendBtn.type = 'submit';
      sendBtn.textContent = 'Надіслати';

      form.appendChild(textarea);
      form.appendChild(sendBtn);
      document.body.appendChild(form);

      sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(applyToChatSpy).toHaveBeenCalled();
    });
  });
});
