import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { disciplineTeachers, employeesDepartments, disciplines } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";

export const disciplineTeachersRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(disciplineTeachers)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(disciplineTeachers).where(eq(disciplineTeachers.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      lessonTypeId: z.coerce.number().int(),
      disciplineId: z.coerce.number().int(),
      teacherDepartmentId: z.coerce.number().int(),
      isActive: z.boolean().default(true)
    }))
    .mutation(async ({ ctx, input }) => {
      // Проверка совпадения кафедр
      const [empDept] = await ctx.db
        .select({ departmentId: employeesDepartments.departmentId })
        .from(employeesDepartments)
        .where(eq(employeesDepartments.id, input.teacherDepartmentId))
        .limit(1);
      const [disc] = await ctx.db
        .select({ departmentId: disciplines.departmentId })
        .from(disciplines)
        .where(eq(disciplines.id, input.disciplineId))
        .limit(1);
      if (empDept && disc && empDept.departmentId !== disc.departmentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Кафедра преподавателя и кафедра дисциплины должны совпадать" });
      }

      // Проверка уникальности комбинации
      const [duplicate] = await ctx.db
        .select({ id: disciplineTeachers.id })
        .from(disciplineTeachers)
        .where(and(
          eq(disciplineTeachers.lessonTypeId, input.lessonTypeId),
          eq(disciplineTeachers.disciplineId, input.disciplineId),
          eq(disciplineTeachers.teacherDepartmentId, input.teacherDepartmentId)
        ))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Такая связка уже существует' });

      return ctx.db.insert(disciplineTeachers).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      lessonTypeId: z.coerce.number().int().optional(),
      disciplineId: z.coerce.number().int().optional(),
      teacherDepartmentId: z.coerce.number().int().optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      if (data.teacherDepartmentId && data.disciplineId) {
        const [empDept] = await ctx.db
          .select({ departmentId: employeesDepartments.departmentId })
          .from(employeesDepartments)
          .where(eq(employeesDepartments.id, data.teacherDepartmentId))
          .limit(1);
        const [disc] = await ctx.db
          .select({ departmentId: disciplines.departmentId })
          .from(disciplines)
          .where(eq(disciplines.id, data.disciplineId))
          .limit(1);
        if (empDept && disc && empDept.departmentId !== disc.departmentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Кафедра преподавателя и кафедра дисциплины должны совпадать" });
        }
      }

      if (data.lessonTypeId && data.disciplineId && data.teacherDepartmentId) {
        const [duplicate] = await ctx.db
          .select({ id: disciplineTeachers.id })
          .from(disciplineTeachers)
          .where(and(
            eq(disciplineTeachers.lessonTypeId, data.lessonTypeId),
            eq(disciplineTeachers.disciplineId, data.disciplineId),
            eq(disciplineTeachers.teacherDepartmentId, data.teacherDepartmentId),
            sql`${disciplineTeachers.id} != ${id}`
          ))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Такая связка уже существует' });
      }

      return ctx.db.update(disciplineTeachers).set(data).where(eq(disciplineTeachers.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(disciplineTeachers, input.id, "disciplineTeachers")),
});