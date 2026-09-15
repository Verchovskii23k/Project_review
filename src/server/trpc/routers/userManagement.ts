import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import { users, employees, students, accounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateRandomPassword, hashPassword, makeEmail } from '@/lib/password';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/server/trpc';

async function generateUniqueEmail(
  ctx: Context,
  userId: string,
  role: 'admin' | 'teacher' | 'student'
): Promise<string> {
  let person: { surname: string; name: string } | null = null;

  if (role === 'admin' || role === 'teacher') {
    const [emp] = await ctx.db
      .select({ surname: employees.surname, name: employees.name })
      .from(employees)
      .where(eq(employees.userId, userId))
      .limit(1);
    if (emp) person = emp;
  } else if (role === 'student') {
    const [stu] = await ctx.db
      .select({ surname: students.surname, name: students.name })
      .from(students)
      .where(eq(students.userId, userId))
      .limit(1);
    if (stu) person = stu;
  }

  if (!person) throw new TRPCError({ code: 'NOT_FOUND', message: 'Не найдена персона для генерации email' });

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = makeEmail(person.surname, person.name);
    const exists = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, candidate))
      .limit(1);
    if (!exists.length) return candidate;
  }
  return `user_${Date.now()}@internal.uni`;
}

export const userManagementRouter = router({
  getUsers: adminProcedure
    .input(z.object({
      role: z.enum(['teacher', 'student']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const currentUserId = ctx.user!.id;
      const conditions = input.role ? [eq(users.role, input.role)] : [];
      const userList = await ctx.db
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(and(...conditions));

      const result = [];
      for (const user of userList) {
        let fullName = user.email;
        const isSelf = user.id === currentUserId;

        if (user.role === 'teacher' || user.role === 'admin') {
          const [emp] = await ctx.db
            .select({
              surname: employees.surname,
              name: employees.name,
              patronymic: employees.patronymic,
            })
            .from(employees)
            .where(eq(employees.userId, user.id))
            .limit(1);
          if (emp) {
            const patronymicPart = emp.patronymic ? ` ${emp.patronymic}` : '';
            fullName = `${emp.surname} ${emp.name}${patronymicPart}`;
          }
        } else if (user.role === 'student') {
          const [stu] = await ctx.db
            .select({
              surname: students.surname,
              name: students.name,
              patronymic: students.patronymic,
            })
            .from(students)
            .where(eq(students.userId, user.id))
            .limit(1);
          if (stu) {
            const patronymicPart = stu.patronymic ? ` ${stu.patronymic}` : '';
            fullName = `${stu.surname} ${stu.name}${patronymicPart}`;
          }
        }
        result.push({ id: user.id, email: user.email, role: user.role, fullName, isSelf });
      }
      return result;
    }),

  resetUserPassword: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Пользователь не найден' });

      const newEmail = await generateUniqueEmail(ctx, user.id, user.role);
      const newPassword = generateRandomPassword();
      const hashed = await hashPassword(newPassword);

      await ctx.db.update(users)
        .set({ email: newEmail, hashedPassword: hashed })
        .where(eq(users.id, user.id));

      const [acc] = await ctx.db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')))
        .limit(1);

      if (acc) {
        await ctx.db.update(accounts)
          .set({ password: hashed, accountId: newEmail })
          .where(eq(accounts.id, acc.id));
      } else {
        await ctx.db.insert(accounts).values({
          userId: user.id,
          providerId: 'credential',
          accountId: newEmail,
          password: hashed,
        });
      }

      return { newEmail, newPassword };
    }),
});