import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

// Shared DynamoDB client singleton — initialized once per Lambda container
export const dynamoClient = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(dynamoClient);

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
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
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

export interface Logger {
  info: (message: string, extra?: Record<string, unknown>) => void;
  error: (message: string, error?: unknown, extra?: Record<string, unknown>) => void;
}

export const createLogger = (requestId: string, userId: string | null): Logger => ({
  info: (message, extra = {}) =>
    console.log(JSON.stringify({ level: 'INFO', requestId, userId, timestamp: new Date().toISOString(), message, ...extra })),
  error: (message, error, extra = {}) =>
    console.error(JSON.stringify({
      level: 'ERROR',
      requestId,
      userId,
      timestamp: new Date().toISOString(),
      message,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      ...extra,
    })),
});

type AuthedHandler = (
  event: APIGatewayProxyEvent,
  userId: string,
  logger: Logger
) => Promise<APIGatewayProxyResult>;

/**
 * Wraps a handler with authentication guard and centralized error handling.
 * Returns 401 if userId is missing, 500 for unhandled exceptions.
 */
export const withAuth = (fn: AuthedHandler) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const userId = extractUserId(event);
    if (!userId) return errorResponse(401, "Unauthorized");
    const logger = createLogger(event.requestContext.requestId, userId);
    try {
      return await fn(event, userId, logger);
    } catch (error) {
      logger.error("Unhandled exception", error);
      return errorResponse(500, "Internal server error");
    }
  };
