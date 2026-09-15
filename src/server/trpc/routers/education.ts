import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { education, educationLevels, educationForms } from "@/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const educationRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: education.id,
        levelId: education.levelId,
        formId: education.formId,
        durationMonths: education.durationMonths,
        isActive: education.isActive,
        display: sql<string>`COALESCE(${educationForms.abbreviation},${educationForms.name}) || '-' || COALESCE(${educationLevels.abbreviation},${educationLevels.name}) || '-' || ${education.durationMonths}`.as('display'),
      })
      .from(education)
      .innerJoin(educationLevels, eq(education.levelId, educationLevels.id))
      .innerJoin(educationForms, eq(education.formId, educationForms.id))
      .orderBy(asc(education.id));
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: education.id,
          levelId: education.levelId,
          formId: education.formId,
          durationMonths: education.durationMonths,
          isActive: education.isActive,
          display: sql<string>`COALESCE(${educationForms.abbreviation},${educationForms.name}) || '-' || COALESCE(${educationLevels.abbreviation},${educationLevels.name}) || '-' || ${education.durationMonths}`.as('display'),
        })
        .from(education)
        .innerJoin(educationLevels, eq(education.levelId, educationLevels.id))
        .innerJoin(educationForms, eq(education.formId, educationForms.id))
        .where(eq(education.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      levelId: z.coerce.number().int(),
      formId: z.coerce.number().int(),
      durationMonths: z.coerce.number().int().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [duplicate] = await ctx.db
        .select({ id: education.id })
        .from(education)
        .where(and(eq(education.levelId, input.levelId), eq(education.formId, input.formId)))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Такая комбинация уровня и формы уже существует' });
      return ctx.db.insert(education).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      levelId: z.coerce.number().int().optional(),
      formId: z.coerce.number().int().optional(),
      durationMonths: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.levelId && data.formId) {
        const [duplicate] = await ctx.db
          .select({ id: education.id })
          .from(education)
          .where(and(
            eq(education.levelId, data.levelId),
            eq(education.formId, data.formId),
            sql`${education.id} != ${id}`
          ))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Такая комбинация уровня и формы уже существует' });
      }
      if (data.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "education", id);
          const [result] = await tx
            .update(education)
            .set(data)
            .where(eq(education.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(education).set(data).where(eq(education.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(education, input.id, "education")),
});