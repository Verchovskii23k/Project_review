import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { disciplines } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const disciplinesRouter = router({
  list: adminProcedure
    .input(z.object({ departmentId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const query = ctx.db.select().from(disciplines);
      if (input?.departmentId) query.where(eq(disciplines.departmentId, input.departmentId));
      return query;
    }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(disciplines).where(eq(disciplines.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      abbreviation: z.string().min(1),
      departmentId: z.coerce.number().int(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [duplicate] = await ctx.db
        .select({ id: disciplines.id })
        .from(disciplines)
        .where(eq(disciplines.name, input.name))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Дисциплина с таким названием уже существует' });
      return ctx.db.insert(disciplines).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      abbreviation: z.string().optional(),
      departmentId: z.coerce.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, isActive, ...data } = input;
      if (data.name) {
        const [duplicate] = await ctx.db
          .select({ id: disciplines.id })
          .from(disciplines)
          .where(and(eq(disciplines.name, data.name), sql`${disciplines.id} != ${id}`))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Дисциплина с таким названием уже существует' });
      }
      if (isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "disciplines", id);
          const [result] = await tx
            .update(disciplines)
            .set({ ...data, isActive: false })
            .where(eq(disciplines.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(disciplines).set({ ...data, isActive }).where(eq(disciplines.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(disciplines, input.id, "disciplines")),
});