import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { weeks } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";

export const weeksRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(weeks)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(weeks).where(eq(weeks.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      type: z.string().min(1),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: weeks.id })
        .from(weeks)
        .where(eq(weeks.type, input.type))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Неделя с таким типом уже существует' });
      return ctx.db.insert(weeks).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      type: z.string().min(1),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.type) {
        const [existing] = await ctx.db
          .select({ id: weeks.id })
          .from(weeks)
          .where(and(eq(weeks.type, data.type), sql`${weeks.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Неделя с таким типом уже существует' });
      }
      return ctx.db.update(weeks).set(data).where(eq(weeks.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(weeks, input.id, "weeks")),
});