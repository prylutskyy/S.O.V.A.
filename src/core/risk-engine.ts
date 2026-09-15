import { HeuristicResult, RiskLevel, ThreatAssessment } from '../types';

export interface UserActionContext {
  action: 'focus' | 'paste' | 'input' | 'submit';
  hasFilledSensitive: boolean;
  isEntirelyEmpty: boolean;
}

export class RiskEngine {
  /**
   * Розрахунок інтегрального індексу загрози:
   * RiskScore = f(R_tech, C_env, A_user)
   * 
   * Враховує реальний намір користувача: якщо підозріла форма не містить
   * заповнених конфіденційних/платіжних даних, жорстке блокування НЕ застосовується!
   */
  public static evaluate(
    heuristics: HeuristicResult[],
    userContext: UserActionContext = {
      action: 'submit',
      hasFilledSensitive: false,
      isEntirelyEmpty: false,
    },
    contextBonus: number = 0
  ): ThreatAssessment {
    let score = 0;
    const activeTriggers = heuristics.filter((h) => h.triggered);

    // 1. Внесок технічних евристик (R_tech)
    for (const trigger of activeTriggers) {
      score += trigger.scoreContribution;
    }

    // 2. Внесок контексту середовища (C_env, Tainted Context)
    score += contextBonus;

    // 3. Внесок дій та намірів користувача (A_user)
    if (userContext.action === 'submit') {
      if (userContext.hasFilledSensitive) {
        // Користувач реально намагається відправити номер картки, CVV чи пароль
        score += 35;
      } else if (userContext.isEntirelyEmpty) {
        // Форма повністю порожня: загрози витоку даних немає
        score = Math.min(score, 30);
      } else {
        // Форма містить лише безпечний загальний текст (наприклад, пошуковий запит чи коментар)
        // Обмежуємо оцінку, щоб уникнути надмірного блокування (False Positive)
        score = Math.min(score, 45);
      }
    } else if (userContext.action === 'paste') {
      if (userContext.hasFilledSensitive) {
        score += 20;
      }
    }

    // Обмеження діапазону [0, 100]
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Визначення рівня загрози
    let level: RiskLevel = 'LOW';
    if (score >= 76) {
      level = 'CRITICAL';
    } else if (score >= 51) {
      level = 'HIGH';
    } else if (score >= 21) {
      level = 'MEDIUM';
    }

    return {
      score,
      level,
      triggers: activeTriggers,
      timestamp: Date.now(),
    };
  }
}
