import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { controlTypes } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const controlTypesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(controlTypes)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(controlTypes).where(eq(controlTypes.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      abbreviation: z.string().optional(),
      isActive: z.boolean().default(true)
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: controlTypes.id })
        .from(controlTypes)
        .where(eq(controlTypes.name, input.name))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Тип контроля с таким названием уже существует' });
      return ctx.db.insert(controlTypes).values(input).returning();
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
          .select({ id: controlTypes.id })
          .from(controlTypes)
          .where(and(eq(controlTypes.name, data.name), sql`${controlTypes.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Тип контроля с таким названием уже существует' });
      }
      if (data.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "controlTypes", id);
          const [result] = await tx
            .update(controlTypes)
            .set(data)
            .where(eq(controlTypes.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(controlTypes).set(data).where(eq(controlTypes.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(controlTypes, input.id, "controlTypes")),
});