import { API_BASE_URL, getAuthToken, handleResponse } from './client';

export interface IncomeItem {
  pk: string;
  sk: string;
  description: string;
  amount: number;
  totalAmount: number;
  category: string;
  source: string;
  type: 'INC';
  date: string;
  groupId: string;
  installmentNumber: number;
  installmentTotal: number;
  isRecurring?: boolean;
  recurringId?: string;
}

export interface CreateIncomePayload {
  description: string;
  totalAmount: number;
  date: string;
  source: string;
  category: string;
  recurrence?: {
    frequency: 'monthly' | 'weekly';
    endDate?: string;
    occurrences?: number;
  };
}

export interface UpdateIncomePayload {
  description: string;
  amount: number;
  date: string;
  source: string;
  category: string;
}

export async function listIncome(
  month?: string,
  recurring?: boolean,
): Promise<IncomeItem[]> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (recurring !== undefined) params.set('recurring', String(recurring));

  const query = params.toString();
  const url = `${API_BASE_URL}/income${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: token },
  });

  const body = await handleResponse<{ income: IncomeItem[] }>(response);
  return body.income;
}

export async function getIncome(sk: string): Promise<IncomeItem> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/income/${encodeURIComponent(sk)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: token },
  });

  return handleResponse<IncomeItem>(response);
}

export async function createIncome(
  payload: CreateIncomePayload,
): Promise<{ message: string; recurringId?: string; entriesCreated: number }> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/income`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<{ message: string; recurringId?: string; entriesCreated: number }>(response);
}

export async function updateIncome(
  sk: string,
  payload: UpdateIncomePayload,
  updateGroup?: boolean,
): Promise<IncomeItem | { message: string; updatedCount: number }> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (updateGroup) params.set('updateGroup', 'true');

  const query = params.toString();
  const url = `${API_BASE_URL}/income/${encodeURIComponent(sk)}${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<IncomeItem | { message: string; updatedCount: number }>(response);
}

export async function deleteIncome(
  sk: string,
  deleteGroup?: boolean,
): Promise<{ message: string }> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (deleteGroup) params.set('deleteGroup', 'true');

  const query = params.toString();
  const url = `${API_BASE_URL}/income/${encodeURIComponent(sk)}${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: token },
  });

  return handleResponse<{ message: string }>(response);
}
