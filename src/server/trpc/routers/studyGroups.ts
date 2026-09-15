import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { studyGroups, profiles, specialties, employees, employeesDepartments, institutes, departments } from "@/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { TRPCError } from "@trpc/server";

export const studyGroupsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: studyGroups.id,
        code: studyGroups.code,
        profileId: studyGroups.profileId,
        course: studyGroups.course,
        studentCount: studyGroups.studentCount,
        curatorId: studyGroups.curatorId,
        isActive: studyGroups.isActive,
        display: sql<string>`${studyGroups.code} || ' (' || ${profiles.letterCode} || '-' || ${profiles.name} || ')'`.as('display'),
        curatorDisplay: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('curator_display'),
      })
      .from(studyGroups)
      .innerJoin(profiles, eq(studyGroups.profileId, profiles.id))
      .leftJoin(employees, eq(studyGroups.curatorId, employees.id))
      .orderBy(asc(studyGroups.code));
  }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: studyGroups.id,
          code: studyGroups.code,
          profileId: studyGroups.profileId,
          course: studyGroups.course,
          studentCount: studyGroups.studentCount,
          curatorId: studyGroups.curatorId,
          display: sql<string>`${studyGroups.code} || ' (' || ${profiles.letterCode} || '-' || ${profiles.name} || ')'`.as('display'),
          curatorDisplay: sql<string>`${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'`.as('curator_display'),
        })
        .from(studyGroups)
        .innerJoin(profiles, eq(studyGroups.profileId, profiles.id))
        .leftJoin(employees, eq(studyGroups.curatorId, employees.id))
        .where(eq(studyGroups.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  create: adminProcedure
    .input(z.object({
      code: z.string().min(1),
      profileId: z.coerce.number().int(),
      course: z.coerce.number().int(),
      studentCount: z.coerce.number().int(),
      curatorId: z.coerce.number().int().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Проверки на занятость куратора
      if (input.curatorId) {
        const [isDirector] = await ctx.db
          .select({ id: institutes.id })
          .from(institutes)
          .where(eq(institutes.directorId, input.curatorId))
          .limit(1);
        if (isDirector) throw new TRPCError({ code: 'CONFLICT', message: 'Этот сотрудник уже является директором института' });

        const [isHead] = await ctx.db
          .select({ id: departments.id })
          .from(departments)
          .where(eq(departments.headId, input.curatorId))
          .limit(1);
        if (isHead) throw new TRPCError({ code: 'CONFLICT', message: 'Этот сотрудник уже является заведующим кафедрой' });

        const [isCurator] = await ctx.db
          .select({ id: studyGroups.id })
          .from(studyGroups)
          .where(eq(studyGroups.curatorId, input.curatorId))
          .limit(1);
        if (isCurator) throw new TRPCError({ code: 'CONFLICT', message: 'Этот сотрудник уже является куратором другой группы' });

        // Проверка принадлежности к кафедре профиля
        const [profile] = await ctx.db.select({ specialtyId: profiles.specialtyId })
          .from(profiles).where(eq(profiles.id, input.profileId)).limit(1);
        if (profile) {
          const [specialty] = await ctx.db.select({ departmentId: specialties.departmentId })
            .from(specialties).where(eq(specialties.id, profile.specialtyId)).limit(1);
          if (specialty) {
            const link = await ctx.db.select({ id: employeesDepartments.id })
              .from(employeesDepartments)
              .where(and(
                eq(employeesDepartments.employeeId, input.curatorId),
                eq(employeesDepartments.departmentId, specialty.departmentId)
              ))
              .limit(1);
            if (link.length === 0) {
              throw new TRPCError({ code: 'CONFLICT', message: 'Выбранный куратор не работает на кафедре этого профиля' });
            }
          }
        }
      }

      // Проверка уникальности кода группы
      const [duplicate] = await ctx.db
        .select({ id: studyGroups.id })
        .from(studyGroups)
        .where(eq(studyGroups.code, input.code))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Группа с таким кодом уже существует' });

      return ctx.db.insert(studyGroups).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      code: z.string().min(1),
      profileId: z.coerce.number().int(),
      course: z.coerce.number().int(),
      studentCount: z.coerce.number().int(),
      curatorId: z.coerce.number().int().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, curatorId, ...data } = input;

      if (curatorId) {
        const [isDirector] = await ctx.db.select({ id: institutes.id }).from(institutes).where(eq(institutes.directorId, curatorId)).limit(1);
        if (isDirector) throw new TRPCError({ code: 'CONFLICT', message: 'Этот сотрудник уже является директором института' });

        const [isHead] = await ctx.db.select({ id: departments.id }).from(departments).where(eq(departments.headId, curatorId)).limit(1);
        if (isHead) throw new TRPCError({ code: 'CONFLICT', message: 'Этот сотрудник уже является заведующим кафедрой' });

        const [isCurator] = await ctx.db
          .select({ id: studyGroups.id })
          .from(studyGroups)
          .where(and(eq(studyGroups.curatorId, curatorId), sql`${studyGroups.id} != ${id}`))
          .limit(1);
        if (isCurator) throw new TRPCError({ code: 'CONFLICT', message: 'Этот сотрудник уже является куратором другой группы' });

        const currentProfileId = data.profileId ?? (await ctx.db.select({ profileId: studyGroups.profileId }).from(studyGroups).where(eq(studyGroups.id, id)).limit(1))[0]?.profileId;
        if (currentProfileId) {
          const [profile] = await ctx.db.select({ specialtyId: profiles.specialtyId })
            .from(profiles).where(eq(profiles.id, currentProfileId)).limit(1);
          if (profile) {
            const [specialty] = await ctx.db.select({ departmentId: specialties.departmentId })
              .from(specialties).where(eq(specialties.id, profile.specialtyId)).limit(1);
            if (specialty) {
              const link = await ctx.db.select({ id: employeesDepartments.id })
                .from(employeesDepartments)
                .where(and(
                  eq(employeesDepartments.employeeId, curatorId),
                  eq(employeesDepartments.departmentId, specialty.departmentId)
                ))
                .limit(1);
              if (link.length === 0) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Выбранный куратор не работает на кафедре этого профиля' });
              }
            }
          }
        }
      }

      if (data.code) {
        const [duplicate] = await ctx.db
          .select({ id: studyGroups.id })
          .from(studyGroups)
          .where(and(eq(studyGroups.code, data.code), sql`${studyGroups.id} != ${id}`))
          .limit(1);
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Группа с таким кодом уже существует' });
      }

      return ctx.db.update(studyGroups).set({ ...data, curatorId }).where(eq(studyGroups.id, id)).returning();
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => safeDelete(studyGroups, input.id, "studyGroups")),
});