import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { hourTypeMapping } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";

export const hourTypeMappingRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(hourTypeMapping)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(hourTypeMapping).where(eq(hourTypeMapping.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      planHourColumn: z.string().min(1),
      priorityColumn: z.string().min(1),
      lessonTypeId: z.coerce.number().int(),
      isActive: z.boolean().default(true)
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: hourTypeMapping.id })
        .from(hourTypeMapping)
        .where(eq(hourTypeMapping.planHourColumn, input.planHourColumn))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Маппинг с такой колонкой плана уже существует' });
      return ctx.db.insert(hourTypeMapping).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      planHourColumn: z.string().min(1).optional(),
      priorityColumn: z.string().min(1).optional(),
      lessonTypeId: z.coerce.number().int().optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.planHourColumn) {
        const [existing] = await ctx.db
          .select({ id: hourTypeMapping.id })
          .from(hourTypeMapping)
          .where(and(eq(hourTypeMapping.planHourColumn, data.planHourColumn), sql`${hourTypeMapping.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Маппинг с такой колонкой плана уже существует' });
      }
      return ctx.db.update(hourTypeMapping).set(data).where(eq(hourTypeMapping.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(hourTypeMapping, input.id, "hourTypeMapping")),
});