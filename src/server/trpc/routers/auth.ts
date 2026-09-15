import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { users, employees, students, verificationTokens, accounts } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { sendPasswordResetEmail } from "@/server/email";
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';

export const authRouter = router({
  setup: publicProcedure
    .input(z.object({
      surname: z.string().min(1),
      name: z.string().min(1),
      patronymic: z.string().optional(),
      email: z.string().email(),
      password: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existingAdmin] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'))
        .limit(1);
      if (existingAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Первичная настройка уже выполнена' });
      }

      let result;
      try {
        result = await auth.api.signUpEmail({
          body: {
            email: input.email,
            password: input.password,
            name: `${input.surname} ${input.name}`,
          },
        });
      } catch (e) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось создать администратора. Попробуйте позже.',
        });
      }

      if (!result?.user) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось создать администратора. Попробуйте позже.',
        });
      }

      const hashed = await bcrypt.hash(input.password, 10);
      await ctx.db.update(users).set({ role: 'admin', hashedPassword: hashed }).where(eq(users.id, result.user.id));

      await ctx.db.insert(employees).values({
        surname: input.surname,
        name: input.name,
        patronymic: input.patronymic || null,
        userId: result.user.id,
        isAdmin: true,
        isActive: true,
      });

      return { success: true };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;
    const [user] = await ctx.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    const [emp] = await ctx.db
      .select({ fullName: sql<string>`concat(${employees.surname}, ' ', ${employees.name}, ' ', ${employees.patronymic})` })
      .from(employees)
      .where(eq(employees.userId, userId))
      .limit(1);

    if (emp) return { ...user, fullName: emp.fullName };

    const [stu] = await ctx.db
      .select({ fullName: sql<string>`concat(${students.surname}, ' ', ${students.name})` })
      .from(students)
      .where(eq(students.userId, userId))
      .limit(1);

    return { ...user, fullName: stu?.fullName || user.email };
  }),

  changeEmail: protectedProcedure
    .input(z.object({ newEmail: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      // Получаем текущий email пользователя
      const [currentUser] = await ctx.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!currentUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Пользователь не найден' });
      }

      // Если новый email совпадает с текущим — возвращаем информационное сообщение
      if (currentUser.email === input.newEmail) {
        return { success: true, message: 'Это ваш текущий email' };
      }

      // Проверяем, не занят ли новый email другим пользователем
      const [existing] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.newEmail))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Пользователь с таким email уже существует',
        });
      }

      // Обновляем email
      await ctx.db.update(users)
        .set({ email: input.newEmail })
        .where(eq(users.id, userId));

      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await auth.api.changePassword({
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          },
          headers: ctx.req.headers,
        });
        } catch (e: unknown) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: e instanceof Error ? e.message : 'Не удалось сменить пароль',
          });
        }
      return { success: true };
    }),

  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (user) {
        const token = randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 1000 * 60 * 60);
        await ctx.db.insert(verificationTokens).values({
          identifier: user.email,
          token,
          expires,
        });

        await sendPasswordResetEmail(user.email, token);
      }

      return { message: "Инструкция отправлена на ваш email, если он зарегистрирован." };
    }),

  resetPassword: publicProcedure
    .input(z.object({
      token: z.string(),
      newPassword: z.string().min(8),
      newEmail: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [tokenRecord] = await ctx.db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.token, input.token))
        .limit(1);

      if (!tokenRecord || tokenRecord.expires < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Токен недействителен или истёк' });
      }

      const [user] = await ctx.db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, tokenRecord.identifier))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Пользователь не найден' });
      }

      // Если передан новый email, проверяем его уникальность
      if (input.newEmail && input.newEmail !== user.email) {
        const [existing] = await ctx.db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.newEmail))
          .limit(1);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Пользователь с таким email уже существует' });
        }
      }

      const newEmail = input.newEmail || user.email;
      const hashed = await bcrypt.hash(input.newPassword, 10);

      // Обновляем email и пароль в users
      await ctx.db.update(users)
        .set({ email: newEmail, hashedPassword: hashed })
        .where(eq(users.id, user.id));

      // Обновляем/создаём запись в accounts
      const [acc] = await ctx.db.select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
        .limit(1);

      if (acc) {
        await ctx.db.update(accounts)
          .set({ password: hashed, accountId: newEmail })
          .where(eq(accounts.id, acc.id));
      } else {
        await ctx.db.insert(accounts).values({
          userId: user.id,
          providerId: "credential",
          accountId: newEmail,
          password: hashed,
        });
      }
      // Удаляем использованный токен
      await ctx.db.delete(verificationTokens).where(eq(verificationTokens.token, input.token));

      return { success: true };
    }),
    canSetup: publicProcedure.query(async ({ ctx }) => {
    // Считаем количество пользователей с ролью admin
    const rows = await ctx.db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);
    // Если ни одной записи не найдено — первичная регистрация разрешена
    return rows.length === 0;
  }),
});