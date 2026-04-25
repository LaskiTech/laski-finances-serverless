import { API_BASE_URL, ApiError, getAuthToken, handleResponse } from './client';

export type DocumentType = 'BANK_ACCOUNT' | 'CREDIT_CARD';
export type BankId = 'ITAU';
export type StatementStatus = 'pending' | 'processing' | 'done' | 'imported' | 'failed';

export interface ExtractedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'INC' | 'EXP';
  source: string;
  category: string;
  installmentNumber?: number;
  installmentTotal?: number;
  groupId?: string;
  meta?: Record<string, unknown>;
}

export interface ExtractedInstallmentPreview {
  date: string;
  description: string;
  amount: number;
  source: string;
  category: string;
  installmentNumber: number;
  installmentTotal: number;
  groupId: string;
}

export interface ReconciliationCandidate {
  candidateId: string;
  confidence: 'high' | 'ambiguous' | 'none';
  parentStatementId?: string;
  parentSk?: string;
  parentDescription?: string;
  candidateParents?: Array<{ sk: string; description: string; date: string }>;
  childStatementId: string;
  childCount: number;
  totalAmount: number;
  dateWindow: { from: string; to: string };
}

export interface StatementSummary {
  pk: string;
  sk: string;
  statementId: string;
  bank: BankId;
  documentType: DocumentType;
  filename: string;
  contentType: string;
  s3Key: string;
  status: StatementStatus;
  extractedCount?: number;
  importedCount?: number;
  errors?: string[];
  totalAmount?: number;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StatementDetail extends StatementSummary {
  extractedTransactions?: ExtractedTransaction[];
  futureInstallments?: ExtractedInstallmentPreview[];
  reconciliationCandidates?: ReconciliationCandidate[];
  duplicates?: Array<{ index: number; matchedLedgerSk: string }>;
}

export interface InitUploadRequest {
  filename: string;
  contentType: 'application/pdf' | 'text/csv';
  documentType: DocumentType;
  bank: BankId;
}

export interface InitUploadResponse {
  statementId: string;
  uploadUrl: string;
  expiresAt: string;
  maxBytes: number;
}

export interface ConfirmImportRequest {
  selectedIndices: number[];
  acceptedReconciliationIds?: string[];
  reconciliationChoices?: Record<string, string>;
}

export interface ConfirmImportResponse {
  imported: number;
  skipped: Array<{ index: number; matchedSk: string }>;
  linked: number;
  linkedDetails: Array<{ candidateId: string; parentSk: string; childSk: string; linkId: string }>;
  linkFailed: Array<{ candidateId: string; childSk?: string; reason: string }>;
}

export async function initStatementUpload(req: InitUploadRequest): Promise<InitUploadResponse> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/statements`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return handleResponse<InitUploadResponse>(response);
}

export async function uploadStatementFile(
  uploadUrl: string,
  file: File,
  contentType: string,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!response.ok) {
    throw new ApiError(
      `File upload failed with status ${response.status}`,
      response.status,
    );
  }
}

export async function listStatements(
  cursor?: string,
): Promise<{ items: StatementSummary[]; nextCursor: string | null }> {
  const token = await getAuthToken();
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const response = await fetch(`${API_BASE_URL}/statements${qs}`, {
    method: 'GET',
    headers: { Authorization: token },
  });
  return handleResponse<{ items: StatementSummary[]; nextCursor: string | null }>(response);
}

export async function reviewStatement(statementId: string): Promise<StatementDetail> {
  const token = await getAuthToken();
  const response = await fetch(
    `${API_BASE_URL}/statements/${encodeURIComponent(statementId)}`,
    { method: 'GET', headers: { Authorization: token } },
  );
  return handleResponse<StatementDetail>(response);
}

export async function confirmStatementImport(
  statementId: string,
  req: ConfirmImportRequest,
): Promise<ConfirmImportResponse> {
  const token = await getAuthToken();
  const response = await fetch(
    `${API_BASE_URL}/statements/${encodeURIComponent(statementId)}/confirm`,
    {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
  );
  return handleResponse<ConfirmImportResponse>(response);
}

export async function deleteStatement(statementId: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(
    `${API_BASE_URL}/statements/${encodeURIComponent(statementId)}`,
    { method: 'DELETE', headers: { Authorization: token } },
  );
  await handleResponse<{ statementId: string; deleted: boolean }>(response);
}
