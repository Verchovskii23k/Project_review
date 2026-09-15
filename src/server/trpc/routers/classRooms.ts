import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import {
  classrooms, buildings, departments,
  lessons, units, unitRoots, studyGroups, unitTypes, disciplines,
} from "@/db/schema";
import { eq, sql, and, gte, isNull, or, SQL } from "drizzle-orm";
import { safeDelete } from "@/lib/safeDelete";
import { recalculateUsageMetrics } from "@/lib/usageMetrics";
import { TRPCError } from "@trpc/server";

export const classroomsRouter = router({
  list: adminProcedure
    .input(z.object({ lessonId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const baseQuery = ctx.db
        .select({
          id: classrooms.id,
          buildingId: classrooms.buildingId,
          roomNumber: classrooms.roomNumber,
          capacity: classrooms.capacity,
          departmentId: classrooms.departmentId,
          priorityLecture: classrooms.priorityLecture,
          priorityWorkshop: classrooms.priorityWorkshop,
          priorityGuidedStudy: classrooms.priorityGuidedStudy,
          priorityLab: classrooms.priorityLab,
          usageMetric: classrooms.usageMetric,
          isActive: classrooms.isActive,
          display: sql<string>`${buildings.number} || '-' || ${classrooms.roomNumber} || '-' || COALESCE(${departments.abbreviation}, 'Общая') || '-' || ${classrooms.usageMetric}`.as('display'),
        })
        .from(classrooms)
        .leftJoin(buildings, eq(classrooms.buildingId, buildings.id))
        .leftJoin(departments, eq(classrooms.departmentId, departments.id));

      if (input?.lessonId) {
        const [lesson] = await ctx.db
          .select({ unitId: lessons.unitId, disciplineId: lessons.disciplineId })
          .from(lessons)
          .where(eq(lessons.id, input.lessonId))
          .limit(1);
        if (!lesson) return [];

        let unitSize = 0;
        const [unit] = await ctx.db
          .select({ id: units.id, code: units.code, unitTypeId: units.unitTypeId })
          .from(units)
          .where(eq(units.id, lesson.unitId))
          .limit(1);
        if (unit) {
          const [unitType] = await ctx.db
            .select({ name: unitTypes.name, maxSize: unitTypes.maxSize })
            .from(unitTypes)
            .where(eq(unitTypes.id, unit.unitTypeId))
            .limit(1);
          if (unitType?.name === "ПОДГРУППА") {
            unitSize = unitType.maxSize ?? 16;
          } else {
            const roots = await ctx.db
              .select({ studyGroupId: unitRoots.studyGroupId })
              .from(unitRoots)
              .where(eq(unitRoots.unitCode, unit.code));
            if (roots.length > 0) {
              const groupIds = roots.map(r => r.studyGroupId);
              const groupsData = await ctx.db
                .select({ studentCount: studyGroups.studentCount })
                .from(studyGroups)
                .where(sql`${studyGroups.id} IN ${groupIds}`);
              unitSize = groupsData.reduce((sum, g) => sum + (g.studentCount ?? 0), 0);
            } else {
              unitSize = unitType?.maxSize ?? 0;
            }
          }
        }

        const [disc] = await ctx.db
          .select({ departmentId: disciplines.departmentId })
          .from(disciplines)
          .where(eq(disciplines.id, lesson.disciplineId!))
          .limit(1);
        const deptId = disc?.departmentId ?? null;

        const conditions: SQL<unknown>[] = [ gte(classrooms.capacity, unitSize) ];
        if (deptId !== null) {
          conditions.push(or(eq(classrooms.departmentId, deptId), isNull(classrooms.departmentId)) as SQL<unknown>);
        } else {
          conditions.push(isNull(classrooms.departmentId) as SQL<unknown>);
        }
        return baseQuery.where(and(...conditions));
      }

      return baseQuery;
    }),

  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: classrooms.id,
          buildingId: classrooms.buildingId,
          roomNumber: classrooms.roomNumber,
          capacity: classrooms.capacity,
          departmentId: classrooms.departmentId,
          priorityLecture: classrooms.priorityLecture,
          priorityWorkshop: classrooms.priorityWorkshop,
          priorityGuidedStudy: classrooms.priorityGuidedStudy,
          priorityLab: classrooms.priorityLab,
          usageMetric: classrooms.usageMetric,
          isActive: classrooms.isActive,
          display: sql<string>`${buildings.number} || '-' || ${classrooms.roomNumber} || '-' || COALESCE(${departments.abbreviation}, 'Общая') || '-' || ${classrooms.usageMetric}`.as('display'),
        })
        .from(classrooms)
        .leftJoin(buildings, eq(classrooms.buildingId, buildings.id))
        .leftJoin(departments, eq(classrooms.departmentId, departments.id))
        .where(eq(classrooms.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  create: adminProcedure
    .input(z.object({
      buildingId: z.coerce.number().int().min(1),
      roomNumber: z.string().min(1),
      capacity: z.coerce.number().int().min(1, "Вместимость должна быть больше нуля"),
      departmentId: z.coerce.number().int().nullable().optional(),
      priorityLecture: z.number().int().min(1).max(3).default(3),
      priorityWorkshop: z.number().int().min(1).max(3).default(3),
      priorityGuidedStudy: z.number().int().min(1).max(3).default(3),
      priorityLab: z.number().int().min(1).max(3),
      usageMetric: z.coerce.number().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [duplicate] = await ctx.db
        .select({ id: classrooms.id })
        .from(classrooms)
        .where(and(eq(classrooms.buildingId, input.buildingId), eq(classrooms.roomNumber, input.roomNumber)))
        .limit(1);
        if (input.capacity <= 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Вместимость должна быть больше нуля',
          });
        }
      if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Аудитория с таким номером в этом корпусе уже существует' });
      const result = await ctx.db.insert(classrooms).values(input).returning();
      await recalculateUsageMetrics();
      return result;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      buildingId: z.number().int().min(1),
      roomNumber: z.string().min(1),
      capacity: z.coerce.number().int().min(1, "Вместимость должна быть больше нуля"),
      departmentId: z.number().int().nullable().optional(),
      priorityLecture: z.number().int().min(1).max(3),
      priorityWorkshop: z.number().int().min(1).max(3),
      priorityGuidedStudy: z.number().int().min(1).max(3),
      priorityLab: z.number().int().min(1).max(3),
      usageMetric: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.roomNumber || data.buildingId) {
        const current = await ctx.db
          .select({
            buildingId: classrooms.buildingId,
            roomNumber: classrooms.roomNumber,
          })
          .from(classrooms)
          .where(eq(classrooms.id, id))
          .limit(1);
        if (input.capacity <= 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Вместимость должна быть больше нуля',
          });
        }
        if (current.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Аудитория не найдена' });
        }

        const newBuildingId = data.buildingId ?? current[0].buildingId;
        const newRoomNumber = data.roomNumber ?? current[0].roomNumber;

        const [duplicate] = await ctx.db
          .select({ id: classrooms.id })
          .from(classrooms)
          .where(
            and(
              eq(classrooms.buildingId, newBuildingId),
              eq(classrooms.roomNumber, newRoomNumber),
              sql`${classrooms.id} != ${id}`
            )
          )
          .limit(1);

        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Аудитория с таким номером в этом корпусе уже существует',
          });
        }
      }
      return ctx.db.update(classrooms).set(data).where(eq(classrooms.id, id)).returning();
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await safeDelete(classrooms, input.id, "classrooms");
      await recalculateUsageMetrics();
      return { success: true };
    }),
});