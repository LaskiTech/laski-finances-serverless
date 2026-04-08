import { API_BASE_URL, getAuthToken, handleResponse } from './client';

// --- Interfaces ---

export interface SingleMonthResponse {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  transactionCount: number;
}

export interface MonthSummary {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  transactionCount: number;
}

export interface RangeResponse {
  from: string;
  to: string;
  months: MonthSummary[];
  totals: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
  };
}

// --- API Functions ---

export async function getSingleMonthBalance(month?: string): Promise<SingleMonthResponse> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (month) params.set('month', month);

  const query = params.toString();
  const url = `${API_BASE_URL}/balance${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: token },
  });

  return handleResponse<SingleMonthResponse>(response);
}

export async function getRangeBalance(from: string, to: string): Promise<RangeResponse> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);

  const url = `${API_BASE_URL}/balance?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: token },
  });

  return handleResponse<RangeResponse>(response);
}
