import { describe, it, expect, vi } from 'vitest';
import { AILureVerifier } from '../../../src/heuristics/ai-verifier';
import { IAIProvider, AIValidationResult } from '../../../src/heuristics/ai-provider.interface';

class MockAIProvider implements IAIProvider {
  public available: boolean = true;
  public mockResult: AIValidationResult | null = null;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async verifyIntent(text: string, contextRules: string): Promise<AIValidationResult | null> {
    return this.mockResult;
  }
}

describe('AILureVerifier', () => {
  it('should return null if AI is not available', async () => {
    const provider = new MockAIProvider();
    provider.available = false;
    const verifier = new AILureVerifier(provider);

    const result = await verifier.verifyIntent('some text', 'ESCROW_DELIVERY_SCAM');
    expect(result).toBeNull();
  });

  it('should pass context rules and return AI result if available', async () => {
    const provider = new MockAIProvider();
    provider.available = true;
    provider.mockResult = {
      isScam: true,
      confidence: 95,
      reasoning: 'The user is sending a fake link to receive funds.'
    };
    
    const verifier = new AILureVerifier(provider);

    const result = await verifier.verifyIntent('Ось лінк на оплату', 'ESCROW_DELIVERY_SCAM');
    expect(result).not.toBeNull();
    expect(result?.isScam).toBe(true);
    expect(result?.confidence).toBe(95);
  });
});
