import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import { employees, users } from '@/db/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const adminManagementRouter = router({
  listEmployeesWithAdminFlag: adminProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .select({
        id: employees.id,
        surname: employees.surname,
        name: employees.name,
        patronymic: employees.patronymic,
        isAdmin: employees.isAdmin,
        userId: employees.userId
      })
      .from(employees)
      .leftJoin(users, eq(employees.userId, users.id))
      .where(
        and(
          eq(employees.isActive, true),
          or(
            isNull(employees.userId),
            eq(users.role, 'teacher'),
            eq(users.role, 'admin')
          )
        )
      );

    return result;
  }),

  toggleAdmin: adminProcedure
    .input(z.object({ employeeId: z.number(), isAdmin: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { employeeId, isAdmin } = input;

      const [emp] = await ctx.db
        .select({
          id: employees.id,
          userId: employees.userId,
          isAdmin: employees.isAdmin,
        })
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1);

      if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });

      if (ctx.user?.id === emp.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Нельзя изменить свою роль' });
      }

      await ctx.db
        .update(employees)
        .set({ isAdmin })
        .where(eq(employees.id, employeeId));

      if (emp.userId) {
        const newRole = isAdmin ? 'admin' : 'teacher';
        await ctx.db
          .update(users)
          .set({ role: newRole })
          .where(eq(users.id, emp.userId));
      } else {
        return {
          success: true,
          warning:
            'У сотрудника нет учётной записи. Роль будет применена после генерации логинов и паролей.',
        };
      }

      return { success: true };
    }),
});