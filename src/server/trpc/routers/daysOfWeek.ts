import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { daysOfWeek } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";

export const daysOfWeekRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(daysOfWeek)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(daysOfWeek).where(eq(daysOfWeek.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: daysOfWeek.id })
        .from(daysOfWeek)
        .where(eq(daysOfWeek.name, input.name))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'День недели с таким названием уже существует' });
      return ctx.db.insert(daysOfWeek).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.name) {
        const [existing] = await ctx.db
          .select({ id: daysOfWeek.id })
          .from(daysOfWeek)
          .where(and(eq(daysOfWeek.name, data.name), sql`${daysOfWeek.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'День недели с таким названием уже существует' });
      }
      return ctx.db.update(daysOfWeek).set(data).where(eq(daysOfWeek.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(daysOfWeek, input.id, "daysOfWeek")),
});