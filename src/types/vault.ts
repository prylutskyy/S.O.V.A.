export type VaultItemCategory =
  | 'MOTHER_MAIDEN_NAME'
  | 'FATHER_NAME'
  | 'TAX_ID'
  | 'PASSPORT_ID'
  | 'SECRET_WORD'
  | 'CUSTOM';

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
}
