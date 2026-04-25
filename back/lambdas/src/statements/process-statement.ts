import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import type { S3Event } from 'aws-lambda';
import { docClient } from '../shared/utils';
import { getParser } from './parsers';
import type { BankId, DocumentType } from './parsers/types';
import { reconcile, type StatementLike } from './services/reconciliation';

const STATEMENTS_TABLE_NAME = process.env.STATEMENTS_TABLE_NAME!;

const s3Client = new S3Client({});

interface StatementRecord {
  pk: string;
  sk: string;
  statementId: string;
  bank: BankId;
  documentType: DocumentType;
  s3Key: string;
  status: string;
}

async function findStatementByS3Key(s3Key: string): Promise<StatementRecord | null> {
  const res = await docClient.send(new QueryCommand({
    TableName: STATEMENTS_TABLE_NAME,
    IndexName: 'GSI_StatementsByS3Key',
    KeyConditionExpression: 's3Key = :k',
    ExpressionAttributeValues: { ':k': s3Key },
    Limit: 1,
  }));
  const item = res.Items?.[0];
  if (!item) return null;
  return {
    pk: String(item.pk),
    sk: String(item.sk),
    statementId: String(item.statementId),
    bank: item.bank as BankId,
    documentType: item.documentType as DocumentType,
    s3Key: String(item.s3Key),
    status: String(item.status),
  };
}

async function setProcessing(stmt: StatementRecord): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: STATEMENTS_TABLE_NAME,
    Key: { pk: stmt.pk, sk: stmt.sk },
    UpdateExpression: 'SET #status = :s, updatedAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':s': 'processing',
      ':now': new Date().toISOString(),
    },
  }));
}

async function setFailed(stmt: StatementRecord, message: string): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: STATEMENTS_TABLE_NAME,
    Key: { pk: stmt.pk, sk: stmt.sk },
    UpdateExpression:
      'SET #status = :s, updatedAt = :now, errors = list_append(if_not_exists(errors, :empty), :err)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':s': 'failed',
      ':now': new Date().toISOString(),
      ':err': [message],
      ':empty': [],
    },
  }));
}

async function streamToBytes(body: NodeJS.ReadableStream): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Uint8Array.from(Buffer.concat(chunks));
}

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const s3Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const bucket = record.s3.bucket.name;

    const stmt = await findStatementByS3Key(s3Key);
    if (!stmt) {
      console.error(JSON.stringify({
        level: 'ERROR',
        message: 'Statement not found for s3Key',
        s3Key,
      }));
      continue;
    }

    await setProcessing(stmt);

    try {
      const parser = getParser(stmt.bank, stmt.documentType);

      const obj = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
      if (!obj.Body) throw new Error('Empty S3 body');
      const bytes = await streamToBytes(obj.Body as NodeJS.ReadableStream);

      const parsed = await parser.parse(bytes);

      const stmtLike: StatementLike = {
        statementId: stmt.statementId,
        documentType: stmt.documentType,
        pk: stmt.pk,
      };
      const candidates = await reconcile(stmtLike, parsed);

      const now = new Date().toISOString();
      const documentTypeDueDate = parsed.dueDate
        ? `${stmt.documentType}#${parsed.dueDate}`
        : undefined;

      const names: Record<string, string> = { '#status': 'status' };
      const values: Record<string, unknown> = {
        ':done': 'done',
        ':txs': parsed.extractedTransactions,
        ':fut': parsed.futureInstallments ?? [],
        ':cnt': parsed.extractedTransactions.length,
        ':cand': candidates,
        ':now': now,
      };
      const setExpressions = [
        '#status = :done',
        'extractedTransactions = :txs',
        'futureInstallments = :fut',
        'extractedCount = :cnt',
        'reconciliationCandidates = :cand',
        'updatedAt = :now',
      ];
      if (parsed.totalAmount !== undefined) {
        setExpressions.push('totalAmount = :total');
        values[':total'] = parsed.totalAmount;
      }
      if (parsed.dueDate !== undefined) {
        setExpressions.push('dueDate = :due');
        values[':due'] = parsed.dueDate;
      }
      if (documentTypeDueDate !== undefined) {
        setExpressions.push('documentTypeDueDate = :ddType');
        values[':ddType'] = documentTypeDueDate;
      }

      await docClient.send(new UpdateCommand({
        TableName: STATEMENTS_TABLE_NAME,
        Key: { pk: stmt.pk, sk: stmt.sk },
        UpdateExpression: `SET ${setExpressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }));

      console.log(JSON.stringify({
        level: 'INFO',
        message: 'Statement processed',
        statementId: stmt.statementId,
        extracted: parsed.extractedTransactions.length,
        candidates: candidates.length,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({
        level: 'ERROR',
        message: 'Process statement failed',
        statementId: stmt.statementId,
        error: message,
      }));
      await setFailed(stmt, message);
    }
  }
};
