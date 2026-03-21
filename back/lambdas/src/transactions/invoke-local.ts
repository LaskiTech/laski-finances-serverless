import { handler } from './create-transaction';
import * as dotenv from 'dotenv';

// Carrega variáveis do .env se preferir, ou injeta manualmente
process.env.TABLE_NAME = 'laskifin-Ledger'; 
process.env.AWS_REGION = 'us-west-2';

const mockEvent: any = {
    body: JSON.stringify({
        descricao: "Debug Local",
        valorTotal: 100,
        parcelas: 1,
        data: new Date().toISOString(),
        tipo: "DESP",
        fonte: "Debug"
    }),
    requestContext: {
        authorizer: { claims: { sub: "user-debug-123" } }
    }
};

(async () => {
    console.log("🚀 Iniciando Debug Local...");
    const result = await handler(mockEvent);
    console.log("✅ Resultado:", result);
})();