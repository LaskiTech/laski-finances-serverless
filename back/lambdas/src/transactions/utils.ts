import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

/**
 * Decodes a URL-encoded sort key (`sk`) path parameter.
 *
 * API Gateway REST API (v1) does not fully decode percent-encoded characters
 * like `%23` (which represents `#`) in path parameters. Since transaction sort
 * keys contain `#` (e.g., `TRANS#2026-03#EXP#<uuid>`), the frontend correctly
 * encodes them as `%23`, but the Lambda handler must decode them before using
 * the value in DynamoDB lookups.
 *
 * This is a no-op for strings that contain no percent-encoded sequences.
 */
export const decodeSk = (sk: string): string => decodeURIComponent(sk);

/**
 * Extracts the Cognito user ID (sub) from the API Gateway event's authorizer claims.
 */
export const extractUserId = (event: APIGatewayProxyEvent): string | null => {
  return event.requestContext.authorizer?.claims?.sub ?? null;
};

/**
 * Builds a standard error response with JSON body.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

export const errorResponse = (
  statusCode: number,
  message: string,
  details?: string[]
): APIGatewayProxyResult => {
  const body: { error: string; details?: string[] } = { error: message };
  if (details !== undefined) {
    body.details = details;
  }
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
};

/**
 * Builds a standard success response with JSON body.
 */
export const successResponse = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
};

/**
 * Safely parses a JSON body string. Returns the parsed object or null if parsing fails.
 */
export const parseJsonBody = (body: string | null): unknown | null => {
  if (body === null) {
    return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};
