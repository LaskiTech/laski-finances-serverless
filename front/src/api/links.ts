import { API_BASE_URL, getAuthToken, handleResponse } from './client';

export interface LinkCounterpart {
  pk: string;
  sk: string;
  description: string;
  amount: number;
  type: 'INC' | 'EXP';
  date: string;
  category: string;
  source: string;
}

export interface LinkEntry {
  linkId: string;
  parentSk: string;
  childSk: string;
  createdAt: string;
  counterpart: LinkCounterpart;
}

export interface LinksResponse {
  asParent: LinkEntry[];
  asChild: LinkEntry[];
}

export async function listLinks(sk: string): Promise<LinksResponse> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/links?sk=${encodeURIComponent(sk)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: token },
  });

  return handleResponse<LinksResponse>(response);
}

export async function createLink(
  parentSk: string,
  childSk: string,
): Promise<{ linkId: string; parentSk: string; childSk: string; createdAt: string }> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/links`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parentSk, childSk }),
  });

  return handleResponse<{ linkId: string; parentSk: string; childSk: string; createdAt: string }>(response);
}

export async function deleteLink(linkId: string): Promise<{ message: string }> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/links/${encodeURIComponent(linkId)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: token },
  });

  return handleResponse<{ message: string }>(response);
}
