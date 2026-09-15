import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { students, users, studyGroups, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Context } from "../context";

async function validateGroupProfile(ctx: Context, profileId: number, studyGroupId: number) {
  const [profile] = await ctx.db.select({ letterCode: profiles.letterCode })
    .from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Профиль не найден' });

  const [group] = await ctx.db.select({ code: studyGroups.code })
    .from(studyGroups).where(eq(studyGroups.id, studyGroupId)).limit(1);
  if (!group) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Группа не найдена' });

  const groupLetter = group.code.length >= 3 ? group.code[2] : '';
  if (groupLetter !== profile.letterCode) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Группа с кодом «${group.code}» не соответствует профилю с буквенным кодом «${profile.letterCode}». Назначьте другой профиль студенту или выберите валидную группу.`
    });
  }
}

export const studentsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: students.id,
        surname: students.surname,
        name: students.name,
        patronymic: students.patronymic,
        admissionYear: students.admissionYear,
        profileId: students.profileId,
        studyGroupId: students.studyGroupId,
        course: students.course,
        isActive: students.isActive, 
      })
      .from(students)
      .leftJoin(users, eq(students.userId, users.id));
  }),
  
  create: adminProcedure
    .input(z.object({
      surname: z.string().min(1),
      name: z.string().min(1),
      patronymic: z.string().min(1).optional(),
      admissionYear: z.coerce.number().int(),
      profileId: z.coerce.number().int(),
      studyGroupId: z.coerce.number().int().nullable().optional(),
      course: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // Проверка соответствия группы профилю
      if (input.studyGroupId != null) {
        await validateGroupProfile(ctx, input.profileId, input.studyGroupId);
      }
      return ctx.db.insert(students).values(input).returning();
    }),
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      surname: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      patronymic: z.string().nullable().optional(),
      admissionYear: z.coerce.number().int().optional(),
      profileId: z.coerce.number().int().optional(),
      studyGroupId: z.coerce.number().int().nullable().optional(),
      course: z.coerce.number().int().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      // Если передана группа – проверяем соответствие профилю
      if (data.studyGroupId != null) {
        // Определяем profileId: из переданных данных или из базы
        let profileId = data.profileId;
        if (profileId == null) {
          const [student] = await ctx.db.select({ profileId: students.profileId })
            .from(students).where(eq(students.id, id)).limit(1);
          if (!student) throw new TRPCError({ code: 'NOT_FOUND', message: 'Студент не найден' });
          profileId = student.profileId;
        }
        if (profileId != null) {
          await validateGroupProfile(ctx, profileId, data.studyGroupId);
        }
      }
      return ctx.db.update(students).set(data).where(eq(students.id, id)).returning();
    }),
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: students.id,
          surname: students.surname,
          name: students.name,
          patronymic: students.patronymic,
          admissionYear: students.admissionYear,
          profileId: students.profileId,
          studyGroupId: students.studyGroupId,
          course: students.course,    
          isActive: students.isActive,
        })
        .from(students)
        .leftJoin(users, eq(students.userId, users.id))
        .where(eq(students.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [student] = await ctx.db
        .select({ userId: students.userId })
        .from(students)
        .where(eq(students.id, input.id))
        .limit(1);
      if (!student) throw new TRPCError({ code: 'NOT_FOUND', message: 'Студент не найден' });

      if (student.userId && ctx.user?.id === student.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Нельзя удалить самого себя' });
      }

      // 1. Отвязываем студента от учётной записи
      if (student.userId) {
        await ctx.db
          .update(students)
          .set({ userId: null })
          .where(eq(students.id, input.id));

        // 2. Удаляем пользователя
        await ctx.db
          .delete(users)
          .where(eq(users.id, student.userId));
      }

      // 3. Удаляем самого студента
      await ctx.db.delete(students).where(eq(students.id, input.id));
      return { success: true };
    }),
});