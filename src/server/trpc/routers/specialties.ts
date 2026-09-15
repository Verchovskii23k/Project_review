import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { specialties } from "@/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const specialtiesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: specialties.id,
        code: specialties.code,
        name: specialties.name,
        departmentId: specialties.departmentId,
        isActive: specialties.isActive,
        display: sql<string>`${specialties.code} || ' - ' || ${specialties.name}`.as('display'),
      })
      .from(specialties)
      .orderBy(asc(specialties.code));
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: specialties.id,
          code: specialties.code,
          name: specialties.name,
          departmentId: specialties.departmentId,
          isActive: specialties.isActive,
          display: sql<string>`${specialties.code} || ' - ' || ${specialties.name}`.as('display'),
        })
        .from(specialties)
        .where(eq(specialties.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      departmentId: z.coerce.number().int(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [duplicate] = await ctx.db
        .select({ id: specialties.id })
        .from(specialties)
        .where(eq(specialties.code, input.code))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Специальность с таким кодом уже существует' });
      return ctx.db.insert(specialties).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      code: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      departmentId: z.coerce.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, isActive, ...data } = input;
      if (data.code) {
        const [duplicate] = await ctx.db
          .select({ id: specialties.id })
          .from(specialties)
          .where(and(eq(specialties.code, data.code), sql`${specialties.id} != ${id}`))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Специальность с таким кодом уже существует' });
      }
      if (input.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "specialties", id);
          const [result] = await tx
            .update(specialties)
            .set({ ...data, isActive: false })
            .where(eq(specialties.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(specialties).set({ ...data, isActive }).where(eq(specialties.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(specialties, input.id, "specialities")),
});