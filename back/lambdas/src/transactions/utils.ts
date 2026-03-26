import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

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
