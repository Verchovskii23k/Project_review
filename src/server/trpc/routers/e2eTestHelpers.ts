/**
 * Роутер-помощник для E2E-тестов (Playwright / Vitest).
 *
 * Предоставляет две публичные мутации для полной перезагрузки базы данных
 * и создания тестового администратора. Эти процедуры вызываются в начале
 * тестовых сценариев, чтобы гарантировать чистое и предсказуемое состояние.
 *
 * **В production-окружении данный роутер должен быть отключён или защищён
 * дополнительной переменной окружения** (например, `ENABLE_TEST_ROUTES`),
 * так как он позволяет пересоздавать администратора без авторизации.
 *
 * ## Мутации
 * - `resetAndSeed` – очищает все таблицы и заполняет их тестовыми
 *   справочными данными (институты, кафедры, дисциплины, преподаватели,
 *   студенты, аудитории и т.д.). Опционально создаёт администратора
 *   с указанным email и паролем (по умолчанию `admin123`).
 * - `seedAdmin` – добавляет нового администратора с заданным email
 *   и паролем (по умолчанию `admin123`) к уже существующим данным.
 *
 * ## Параметры
 * - `resetAndSeed`:
 *   - `adminEmail?: string` – email для создаваемого администратора.
 *   - `adminPassword?: string` – пароль (если не указан, используется `'admin123'`).
 * - `seedAdmin`:
 *   - `email: string` – email администратора.
 *   - `password?: string` – пароль (по умолчанию `'admin123'`).
 *
 * ## Возвращаемое значение
 * - `resetAndSeed`: `{ login: string, password: string }` если администратор
 *   был создан, либо `null`.
 * - `seedAdmin`: `{ login: string, password: string }`.
 *
 * @remarks
 * - Использует `clearAllTestData` и `seedTestData` из тестовых фикстур.
 * - Пароль хешируется через bcrypt и сохраняется в таблице `users`.
 * - Одновременно создаётся запись в `employees` с флагом `isAdmin: true`.
 */
import { router, publicProcedure } from "../trpc";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { clearAllTestData } from "@/test/helpers";
import { seedTestData } from "@/test/fixtures/fixtures";

export const e2eTestHelpersRouter = router({
  resetAndSeed: publicProcedure
    .input(
      z.object({
        adminEmail: z.string().email().optional(),
        adminPassword: z.string().min(6).optional(),
      }).optional()
    )
    .mutation(async ({ input }) => {
      await clearAllTestData();
      await seedTestData();

      if (input?.adminEmail) {
        const email = input.adminEmail;
        const password = input.adminPassword ?? 'admin123';

        // Создаём пользователя через better-auth
        const result = await auth.api.signUpEmail({
          body: {
            email,
            password,
            name: 'E2E Admin',
          },
        });

        if (!result?.user) {
          throw new Error('Не удалось создать администратора');
        }

        // Устанавливаем роль admin и сохраняем хеш пароля
        const hashed = await bcrypt.hash(password, 10);
        await db.update(users)
          .set({ role: 'admin', hashedPassword: hashed })
          .where(eq(users.id, result.user.id));

        // Создаём сотрудника-админа
        await db.insert(employees).values({
          surname: 'E2E',
          name: 'Admin',
          userId: result.user.id,
          isAdmin: true,
          isActive: true,
        });

        return { login: email, password };
      }
      return null;
    }),

  seedAdmin: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6).optional() }))
    .mutation(async ({ input }) => {
      const password = input.password ?? 'admin123';
      const result = await auth.api.signUpEmail({
        body: {
          email: input.email,
          password,
          name: 'E2E Admin',
        },
      });

      if (!result?.user) {
        throw new Error('Не удалось создать администратора');
      }

      const hashed = await bcrypt.hash(password, 10);
      await db.update(users)
        .set({ role: 'admin', hashedPassword: hashed })
        .where(eq(users.id, result.user.id));

      await db.insert(employees).values({
        surname: 'E2E',
        name: 'Admin',
        userId: result.user.id,
        isAdmin: true,
        isActive: true,
      });

      return { login: input.email, password };
    }),
});