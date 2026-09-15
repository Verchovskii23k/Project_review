import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { educationLevels } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const educationLevelsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(educationLevels)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(educationLevels).where(eq(educationLevels.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      abbreviation: z.string().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: educationLevels.id })
        .from(educationLevels)
        .where(eq(educationLevels.name, input.name))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Уровень образования с таким названием уже существует' });
      return ctx.db.insert(educationLevels).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      abbreviation: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.name) {
        const [existing] = await ctx.db
          .select({ id: educationLevels.id })
          .from(educationLevels)
          .where(and(eq(educationLevels.name, data.name), sql`${educationLevels.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Уровень образования с таким названием уже существует' });
      }
      if (data.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "educationLevels", id);
          const [result] = await tx
            .update(educationLevels)
            .set(data)
            .where(eq(educationLevels.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(educationLevels).set(data).where(eq(educationLevels.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(educationLevels, input.id, "educationLevels")),
});