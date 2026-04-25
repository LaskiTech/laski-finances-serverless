export interface ExtractedTransaction {
  date: string;              // ISO 8601
  description: string;
  amount: number;            // always positive, sign in `type`
  type: 'INC' | 'EXP';
  source: string;
  category: string;
  installmentNumber?: number;
  installmentTotal?: number;
  groupId?: string;
  meta?: Record<string, unknown>;  // parser-specific extras (e.g. USD, conversion rate)
}

export interface ExtractedInstallmentPreview {
  date: string;
  description: string;
  amount: number;
  source: string;
  installmentNumber: number;
  installmentTotal: number;
}

export interface ParseResult {
  extractedTransactions: ExtractedTransaction[];
  futureInstallments?: ExtractedInstallmentPreview[];
  totalAmount?: number;       // credit card only — cross-check
  dueDate?: string;           // credit card only — ISO
  bankAccount?: string;       // bank account only — derived source
}

export interface Parser {
  parse(bytes: Uint8Array): Promise<ParseResult>;
}

export type BankId = 'ITAU';
export type DocumentType = 'BANK_ACCOUNT' | 'CREDIT_CARD';
