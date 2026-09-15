import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { profiles, specialties, education, educationLevels, educationForms } from "@/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const profilesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: profiles.id,
        name: profiles.name,
        abbreviation: profiles.abbreviation,
        specialtyId: profiles.specialtyId,
        letterCode: profiles.letterCode,
        educationId: profiles.educationId,
        isActive: profiles.isActive,
        profileDisplay: sql<string>`CONCAT(${profiles.letterCode}, ' (', ${specialties.code}, ' - ', ${specialties.name}, ')')`.as('profile_display'),
        educationDisplay: sql<string>`${educationLevels.abbreviation} || ', ' || ${educationForms.abbreviation} || ' (' || ${education.durationMonths} || ' мес.)'`.as('education_display'),
      })
      .from(profiles)
      .innerJoin(specialties, eq(profiles.specialtyId, specialties.id))
      .leftJoin(education, eq(profiles.educationId, education.id))
      .leftJoin(educationLevels, eq(education.levelId, educationLevels.id))
      .leftJoin(educationForms, eq(education.formId, educationForms.id))
      .orderBy(asc(profiles.letterCode));
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: profiles.id,
          name: profiles.name,
          abbreviation: profiles.abbreviation,
          specialtyId: profiles.specialtyId,
          letterCode: profiles.letterCode,
          educationId: profiles.educationId,
          isActive: profiles.isActive,
          profileDisplay: sql<string>`CONCAT(${profiles.letterCode}, ' (', ${specialties.code}, ' - ', ${specialties.name}, ')')`.as('profile_display'),
          educationDisplay: sql<string>`${educationLevels.abbreviation} || ', ' || ${educationForms.abbreviation} || ' (' || ${education.durationMonths} || ' мес.)'`.as('education_display'),
        })
        .from(profiles)
        .innerJoin(specialties, eq(profiles.specialtyId, specialties.id))
        .leftJoin(education, eq(profiles.educationId, education.id))
        .leftJoin(educationLevels, eq(education.levelId, educationLevels.id))
        .leftJoin(educationForms, eq(education.formId, educationForms.id))
        .where(eq(profiles.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      abbreviation: z.string().min(1),
      specialtyId: z.coerce.number().int(),
      letterCode: z.string().min(1),
      educationId: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [duplicate] = await ctx.db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.letterCode, input.letterCode), eq(profiles.specialtyId, input.specialtyId)))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Профиль с таким буквенным кодом и специальностью уже существует' });
      const clean = { ...input, educationId: input.educationId ?? null };
      return ctx.db.insert(profiles).values(clean).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      abbreviation: z.string().min(1).optional(),
      specialtyId: z.coerce.number().int().optional(),
      letterCode: z.string().optional(),
      educationId: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.letterCode || data.specialtyId) {
        const conditions = [];
        if (data.letterCode) conditions.push(eq(profiles.letterCode, data.letterCode));
        if (data.specialtyId) conditions.push(eq(profiles.specialtyId, data.specialtyId));
        conditions.push(sql`${profiles.id} != ${id}`);
        const [duplicate] = await ctx.db
          .select({ id: profiles.id })
          .from(profiles)
          .where(and(...conditions))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Профиль с таким буквенным кодом и специальностью уже существует' });
      }
      if (data.isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "profiles", id);
          const [result] = await tx
            .update(profiles)
            .set(data)
            .where(eq(profiles.id, id))
            .returning();
          return result;
        });
      }
      return ctx.db.update(profiles).set(data).where(eq(profiles.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(profiles, input.id, "profiles")),
});