import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { pairs } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";

export const pairsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(pairs)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(pairs).where(eq(pairs.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      number: z.coerce.number().int().positive(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: pairs.id })
        .from(pairs)
        .where(eq(pairs.number, input.number))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Пара с таким номером уже существует' });
      return ctx.db.insert(pairs).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      number: z.coerce.number().int().positive().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.number) {
        const [existing] = await ctx.db
          .select({ id: pairs.id })
          .from(pairs)
          .where(and(eq(pairs.number, data.number), sql`${pairs.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Пара с таким номером уже существует' });
      }
      return ctx.db.update(pairs).set(data).where(eq(pairs.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(pairs, input.id, "pairs")),
});