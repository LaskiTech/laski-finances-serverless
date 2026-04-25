import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { extractText } from '../../src/statements/parsers/pdf-text.js';

const FIXTURES = new URL('../../../../.kiro/specs/statement-import/fixtures/', import.meta.url);

describe('debug', () => {
  it('prints raw credit card text', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('extrato-lancamentos_cartao.pdf', FIXTURES)));
    const text = await extractText(bytes);
    console.log('=== RAW CREDIT CARD TEXT ===');
    console.log(text);
  }, 30_000);

  it('prints raw bank account text', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('extrato-lancamentos_conta.pdf', FIXTURES)));
    const text = await extractText(bytes);
    console.log('=== RAW BANK ACCOUNT TEXT ===');
    console.log(text);
  }, 30_000);
});
