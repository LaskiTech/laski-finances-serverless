import { cognitoFetchSession } from '../auth/auth-service';

export const API_BASE_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: string[];

  constructor(message: string, statusCode: number = 0, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function getAuthToken(): Promise<string> {
  const session = await cognitoFetchSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    throw new ApiError('No authentication token available', 401);
  }
  return token;
}

export async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorBody: { error?: string; details?: string[] } = {};
    try {
      errorBody = await response.json();
    } catch {
      // response body is not JSON
    }
    throw new ApiError(
      errorBody.error ?? `Request failed with status ${response.status}`,
      response.status,
      errorBody.details,
    );
  }
  return response.json() as Promise<T>;
}
