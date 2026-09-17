import { HeuristicResult } from '../types';
import { IFormDetector, FormDetectorContext } from './contracts/form-detector.interface';
import { VaultScanner } from '../heuristics/vault-scanner';

export class VaultMarkerDetector implements IFormDetector {
  public readonly id = 'vault_markers';
  public readonly name = 'Personal Vault Sensitive Marker Detector (DLP)';

  public scan(form: HTMLFormElement, context: FormDetectorContext): HeuristicResult[] {
    const scan = VaultScanner.scanFormSync(form, context.currentHost);
    return scan.triggers || [];
  }
}
