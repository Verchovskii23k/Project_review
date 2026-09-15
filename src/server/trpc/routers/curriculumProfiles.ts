import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { curriculumProfiles } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";

export const curriculumProfilesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => ctx.db.select().from(curriculumProfiles)),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(curriculumProfiles).where(eq(curriculumProfiles.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      curriculumId: z.coerce.number().int(),
      profileId: z.coerce.number().int(),
      isActive: z.boolean().default(true)
    }))
    .mutation(async ({ ctx, input }) => {
      const [duplicate] = await ctx.db
        .select({ id: curriculumProfiles.id })
        .from(curriculumProfiles)
        .where(and(eq(curriculumProfiles.curriculumId, input.curriculumId), eq(curriculumProfiles.profileId, input.profileId)))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Связь учебного плана с этим профилем уже существует' });
      return ctx.db.insert(curriculumProfiles).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      curriculumId: z.coerce.number().int().optional(),
      profileId: z.coerce.number().int().optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.curriculumId && data.profileId) {
        const [duplicate] = await ctx.db
          .select({ id: curriculumProfiles.id })
          .from(curriculumProfiles)
          .where(and(
            eq(curriculumProfiles.curriculumId, data.curriculumId),
            eq(curriculumProfiles.profileId, data.profileId),
            sql`${curriculumProfiles.id} != ${id}`
          ))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Связь учебного плана с этим профилем уже существует' });
      }
      return ctx.db.update(curriculumProfiles).set(data).where(eq(curriculumProfiles.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(curriculumProfiles, input.id, "curriculumProfiles")),
});