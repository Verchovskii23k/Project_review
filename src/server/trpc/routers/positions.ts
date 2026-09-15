import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { positions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const positionsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(positions)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(positions).where(eq(positions.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({ name: z.string().min(1), abbreviation: z.string().optional(), isActive: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: positions.id })
        .from(positions)
        .where(eq(positions.name, input.name))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Должность с таким названием уже существует' });
      return ctx.db.insert(positions).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).optional(), abbreviation: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.name) {
        const [existing] = await ctx.db
          .select({ id: positions.id })
          .from(positions)
          .where(and(eq(positions.name, data.name), sql`${positions.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Должность с таким названием уже существует' });
      }
      if (data.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "positions", id);
          const [result] = await tx
            .update(positions)
            .set(data)
            .where(eq(positions.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(positions).set(data).where(eq(positions.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(positions, input.id, "positions")),
});