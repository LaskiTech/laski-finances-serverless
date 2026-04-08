import { API_BASE_URL, ApiError, getAuthToken, handleResponse } from './client';

// Re-export for backwards compatibility
export { ApiError };

// --- Interfaces ---

export interface TransactionItem {
  pk: string;
  sk: string;
  description: string;
  amount: number;
  totalAmount: number;
  category: string;
  source: string;
  type: 'INC' | 'EXP';
  date: string;
  groupId: string;
  installmentNumber: number;
  installmentTotal: number;
}

export interface CreateTransactionPayload {
  description: string;
  totalAmount: number;
  date: string;
  type: 'INC' | 'EXP';
  source: string;
  category: string;
  installments?: number;
}

export interface UpdateTransactionPayload {
  description: string;
  amount: number;
  date: string;
  type: 'INC' | 'EXP';
  source: string;
  category: string;
}

// --- API Functions ---

export async function listTransactions(
  month?: string,
  type?: 'INC' | 'EXP',
): Promise<TransactionItem[]> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (type) params.set('type', type);

  const query = params.toString();
  const url = `${API_BASE_URL}/transactions${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: token },
  });

  const body = await handleResponse<{ transactions: TransactionItem[] }>(response);
  return body.transactions;
}

export async function getTransaction(sk: string): Promise<TransactionItem> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/transactions/${encodeURIComponent(sk)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: token },
  });

  return handleResponse<TransactionItem>(response);
}

export async function createTransaction(
  payload: CreateTransactionPayload,
): Promise<{ message: string }> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/transactions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<{ message: string }>(response);
}

export async function updateTransaction(
  sk: string,
  payload: UpdateTransactionPayload,
): Promise<TransactionItem> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/transactions/${encodeURIComponent(sk)}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<TransactionItem>(response);
}

export async function deleteTransaction(
  sk: string,
  deleteGroup?: boolean,
): Promise<{ message: string }> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (deleteGroup) params.set('deleteGroup', 'true');

  const query = params.toString();
  const url = `${API_BASE_URL}/transactions/${encodeURIComponent(sk)}${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: token },
  });

  return handleResponse<{ message: string }>(response);
}
