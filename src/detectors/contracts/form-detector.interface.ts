import { HeuristicResult } from '../../types';

export interface FormDetectorContext {
  currentHost: string;
  targetHost: string;
}

export interface IFormDetector {
  readonly id: string;
  readonly name: string;
  scan(form: HTMLFormElement, context: FormDetectorContext): HeuristicResult[];
}
