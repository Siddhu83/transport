import { buildApp } from './app.js';
import { env } from './config/env.js';
const app = buildApp();
async function startServer() {
    try {
        await app.listen({ port: env.PORT, host: env.HOST });
        console.info(`🚀 Transport Backend API Gateway running at http://${env.HOST}:${env.PORT}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
startServer();
