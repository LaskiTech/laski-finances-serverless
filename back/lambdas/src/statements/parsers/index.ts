import type { BankId, DocumentType, Parser } from './types';
import { llmParser } from './llm-parser';

export function getParser(bank: BankId, documentType: DocumentType): Parser {
  return llmParser(bank, documentType);
}

export * from './types';
