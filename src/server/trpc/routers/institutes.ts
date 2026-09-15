import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { institutes, departments, studyGroups } from "@/db/schema";
import { eq, sql, and, or } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";

export const institutesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(institutes);
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(institutes)
        .where(eq(institutes.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
  .input(
    z.object({
      universityCode: z.coerce.number().int().positive(),
      name: z.string().min(1),
      directorId: z.number().int().nullable().optional(),
      isActive: z.boolean().default(true),
    })
  )
  .mutation(async ({ ctx, input }) => {
    if (input.directorId != null) {
      const [isHead] = await ctx.db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.headId, input.directorId))
        .limit(1);
      if (isHead)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Этот сотрудник уже является заведующим кафедрой",
        });

      const [isCurator] = await ctx.db
        .select({ id: studyGroups.id })
        .from(studyGroups)
        .where(eq(studyGroups.curatorId, input.directorId))
        .limit(1);
      if (isCurator)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Этот сотрудник уже является куратором",
        });
    }

    const [existing] = await ctx.db
      .select({ id: institutes.id })
      .from(institutes)
      .where(
        or(
          eq(institutes.universityCode, input.universityCode),
          eq(institutes.name, input.name)
        )
      )
      .limit(1);

    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Институт с таким кодом или названием уже существует",
      });
    }

    return ctx.db.insert(institutes).values(input).returning();
  }),
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        universityCode: z.coerce.number().int().positive().optional(),
        name: z.string().min(1).optional(),
        directorId: z.number().int().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, directorId, isActive, ...data } = input;

      // Проверки занятости сотрудника
      if (directorId) {
        const [isHead] = await ctx.db
          .select({ id: departments.id })
          .from(departments)
          .where(eq(departments.headId, directorId))
          .limit(1);
        if (isHead)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Этот сотрудник уже является заведующим кафедрой",
          });

        const [isCurator] = await ctx.db
          .select({ id: studyGroups.id })
          .from(studyGroups)
          .where(eq(studyGroups.curatorId, directorId))
          .limit(1);
        if (isCurator)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Этот сотрудник уже является куратором",
          });

        const [isDirector] = await ctx.db
          .select({ id: institutes.id })
          .from(institutes)
          .where(
            and(
              eq(institutes.directorId, directorId),
              sql`${institutes.id} != ${id}`
            )
          )
          .limit(1);
        if (isDirector)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Этот сотрудник уже является директором другого института",
          });
      }

      // Проверка уникальности кода и названия при обновлении
      if (data.universityCode || data.name) {
        const conditions = [];
        if (data.universityCode) {
          conditions.push(eq(institutes.universityCode, data.universityCode));
        }
        if (data.name) {
          conditions.push(eq(institutes.name, data.name));
        }
        conditions.push(sql`${institutes.id} != ${id}`);

        const [duplicate] = await ctx.db
          .select({ id: institutes.id })
          .from(institutes)
          .where(and(...conditions))
          .limit(1);

        if (duplicate) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Институт с таким кодом или названием уже существует",
          });
        }
      }

      // Каскадное отключение кафедр
      if (isActive === false) {
        return ctx.db.transaction(async (tx) => {
          await cascadeDeactivate(tx, "institutes", id);
          const [result] = await tx
            .update(institutes)
            .set({ ...data, directorId, isActive: false })
            .where(eq(institutes.id, id))
            .returning();
          return result;
        });
      }

      return ctx.db
        .update(institutes)
        .set({ ...data, directorId, isActive })
        .where(eq(institutes.id, id))
        .returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(institutes, input.id, "institutes")),
});