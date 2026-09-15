import { HeuristicResult, RiskLevel, ThreatAssessment } from '../types';

export class RiskEngine {
  /**
   * Розрахунок інтегрального індексу загрози:
   * RiskScore = f(R_tech, C_env, A_user)
   */
  public static evaluate(
    heuristics: HeuristicResult[],
    userAction: 'focus' | 'paste' | 'input' | 'submit' = 'submit',
    contextBonus: number = 0
  ): ThreatAssessment {
    let score = 0;
    const activeTriggers = heuristics.filter((h) => h.triggered);

    // Внесок технічних евристик
    for (const trigger of activeTriggers) {
      score += trigger.scoreContribution;
    }

    // Внесок дії користувача
    if (userAction === 'submit') {
      score += 15; // Спроба сабміту на підозрілій формі суттєво підвищує ризик
    } else if (userAction === 'paste') {
      score += 10; // Вставка даних у чутливе поле
    }

    // Внесок збереженого контексту (наприклад, Tainted Context Window)
    score += contextBonus;

    // Обмеження діапазону [0, 100]
    score = Math.max(0, Math.min(100, score));

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
