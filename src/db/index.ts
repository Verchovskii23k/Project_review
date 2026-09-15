import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Глобальная переменная, чтобы сохранять клиент между перезагрузками модулей
const globalForDb = globalThis as unknown as {
  dbClient: ReturnType<typeof postgres> | undefined;
};

const client =
  globalForDb.dbClient ??
  postgres(connectionString, {
    max: 5,                // не больше 5 одновременных соединений
    idle_timeout: 20,      // закрывать бездействующие соединения через 20 секунд
    connect_timeout: 10,   // таймаут подключения 10 секунд
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.dbClient = client;
}

export const db = drizzle(client, { schema });
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];