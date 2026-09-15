import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { unitTypes } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";

export const unitTypesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(unitTypes)),
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      maxSize: z.coerce.number().int().positive().min(1),
      priorityLecture: z.coerce.number().int(),
      priorityWorkshop: z.coerce.number().int(),
      priorityGuidedStudy: z.coerce.number().int(),
      priorityLab: z.coerce.number().int(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: unitTypes.id })
        .from(unitTypes)
        .where(eq(unitTypes.name, input.name))
        .limit(1);
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Тип юнита с таким названием уже существует' });
      const data = { ...input };
      Object.keys(data).forEach(k => {
        if (data[k as keyof typeof data] === undefined) delete data[k as keyof typeof data];
      });
      return ctx.db.insert(unitTypes).values(data).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1),
      maxSize: z.coerce.number().int().positive().min(1),
      priorityLecture: z.coerce.number().int(),
      priorityWorkshop: z.coerce.number().int(),
      priorityGuidedStudy: z.coerce.number().int(),
      priorityLab: z.coerce.number().int(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.name) {
        const [existing] = await ctx.db
          .select({ id: unitTypes.id })
          .from(unitTypes)
          .where(and(eq(unitTypes.name, data.name), sql`${unitTypes.id} != ${id}`))
          .limit(1);
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Тип юнита с таким названием уже существует' });
      }
      return ctx.db.update(unitTypes).set(data).where(eq(unitTypes.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(unitTypes, input.id, "unitTypes")),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(unitTypes).where(eq(unitTypes.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  getByName: adminProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(unitTypes).where(eq(unitTypes.name, input.name)).limit(1);
      return rows[0] ?? null;
    }),
});