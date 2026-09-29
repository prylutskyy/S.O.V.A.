// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatSubmitInterceptor } from '../../../src/interceptors/chat-submit.interceptor';
import { SessionOutboundMemory } from '../../../src/heuristics/session-outbound-memory';
import { SecurityFriction } from '../../../src/ui/friction';
import { ToastNotifier } from '../../../src/ui/toast-notifier';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';

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

    it('proactively shows toast warning and outlines input when card + CVV is typed live in chat', () => {
      const toastSpy = vi.spyOn(ToastNotifier, 'show').mockImplementation(() => {});

      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => true,
      });

      const input = document.createElement('input');
      document.body.appendChild(input);

      input.value = '4149 4390 1234 5678, 123';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      vi.advanceTimersByTime(150);

      expect(toastSpy).toHaveBeenCalled();
      expect(input.style.outline.toLowerCase()).toMatch(/#ef4444|rgb\(239,\s*68,\s*68\)/);
    });

    it('applies tactile outline without noisy toast when debugMode is false (Apple-grade Silence)', () => {
      const toastSpy = vi.spyOn(ToastNotifier, 'show').mockImplementation(() => {});

      ChatSubmitInterceptor.init({
        getActiveContext: () => null,
        getDebugMode: () => false,
      });

      const input = document.createElement('input');
      document.body.appendChild(input);

      input.value = '4149 4390 1234 5678, 123';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      vi.advanceTimersByTime(150);

      // NO toast for normal users!
      expect(toastSpy).not.toHaveBeenCalled();
      // Tactile kinetic outline IS applied
      expect(input.style.outline.toLowerCase()).toMatch(/#ef4444|rgb\(239,\s*68,\s*68\)/);
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
  });
});
