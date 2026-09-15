import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { lessonTypes } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const lessonTypesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: lessonTypes.id,
        name: lessonTypes.name,
        abbreviation: lessonTypes.abbreviation,
        isActive: lessonTypes.isActive,
        display: sql<string>`CASE ${lessonTypes.name}
          WHEN 'lecture' THEN 'лекция'
          WHEN 'workshop' THEN 'практика'
          WHEN 'guidedStudy' THEN 'КСР'
          WHEN 'lab' THEN 'лабораторная работа'
          ELSE ${lessonTypes.name}
        END`.as('display'),
      })
      .from(lessonTypes);
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: lessonTypes.id,
          name: lessonTypes.name,
          abbreviation: lessonTypes.abbreviation,
          isActive: lessonTypes.isActive,
          display: sql<string>`CASE ${lessonTypes.name}
            WHEN 'lecture' THEN 'лекция'
            WHEN 'workshop' THEN 'практика'
            WHEN 'guidedStudy' THEN 'КСР'
            WHEN 'lab' THEN 'лабораторная работа'
            ELSE ${lessonTypes.name}
          END`.as('display'),
        })
        .from(lessonTypes)
        .where(eq(lessonTypes.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      abbreviation: z.string().min(1),
      isActive: z.boolean().default(true)
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: lessonTypes.id })
        .from(lessonTypes)
        .where(eq(lessonTypes.name, input.name))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Тип занятия с таким системным именем уже существует' });
      return ctx.db.insert(lessonTypes).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      abbreviation: z.string().optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.name) {
        const [existing] = await ctx.db
          .select({ id: lessonTypes.id })
          .from(lessonTypes)
          .where(and(eq(lessonTypes.name, data.name), sql`${lessonTypes.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Тип занятия с таким системным именем уже существует' });
      }
      if (data.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "lessonTypes", id);
          const [result] = await tx
            .update(lessonTypes)
            .set(data)
            .where(eq(lessonTypes.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(lessonTypes).set(data).where(eq(lessonTypes.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(lessonTypes, input.id, "lessonTypes")),
});