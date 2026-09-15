import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import {
  lessonClassrooms, lessons, classrooms, buildings, departments,
  disciplines, lessonTypes, employeesDepartments, employees, units,
  scheduleDisplay
} from "@/db/schema";
import { db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { recalculateUsageMetrics } from "@/lib/usageMetrics";
import { TRPCError } from "@trpc/server";

async function syncScheduleDisplayForLesson(localDb: typeof db, lessonId: number) {
  const rows = await localDb
    .select({
      id: scheduleDisplay.id,
      lessonId: scheduleDisplay.lessonId,
      unitCode: scheduleDisplay.unitCode,
      disciplineAbbr: disciplines.abbreviation,
      lessonTypeName: lessonTypes.name,
      teacherSurname: employees.surname,
      teacherName: employees.name,
      teacherPatronymic: employees.patronymic,
      buildingNumber: buildings.number,
      roomNumber: classrooms.roomNumber,
      isActive: classrooms.isActive,
    })
    .from(scheduleDisplay)
    .innerJoin(lessons, eq(scheduleDisplay.lessonId, lessons.id))
    .innerJoin(disciplines, eq(lessons.disciplineId, disciplines.id))
    .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id))
    .leftJoin(employeesDepartments, eq(lessons.teacherId, employeesDepartments.id))
    .leftJoin(employees, eq(employeesDepartments.employeeId, employees.id))
    .leftJoin(lessonClassrooms, eq(scheduleDisplay.lessonId, lessonClassrooms.lessonId))
    .leftJoin(classrooms, eq(lessonClassrooms.classroomId, classrooms.id))
    .leftJoin(buildings, eq(classrooms.buildingId, buildings.id))
    .where(eq(scheduleDisplay.lessonId, lessonId));

  for (const row of rows) {
    const typeMap: Record<string, string> = {
      lecture: 'лек.',
      lab: 'лаб.',
      workshop: 'пр.',
      guidedStudy: 'кср.'
    };
    const typeAbbr = typeMap[row.lessonTypeName] || row.lessonTypeName;
    const disc = row.disciplineAbbr;
    const teacher = `${row.teacherSurname} ${row.teacherName?.[0] ?? ''}.${row.teacherPatronymic?.[0] ? row.teacherPatronymic[0] + '.' : ''}`;
    const room = row.buildingNumber ? `${row.buildingNumber}-${row.roomNumber}` : 'б/а';
    const text = `[${row.unitCode}] ${typeAbbr}${disc} – ${teacher}, ${room}`;

    await localDb
      .update(scheduleDisplay)
      .set({ displayText: text })
      .where(eq(scheduleDisplay.id, row.id));
  }
}

export const lessonClassroomsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: lessonClassrooms.id,
        lessonId: lessonClassrooms.lessonId,
        classroomId: lessonClassrooms.classroomId,
        isActive: lessonClassrooms.isActive,
        lessonDisplay: sql<string>`${units.code} || '-' || ${lessonTypes.abbreviation} || '-' || ${disciplines.abbreviation} || '-' || ${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'  `.as('lessonDisplay'),
        classroomDisplay: sql<string>` ${buildings.number} || '-' || ${classrooms.roomNumber} || '-' || COALESCE(${departments.abbreviation}, 'Общая') || '-' || ${classrooms.usageMetric} `.as('classroomDisplay'),
      })
      .from(lessonClassrooms)
      .innerJoin(lessons, eq(lessonClassrooms.lessonId, lessons.id))
      .innerJoin(units, eq(lessons.unitId, units.id))
      .innerJoin(disciplines, eq(lessons.disciplineId, disciplines.id))
      .leftJoin(employeesDepartments, eq(lessons.teacherId, employeesDepartments.id))
      .leftJoin(employees, eq(employeesDepartments.employeeId, employees.id))
      .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id))
      .innerJoin(classrooms, eq(lessonClassrooms.classroomId, classrooms.id))
      .leftJoin(buildings, eq(classrooms.buildingId, buildings.id))
      .leftJoin(departments, eq(classrooms.departmentId, departments.id));
  }),

  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: lessonClassrooms.id,
          lessonId: lessonClassrooms.lessonId,
          classroomId: lessonClassrooms.classroomId,
          lessonDisplay: sql<string>`${units.code} || '-' || ${lessonTypes.abbreviation} || '-' || ${disciplines.abbreviation} || '-' || ${employees.surname} || ' ' || left(${employees.name},1) || '.' || left(${employees.patronymic},1) || '.'  `.as('lessonDisplay'),
          classroomDisplay: sql<string>` ${buildings.number} || '-' || ${classrooms.roomNumber} || '-' || COALESCE(${departments.abbreviation}, 'Общая') || '-' || ${classrooms.usageMetric} `.as('classroomDisplay'),
        })
        .from(lessonClassrooms)
        .innerJoin(lessons, eq(lessonClassrooms.lessonId, lessons.id))
        .innerJoin(units, eq(lessons.unitId, units.id))
        .innerJoin(disciplines, eq(lessons.disciplineId, disciplines.id))
        .leftJoin(employeesDepartments, eq(lessons.teacherId, employeesDepartments.id))
        .leftJoin(employees, eq(employeesDepartments.employeeId, employees.id))
        .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id))
        .innerJoin(classrooms, eq(lessonClassrooms.classroomId, classrooms.id))
        .leftJoin(buildings, eq(classrooms.buildingId, buildings.id))
        .leftJoin(departments, eq(classrooms.departmentId, departments.id))
        .where(eq(lessonClassrooms.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  create: adminProcedure
    .input(z.object({ lessonId: z.coerce.number().int(), classroomId: z.coerce.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Проверка уникальности
      const existing = await ctx.db.query.lessonClassrooms.findFirst({
        where: (lc, { and, eq }) => and(
          eq(lc.lessonId, input.lessonId),
          eq(lc.classroomId, input.classroomId)
        ),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Эта аудитория уже назначена для данного занятия",
        });
      }

      await ctx.db.insert(lessonClassrooms).values(input).returning();
      await syncScheduleDisplayForLesson(ctx.db, input.lessonId);
      await recalculateUsageMetrics();
      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), lessonId: z.coerce.number().int().optional(), classroomId: z.coerce.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Если изменяется lessonId или classroomId – проверяем уникальность
      if (data.lessonId !== undefined || data.classroomId !== undefined) {
        const current = await ctx.db
          .select({
            lessonId: lessonClassrooms.lessonId,
            classroomId: lessonClassrooms.classroomId,
          })
          .from(lessonClassrooms)
          .where(eq(lessonClassrooms.id, id))
          .limit(1);

        if (current.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });
        }

        const newLessonId = data.lessonId ?? current[0].lessonId;
        const newClassroomId = data.classroomId ?? current[0].classroomId;

        const conflict = await ctx.db.query.lessonClassrooms.findFirst({
          where: (lc, { and, eq, ne }) => and(
            eq(lc.lessonId, newLessonId),
            eq(lc.classroomId, newClassroomId),
            ne(lc.id, id)
          ),
        });
        if (conflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Другое назначение с такими же занятием и аудиторией уже существует",
          });
        }
      }

      await ctx.db.update(lessonClassrooms).set(data).where(eq(lessonClassrooms.id, id)).returning();
      let lessonId = data.lessonId;
      if (!lessonId) {
        const [existing] = await ctx.db.select({ lessonId: lessonClassrooms.lessonId }).from(lessonClassrooms).where(eq(lessonClassrooms.id, id)).limit(1);
        if (existing) lessonId = existing.lessonId;
      }
      if (lessonId) {
        await syncScheduleDisplayForLesson(ctx.db, lessonId);
        await recalculateUsageMetrics()
      }
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db.select({ lessonId: lessonClassrooms.lessonId }).from(lessonClassrooms).where(eq(lessonClassrooms.id, input.id)).limit(1);
      if (existing) {
        await ctx.db.delete(lessonClassrooms).where(eq(lessonClassrooms.id, input.id));
        await syncScheduleDisplayForLesson(ctx.db, existing.lessonId);
        await recalculateUsageMetrics();
      }
      return { success: true };
    }),
});