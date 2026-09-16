export type VaultItemCategory =
  | 'MOTHER_MAIDEN_NAME'
  | 'TAX_ID'
  | 'SECRET_WORD'
  | 'PASSPORT_ID'
  | 'DATE_OF_BIRTH'
  | 'FINANCIAL_PHONE'
  | 'FATHER_NAME'
  | 'CUSTOM';

export type VaultSensitivityTier = 'TIER_A_ABSOLUTE' | 'TIER_B_CONDITIONAL';

export interface VaultItem {
  id: string;
  category: VaultItemCategory;
  label: string;
  realValue: string;
  decoyValue: string;
  keywords: string[];
  createdAt: number;
}

export interface VaultMatchResult {
  matchedItem: VaultItem;
  inputElement?: HTMLInputElement | HTMLTextAreaElement;
  detectedFieldLabel: string;
  matchType: 'VALUE_MATCH' | 'FIELD_LABEL_MATCH';
  isDecoyAvailable: boolean;
  tier: VaultSensitivityTier;
}
