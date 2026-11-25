import { TEST_DATABASE_URL } from "./constants";

// Nunca tocar la BD de desarrollo desde los tests.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123";
process.env.CRON_SECRET = "test-cron-secret";
process.env.CORS_ALLOWED_ORIGINS = "";
delete process.env.EDDIE_API_TOKEN_HASH;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.RESEND_API_KEY;
(process.env as Record<string, string>).NODE_ENV = "test";
