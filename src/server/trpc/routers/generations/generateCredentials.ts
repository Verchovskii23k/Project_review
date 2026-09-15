/**
 * ## Роутер `generateCredentialsRouter`
 *
 * Отвечает за массовую генерацию логинов и паролей для сотрудников и студентов.
 * Используется в разделе «Логины и пароли» панели администратора.
 *
 * Все процедуры доступны только администраторам (`adminProcedure`).
 *
 * ---
 * ### 📋 Процедуры
 *
 * | Процедура          | Тип      | Описание |
 * |--------------------|----------|----------|
 * | `generateCredentials` | mutation | Создаёт учётные записи для всех активных сотрудников и/или студентов, у которых ещё нет привязанного `userId`. |
 *
 * ---
 * ### ⚙️ Алгоритм работы `generateCredentials`
 *
 * 1. **Входные параметры**
 *    - `securityLevel` – уровень сложности пароля (`"low"`, `"medium"`, `"high"`).
 *      *Влияет на длину и состав пароля.*
 *    - ``loginLength` – желаемая длина пароля (опционально, используется только для `"high"`).
 *      *Email формируется по шаблону - подробнее ниже по тексту.*
 *    - `generateFor` – массив с элементами `"employees"` и/или `"students"`.
 *
 * 2. **Выборка персон**
 *    - Для каждой категории (`employees` / `students`) выбираются **активные** записи,
 *      у которых `userId IS NULL` (ещё нет учётной записи).
 *    - У сотрудников дополнительно загружаются поля `surname`, `name`, `patronymic`, `isAdmin`.
 *    - У студентов – только `surname`, `name`. Отчество не хранится в таблице `students`.
 *
 * 3. **Формирование учётных данных**
 *    - **Email (логин)** – берётся из поля `email`, если оно заполнено.
 *      Иначе генерируется функцией `makeEmail(surname, name)` в домене `@internal.uni`
 *      (например, `ivanov.i42@internal.uni`).
 *    - **Пароль** – генерируется функцией `generateRandomPassword()` в зависимости от выбранной сложности
 *    - **Роль** – `"student"` для студентов; `"admin"` или `"teacher"` для сотрудников
 *      (зависит от флага `isAdmin` у сотрудника).
 *    - **Хеш пароля** – вычисляется через `hashPassword()` (bcrypt, 10 раундов).
 *
 * 4. **Сохранение в БД** (всё внутри одной транзакции)
 *    - В таблицу `users` добавляется новая запись (`email`, `role`, `hashedPassword`).
 *    - В таблицу `accounts` добавляется запись с `providerId = "credential"`,
 *      `accountId = email`, `password = хеш`.
 *    - У соответствующей персоны (`employees` или `students`) обновляется поле `userId`
 *      на только что созданный `id` пользователя.
 *
 * 5. **Результат**
 *    - Возвращается объект `{ count, credentials }`, где `credentials` – массив объектов
 *      с полями `fullName`, `email`, `password`, `role`.
 *    - Эти данные отображаются в интерфейсе и доступны для скачивания в CSV.
 *
 * ---
 * ### 🗂️ Связанные модули
 *
 * | Модуль                               | Назначение                                                  |
 * |--------------------------------------|-------------------------------------------------------------|
 * | `src/lib/password.ts`                | `generateRandomPassword()`, `makeEmail()`, `hashPassword()` |
 * | `src/db/schema.ts`                   | Таблицы `users`, `accounts`, `employees`, `students`        |
 * | `src/app/admin/credentials/page.tsx` | Клиентская страница «Логины и пароли»                       |
 *
 * ---
 * ### ⚠️ Особенности
 *
 * - Пользователи с уже существующей учётной записью (`userId NOT NULL`) **пропускаются**.
 * - Пароли возвращаются в открытом виде **только один раз** – сразу после создания.
 * - Для безопасности в production-среде необходимо настроить реальный SMTP-сервер
 *   для отправки паролей на почту.
 * - Функция `makeEmail()` использует домен `@internal.uni`, чтобы исключить коллизии
 *   с реальными почтовыми адресами.
 * - Параметры `securityLevel` и `loginLength` зарезервированы для будущих версий,
 *   в текущей реализации не влияют на логику генерации.
 */
import { z } from "zod";
import { router, adminProcedure } from "../../trpc";
import { users, employees, students, sessions } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { accounts } from "@/db/schema";
import { makeEmail, generateRandomPassword, hashPassword } from '@/lib/password';

export const generateCredentialsRouter = router({
  generateCredentials: adminProcedure
    .input(z.object({
      securityLevel: z.enum(["low", "medium", "high"]),
      loginLength: z.number().int().min(6).max(40).optional(),
      generateFor: z.array(z.enum(["employees", "students"])).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { securityLevel, loginLength, generateFor } = input;
      const newCredentials: {
        fullName: string;
        email: string;
        password: string;
        role: string;
      }[] = [];

      const processPerson = async (
        person: { id: number;
          surname: string;
          name: string;
          patronymic?: string | null;
          isAdmin?: boolean,
          email?: string | null;
         },
        type: "employee" | "student"
      ) => {
        const fullName = [person.surname, person.name, person.patronymic].filter(Boolean).join(" ");
        const email = person.email || makeEmail(person.surname, person.name);
        const password = generateRandomPassword(securityLevel, loginLength);

        const role = type === "student" ? "student" : (person.isAdmin ? "admin" : "teacher");
        const hashed = await hashPassword(password)
        const [newUser] = await ctx.db.insert(users).values({
          email,
          role,
          hashedPassword: hashed,
        }).returning({ id: users.id });
        // Сохраняем пароль в таблице accounts
        
        await ctx.db.insert(accounts).values({
          userId: newUser.id,
          providerId: "credential",
          accountId: email,
          password: hashed,
        });

        if (type === "student") {
          await ctx.db.update(students).set({ userId: newUser.id }).where(eq(students.id, person.id));
        } else {
          await ctx.db.update(employees).set({ userId: newUser.id }).where(eq(employees.id, person.id));
        }

        newCredentials.push({ fullName, email, password, role });
      };

      await ctx.db.transaction(async (tx) => {
        if (generateFor.includes("employees")) {
        const employeeList = await tx
          .select({
            id: employees.id,
            surname: employees.surname,
            name: employees.name,
            patronymic: employees.patronymic,
            isAdmin: employees.isAdmin,
          })
          .from(employees)
          .where(and(eq(employees.isActive, true), isNull(employees.userId)));

          for (const emp of employeeList) {
            await processPerson(emp, "employee");
          }
        }

        if (generateFor.includes("students")) {
        const studentList = await tx
          .select({
            id: students.id,
            surname: students.surname,
            name: students.name,
          })
          .from(students)
          .where(and(eq(students.isActive, true), isNull(students.userId)));

          for (const st of studentList) {
            await processPerson({ ...st, isAdmin: false }, "student");
          }
        }
      });

      return { count: newCredentials.length, credentials: newCredentials };
    }),
    clearAllCredentials: adminProcedure.mutation(async ({ ctx }) => {
    // Принудительно завершаем сессию текущего администратора
    if (ctx.session?.session?.id) {
      await ctx.db.delete(sessions).where(eq(sessions.id, ctx.session.session.id));
    }

    await ctx.db.transaction(async (tx) => {
      await tx.update(employees)
        .set({ userId: null, isAdmin: false})
        .where(eq(employees.isActive, true));
      await tx.update(students)
        .set({ userId: null })
        .where(eq(students.isActive, true));
      await tx.delete(users)

    });

    return { success: true };
  }),
});