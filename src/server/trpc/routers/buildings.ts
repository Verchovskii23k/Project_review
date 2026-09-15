import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { buildings } from "@/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const buildingsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(buildings).orderBy(asc(buildings.id));
  }),
  get: adminProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db.select().from(buildings).where(eq(buildings.id, input.id)).limit(1);
    return rows[0] ?? null;
  }),
  create: adminProcedure
    .input(z.object({
      number: z.coerce.number().int().positive(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: buildings.id })
        .from(buildings)
        .where(eq(buildings.number, input.number))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Корпус с таким номером уже существует' });
      return ctx.db.insert(buildings).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      number: z.coerce.number().int().positive().optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.number) {
        const [existing] = await ctx.db
          .select({ id: buildings.id })
          .from(buildings)
          .where(and(eq(buildings.number, data.number), sql`${buildings.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Корпус с таким номером уже существует' });
      }
      if (data.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "buildings", id);
          const [result] = await tx
            .update(buildings)
            .set(data)
            .where(eq(buildings.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(buildings).set(data).where(eq(buildings.id, id)).returning();
      
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(buildings, input.id, "buildings")),

});