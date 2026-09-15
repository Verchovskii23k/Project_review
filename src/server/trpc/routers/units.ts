import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { units, unitTypes } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
export const unitsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: units.id,
        code: units.code,
        unitTypeId: units.unitTypeId,
        isActive: units.isActive,
        display: sql<string>`${units.code} || ' (' || ${unitTypes.name} || ')'`.as('display'),
      })
      .from(units)
      .innerJoin(unitTypes, eq(units.unitTypeId, unitTypes.id))
      .orderBy(asc(units.code));
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: units.id,
          code: units.code,
          unitTypeId: units.unitTypeId,
          display: sql<string>`${units.code} || ' (' || ${unitTypes.name} || ')'`.as('display'),
        })
        .from(units)
        .innerJoin(unitTypes, eq(units.unitTypeId, unitTypes.id))
        .where(eq(units.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({ code: z.string().min(1), unitTypeId: z.coerce.number().int() }))
    .mutation(async ({ ctx, input }) => ctx.db.insert(units).values(input).returning()),
  update: adminProcedure
    .input(z.object({ id: z.number(), code: z.string().min(1).optional(), unitTypeId: z.coerce.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.update(units).set(data).where(eq(units.id, id)).returning();
    }),
delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(units, input.id, "units")),
});