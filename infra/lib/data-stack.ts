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
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const prefix = props.projectConfig.prefixNameResources;
    const stage = props.environment.stage;

    // Stack-level tag
    cdk.Tags.of(this).add('stack', 'data-stack');

    // DynamoDB Ledger table
    const ledgerTable = new dynamodb.Table(this, 'LedgerTable', {
      tableName: `${prefix}-Ledger`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    // GSI for querying by payment source (English field name)
    ledgerTable.addGlobalSecondaryIndex({
      indexName: 'GSI_LookupBySource',
      partitionKey: { name: 'source', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Cross-stack exports
    new cdk.CfnOutput(this, 'LedgerTableName', {
      value: ledgerTable.tableName,
      exportName: `${prefix}-ledger-table-name-${stage}`,
    });

    new cdk.CfnOutput(this, 'LedgerTableArn', {
      value: ledgerTable.tableArn,
      exportName: `${prefix}-ledger-table-arn-${stage}`,
    });
  }
}
