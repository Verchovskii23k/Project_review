import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { employeesDepartments, employees, departments, employmentTypes, positions } from "@/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const employeesDepartmentsRouter = router({
  list: adminProcedure
    .input(z.object({ instituteId: z.number().optional(), departmentId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const query = ctx.db
        .select({
          id: employeesDepartments.id,
          employeeId: employeesDepartments.employeeId,
          departmentId: employeesDepartments.departmentId,
          employmentTypeId: employeesDepartments.employmentTypeId,
          positionId: employeesDepartments.positionId,
          isActive: employeesDepartments.isActive,
          display: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('display'),
          employmentTypeDisplay: employmentTypes.name,
          positionDisplay: positions.name,
        })
        .from(employeesDepartments)
        .innerJoin(employees, eq(employeesDepartments.employeeId, employees.id))
        .leftJoin(employmentTypes, eq(employeesDepartments.employmentTypeId, employmentTypes.id))
        .leftJoin(positions, eq(employeesDepartments.positionId, positions.id));

      if (input?.departmentId) query.where(eq(employeesDepartments.departmentId, input.departmentId));
      if (input?.instituteId) {
        query.innerJoin(departments, eq(employeesDepartments.departmentId, departments.id))
          .where(eq(departments.instituteId, input.instituteId));
      }
      return query.orderBy(asc(sql`display`));
    }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: employeesDepartments.id,
          employeeId: employeesDepartments.employeeId,
          departmentId: employeesDepartments.departmentId,
          employmentTypeId: employeesDepartments.employmentTypeId,
          positionId: employeesDepartments.positionId,
          isActive: employeesDepartments.isActive,
          display: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('display'),
          employmentTypeDisplay: employmentTypes.name,
          positionDisplay: positions.name,
        })
        .from(employeesDepartments)
        .innerJoin(employees, eq(employeesDepartments.employeeId, employees.id))
        .leftJoin(employmentTypes, eq(employeesDepartments.employmentTypeId, employmentTypes.id))
        .leftJoin(positions, eq(employeesDepartments.positionId, positions.id))
        .where(eq(employeesDepartments.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      employeeId: z.coerce.number().int(),
      departmentId: z.coerce.number().int(),
      employmentTypeId: z.coerce.number().int().nullable().optional(),
      positionId: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [duplicate] = await ctx.db
        .select({ id: employeesDepartments.id })
        .from(employeesDepartments)
        .where(and(eq(employeesDepartments.employeeId, input.employeeId), eq(employeesDepartments.departmentId, input.departmentId)))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Этот сотрудник уже привязан к этой кафедре' });
      return ctx.db.insert(employeesDepartments).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      employeeId: z.coerce.number().int().optional(),
      departmentId: z.coerce.number().int().optional(),
      employmentTypeId: z.coerce.number().int().nullable().optional(),
      positionId: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.employeeId && data.departmentId) {
        const [duplicate] = await ctx.db
          .select({ id: employeesDepartments.id })
          .from(employeesDepartments)
          .where(and(
            eq(employeesDepartments.employeeId, data.employeeId),
            eq(employeesDepartments.departmentId, data.departmentId),
            sql`${employeesDepartments.id} != ${id}`
          ))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Этот сотрудник уже привязан к этой кафедре' });
      }
      if (data.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "employeesDepartments", id);
          const [result] = await tx
            .update(employeesDepartments)
            .set(data)
            .where(eq(employeesDepartments.id, id))
            .returning();
          return result ?? null;
        });
      }
      return ctx.db.update(employeesDepartments).set(data).where(eq(employeesDepartments.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(employeesDepartments, input.id, "employeesDepartments")),
});