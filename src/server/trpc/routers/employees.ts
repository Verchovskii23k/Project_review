import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { employees, employeesDepartments, users, departments, specialties, profiles, disciplineTeachers } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const employeesRouter = router({
  list: adminProcedure
    .input(z.object({
      instituteId: z.number().optional(),
      departmentId: z.number().optional(),
      profileId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Фильтрованные запросы (только id/display)
      if (input?.profileId) {
        const [profile] = await ctx.db
          .select({ specialtyId: profiles.specialtyId })
          .from(profiles)
          .where(eq(profiles.id, input.profileId))
          .limit(1);
        if (profile) {
          const [specialty] = await ctx.db
            .select({ departmentId: specialties.departmentId })
            .from(specialties)
            .where(eq(specialties.id, profile.specialtyId))
            .limit(1);
          if (specialty) {
            return ctx.db
              .selectDistinct({
                id: employees.id,
                display: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('display'),
              })
              .from(employees)
              .innerJoin(employeesDepartments, eq(employees.id, employeesDepartments.employeeId))
              .where(eq(employeesDepartments.departmentId, specialty.departmentId))
              .orderBy(asc(sql`display`));
          }
        }
        return [];
      }
      if (input?.departmentId) {
        return ctx.db
          .selectDistinct({
            id: employees.id,
            display: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('display'),
          })
          .from(employees)
          .innerJoin(employeesDepartments, eq(employees.id, employeesDepartments.employeeId))
          .where(eq(employeesDepartments.departmentId, input.departmentId))
          .orderBy(asc(sql`display`));
      }
      if (input?.instituteId) {
        return ctx.db
          .selectDistinct({
            id: employees.id,
            display: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('display'),
          })
          .from(employees)
          .innerJoin(employeesDepartments, eq(employees.id, employeesDepartments.employeeId))
          .innerJoin(departments, eq(employeesDepartments.departmentId, departments.id))
          .where(eq(departments.instituteId, input.instituteId))
          .orderBy(asc(sql`display`));
      }
      // Основной запрос списка с логином
      return ctx.db
        .select({
          id: employees.id,
          surname: employees.surname,
          name: employees.name,
          patronymic: employees.patronymic,
          isActive: employees.isActive,
          display: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('display'),
        })
        .from(employees)
        .leftJoin(users, eq(employees.userId, users.id))
        .orderBy(asc(employees.surname));
    }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: employees.id,
          surname: employees.surname,
          name: employees.name,
          patronymic: employees.patronymic, 
          isActive: employees.isActive,
          display: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('display'),
        })
        .from(employees)
        .leftJoin(users, eq(employees.userId, users.id))
        .where(eq(employees.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      surname: z.string().min(1),
      name: z.string().min(1),
      patronymic: z.string().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.insert(employees).values(input).returning();
    }),
update: adminProcedure
  .input(z.object({
    id: z.number(),
    surname: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    patronymic: z.string().optional(),
    isActive: z.boolean().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;

    // Защита от деактивации самого себя
    if (data.isActive === false) {
      const [employee] = await ctx.db
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, id))
        .limit(1);
      if (employee?.userId && ctx.user?.id === employee.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Нельзя деактивировать самого себя',
        });
      }
      // Каскадная деактивация (существующая логика)
      return ctx.db.transaction(async (tx) => {
        await cascadeDeactivate(tx, "employees", id);
        const [result] = await tx
          .update(employees)
          .set(data)
          .where(eq(employees.id, id))
          .returning();
        return result;
      });
    }
    // Обычное обновление (включая активацию)
    return ctx.db.update(employees).set(data).where(eq(employees.id, id)).returning();
  }),

  
delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [employee] = await ctx.db
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, input.id, ))
        .limit(1);
      if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
      if (employee.userId && ctx.user?.id === employee.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Нельзя удалить самого себя' });
      }

      // Проверяем, не используется ли сотрудник в дисциплинах
      const [related] = await ctx.db
        .select({ id: disciplineTeachers.id })
        .from(disciplineTeachers)
        .innerJoin(employeesDepartments, eq(disciplineTeachers.teacherDepartmentId, employeesDepartments.id))
        .where(eq(employeesDepartments.employeeId, input.id))
        .limit(1);

      if (related) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Невозможно удалить сотрудника, так как он назначен преподавателем дисциплины. Сначала удалите его из дисциплин.',
        });
      }

      // 1. Отвязываем учётную запись
      if (employee.userId) {
        await ctx.db.update(employees).set({ userId: null }).where(eq(employees.id, input.id));
        await ctx.db.delete(users).where(eq(users.id, employee.userId));
      }

      // 2. Удаляем связи с кафедрами
      await ctx.db.delete(employeesDepartments).where(eq(employeesDepartments.employeeId, input.id));

      // 3. Удаляем самого сотрудника
      await ctx.db.delete(employees).where(eq(employees.id, input.id));
      return { success: true };
    }),
});