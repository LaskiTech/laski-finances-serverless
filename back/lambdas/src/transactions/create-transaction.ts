import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.claims.sub; // RN6: Isola pelo ID do Cognito
    const body = JSON.parse(event.body || "{}");
    const { descricao, valorTotal, parcelas = 1, data, categoria, fonte, tipo } = body;

    const itemsToCreate = [];
    const transactionGroupId = uuidv4(); // Para agrupar parcelas futuramente

    for (let i = 0; i < parcelas; i++) {
      const dataParcela = new Date(data);
      dataParcela.setMonth(dataParcela.getMonth() + i);
      
      const anoMes = dataParcela.toISOString().slice(0, 7); // Formato YYYY-MM
      const valorParcela = valorTotal / parcelas;

      const item = {
        pk: `USER#${userId}`,
        sk: `TRANS#${anoMes}#${tipo}#${uuidv4()}`,
        descricao: parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao,
        valor: valorParcela,
        categoria,
        fonte, // RN5: Cartão XP, Nubank, etc.
        tipo,  // REC (Receita) ou DESP (Despesa)
        data: dataParcela.toISOString(),
        groupId: transactionGroupId
      };

      // Nota: Em produção, usaríamos BatchWriteItem. Para simplicidade aqui:
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));
    }

    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Transação(ões) criada(s) com sucesso!" }),
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: "Erro interno" }) };
  }
};