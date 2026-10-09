import { afterEach, describe, expect, it } from 'vitest';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { IntentClassifier } from '../../../src/heuristics/intent-classifier';
import { getThreatMitigationAction } from '../../../src/heuristics/threat-mitigation-policy';

const safeExamples = [
  {
    id: 'safe2-reg-003',
    text: 'The word WhatsApp appears in a comparison of messaging app privacy settings.',
  },
  {
    id: 'safe2-reg-007',
    text: 'Я згадав Viber лише як приклад застосунку, а не пропоную перейти туди.',
  },
  {
    id: 'safe2-reg-012',
    text: 'Покупець запитав, на яке ім’я оформити накладну, і не просив номер документа.',
  },
  {
    id: 'safe2-reg-016',
    text: 'Підтримка попросила описати проблему, але не запитувала адресу чи податковий номер.',
  },
];

describe('Known benign-context false positives', () => {
  afterEach(() => ChatSessionState.reset());

  it.each(safeExamples)('$id stays safe and never locks input', ({ id, text }) => {
    const direct = IntentClassifier.classify(text);
    ChatSessionState.reset();
    const stateful = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
    const action = getThreatMitigationAction(stateful.hasFormedIntent, stateful.intentType);

    expect(direct.hasFormedIntent, `${id} should not form a direct threat intent`).toBe(false);
    expect(stateful.hasFormedIntent, `${id} should not form a threat intent`).toBe(false);
    expect(action, `${id} must not block or warn on safe content`).toBe('ALLOW');
  });
});
