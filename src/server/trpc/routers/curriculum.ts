import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { curriculum, disciplines } from "@/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const curriculumRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: curriculum.id,
        course: curriculum.course,
        semester: curriculum.semester,
        disciplineId: curriculum.disciplineId,
        hoursLecture: curriculum.hoursLecture,
        hoursGuidedStudy: curriculum.hoursGuidedStudy,
        hoursWorkshop: curriculum.hoursWorkshop,
        hoursLab: curriculum.hoursLab,
        additionalTaskId: curriculum.additionalTaskId,
        controlTypeId: curriculum.controlTypeId,
        isActive: curriculum.isActive,
        display: sql<string>`${curriculum.course} || ' курс, ' || ${curriculum.semester} || ' сем. – ' || ${disciplines.abbreviation}`.as('display'),
      })
      .from(curriculum)
      .innerJoin(disciplines, eq(curriculum.disciplineId, disciplines.id))
      .orderBy(asc(curriculum.course), asc(curriculum.semester));
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: curriculum.id,
          course: curriculum.course,
          semester: curriculum.semester,
          disciplineId: curriculum.disciplineId,
          hoursLecture: curriculum.hoursLecture,
          hoursGuidedStudy: curriculum.hoursGuidedStudy,
          hoursWorkshop: curriculum.hoursWorkshop,
          hoursLab: curriculum.hoursLab,
          additionalTaskId: curriculum.additionalTaskId,
          controlTypeId: curriculum.controlTypeId,
          isActive: curriculum.isActive,
          display: sql<string>`${curriculum.course} || ' курс, ' || ${curriculum.semester} || ' сем. – ' || ${disciplines.abbreviation}`.as('display'),
        })
        .from(curriculum)
        .innerJoin(disciplines, eq(curriculum.disciplineId, disciplines.id))
        .where(eq(curriculum.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      course: z.coerce.number().int(),
      semester: z.coerce.number().int(),
      disciplineId: z.coerce.number().int(),
      hoursLecture: z.coerce.number().int().optional(),
      hoursGuidedStudy: z.coerce.number().int().optional(),
      hoursWorkshop: z.coerce.number().int().optional(),
      hoursLab: z.coerce.number().int().optional(),
      additionalTaskId: z.coerce.number().int().nullable().optional(),
      controlTypeId: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [duplicate] = await ctx.db
        .select({ id: curriculum.id })
        .from(curriculum)
        .where(and(
          eq(curriculum.disciplineId, input.disciplineId),
          eq(curriculum.course, input.course),
          eq(curriculum.semester, input.semester)
        ))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Учебный план с такой дисциплиной, курсом и семестром уже существует' });
      return ctx.db.insert(curriculum).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      course: z.coerce.number().int().optional(),
      semester: z.coerce.number().int().optional(),
      disciplineId: z.coerce.number().int().optional(),
      hoursLecture: z.coerce.number().int().optional(),
      hoursGuidedStudy: z.coerce.number().int().optional(),
      hoursWorkshop: z.coerce.number().int().optional(),
      hoursLab: z.coerce.number().int().optional(),
      additionalTaskId: z.coerce.number().int().nullable().optional(),
      controlTypeId: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, isActive, ...data } = input;
      if (data.disciplineId && data.course && data.semester) {
        const [duplicate] = await ctx.db
          .select({ id: curriculum.id })
          .from(curriculum)
          .where(and(
            eq(curriculum.disciplineId, data.disciplineId),
            eq(curriculum.course, data.course),
            eq(curriculum.semester, data.semester),
            sql`${curriculum.id} != ${id}`
          ))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Учебный план с такой дисциплиной, курсом и семестром уже существует' });
      }
      if (isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "curriculum", id);
          const [result] = await tx
            .update(curriculum)
            .set({ ...data, isActive: false })
            .where(eq(curriculum.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(curriculum).set({ ...data, isActive }).where(eq(curriculum.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(curriculum, input.id, "curriculum")),
});