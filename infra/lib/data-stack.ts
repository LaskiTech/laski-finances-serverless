import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { Environment } from '../config/environments';
import { ProjectConfig } from '../config/project-config';

export interface DataStackProps extends cdk.StackProps {
  environment: Environment;
  projectConfig: ProjectConfig;
}

export class DataStack extends cdk.Stack {
  public readonly ledgerTable: dynamodb.Table;
  public readonly summaryTable: dynamodb.Table;
  public readonly linksTable: dynamodb.Table;
  public readonly statementsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const prefix = props.projectConfig.prefixNameResources;

    // Stack-level tag
    cdk.Tags.of(this).add('stack', 'data-stack');

    // DynamoDB Ledger table
    this.ledgerTable = new dynamodb.Table(this, 'LedgerTable', {
      tableName: `${prefix}-Ledger`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    // GSI for querying by payment source (English field name)
    this.ledgerTable.addGlobalSecondaryIndex({
      indexName: 'GSI_LookupBySource',
      partitionKey: { name: 'source', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for top spending by category per month
    this.ledgerTable.addGlobalSecondaryIndex({
      indexName: 'GSI_MonthlyByCategory',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'categoryMonth', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Sparse GSI for idempotent re-import of statement transactions.
    // Only items that carry an `importHash` attribute participate — manual
    // Ledger entries (no importHash) are not indexed.
    this.ledgerTable.addGlobalSecondaryIndex({
      indexName: 'GSI_LedgerByImportHash',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'importHash', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // MonthlySummary table — pre-aggregated monthly totals per user
    this.summaryTable = new dynamodb.Table(this, 'MonthlySummaryTable', {
      tableName: `${prefix}-MonthlySummary`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    // Links table — expense association layer
    this.linksTable = new dynamodb.Table(this, 'LinksTable', {
      tableName: `${prefix}-Links`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    // GSI for bidirectional link lookups by child
    this.linksTable.addGlobalSecondaryIndex({
      indexName: 'GSI_LinksByChild',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'childSk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for link lookup by linkId (used for DELETE /links/{linkId})
    this.linksTable.addGlobalSecondaryIndex({
      indexName: 'GSI_LinksById',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'linkId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Statements table — tracks upload lifecycle + draft extracted transactions
    this.statementsTable = new dynamodb.Table(this, 'StatementsTable', {
      tableName: `${prefix}-Statements`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    // GSI for S3 event → Statement lookup by object key
    this.statementsTable.addGlobalSecondaryIndex({
      indexName: 'GSI_StatementsByS3Key',
      partitionKey: { name: 's3Key', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for reconciliation: find credit-card statements by due date
    this.statementsTable.addGlobalSecondaryIndex({
      indexName: 'GSI_StatementsByDocumentTypeDueDate',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'documentTypeDueDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Outputs for external consumers
    new cdk.CfnOutput(this, 'LedgerTableName', {
      value: this.ledgerTable.tableName,
    });

    new cdk.CfnOutput(this, 'MonthlySummaryTableName', {
      value: this.summaryTable.tableName,
    });

    new cdk.CfnOutput(this, 'LinksTableName', {
      value: this.linksTable.tableName,
    });

    new cdk.CfnOutput(this, 'StatementsTableName', {
      value: this.statementsTable.tableName,
    });

    new cdk.CfnOutput(this, 'StatementsTableArn', {
      value: this.statementsTable.tableArn,
    });
  }
}
