import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { lessons, disciplines, lessonTypes, employeesDepartments, employees, units } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
export const lessonsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: lessons.id,
        curriculumId: lessons.curriculumId,
        unitId: lessons.unitId,
        lessonTypeId: lessons.lessonTypeId,
        disciplineId: lessons.disciplineId,
        teacherId: lessons.teacherId,
        countPerSemester: lessons.countPerSemester,
        isActive: lessons.isActive,
  display: sql<string>`
    ${units.code} || '-' || ${lessonTypes.abbreviation} || '-' ||
    ${disciplines.abbreviation} || '-' ||
    ${employees.surname} || ' ' || left(${employees.name},1) || '.' ||
    left(${employees.patronymic},1) || '.'
  `.as('display'),
      })
      .from(lessons)
      .innerJoin(disciplines, eq(lessons.disciplineId, disciplines.id))
      .innerJoin(units, eq(lessons.unitId, units.id))   
      .leftJoin(employeesDepartments, eq(lessons.teacherId, employeesDepartments.id))
      .leftJoin(employees, eq(employeesDepartments.employeeId, employees.id))
      .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id));
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: lessons.id,
          curriculumId: lessons.curriculumId,
          unitId: lessons.unitId,
          lessonTypeId: lessons.lessonTypeId,
          disciplineId: lessons.disciplineId,
          teacherId: lessons.teacherId,
          countPerSemester: lessons.countPerSemester,
          display: sql<string>`
            ${units.code} || '-' || ${lessonTypes.abbreviation} || '-' ||
            ${disciplines.abbreviation} || '-' ||
            ${employees.surname} || ' ' || left(${employees.name},1) || '.' ||
            left(${employees.patronymic},1) || '.'
          `.as('display'),
        })
        .from(lessons)
        .innerJoin(disciplines, eq(lessons.disciplineId, disciplines.id))
        .innerJoin(units, eq(lessons.unitId, units.id))   
        .leftJoin(employeesDepartments, eq(lessons.teacherId, employeesDepartments.id))
        .leftJoin(employees, eq(employeesDepartments.employeeId, employees.id))
        .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id))
        .where(eq(lessons.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
    create: adminProcedure
      .input(z.object({
        curriculumId: z.coerce.number().int(),
        unitId: z.coerce.number().int(),
        lessonTypeId: z.coerce.number().int(),
        disciplineId: z.coerce.number().int(),
        teacherId: z.coerce.number().int().nullable().optional(),
        countPerSemester: z.coerce.number().int().positive("Количество должно быть положительным"),
        isActive: z.boolean().default(true)
      }))
      .mutation(async ({ ctx, input }) => {
        return ctx.db.insert(lessons).values(input).returning();
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        curriculumId: z.number().int().optional(),
        unitId: z.number().int().optional(),
        lessonTypeId: z.number().int().optional(),
        disciplineId: z.number().int().optional(),
        teacherId: z.number().int().nullable().optional(),
        countPerSemester: z.coerce.number().int().positive("Количество должно быть положительным"),
        isActive: z.boolean().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return ctx.db.update(lessons).set(data).where(eq(lessons.id, id)).returning();
      }),
  delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => safeDelete(lessons, input.id, "lessons")),
});