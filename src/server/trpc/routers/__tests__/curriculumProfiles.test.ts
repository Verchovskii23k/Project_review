import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { 
  clearAllTestData, 
  createTestInstitute, 
  createTestDepartment, 
  createTestDiscipline,
  createTestEducation,
  createTestSpecialty,
  createTestProfile,
} from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let curriculumId: number;
let profileId: number;


let deptId: number; 

beforeAll(async () => {
  await clearAllTestData();

  const instId = await createTestInstitute();
  deptId = await createTestDepartment(instId);
  const disciplineId = await createTestDiscipline(deptId);
  const eduId = await createTestEducation();
  const specId = await createTestSpecialty(deptId);
  profileId = await createTestProfile(specId, eduId);


  caller = await createTestCaller({ id: 1, role: 'admin' });
  const [curr] = await caller.curriculum.create({
    course: 1,
    semester: 1,
    disciplineId,
    hoursLecture: 10,
    hoursLab: 5,
  });
  curriculumId = curr.id;
});

describe('curriculumProfiles CRUD', () => {
  let cpId: number;

  it('создаёт связь', async () => {
    const [row] = await caller.curriculumProfiles.create({
      curriculumId,
      profileId,
    });
    expect(row).toHaveProperty('id');
    cpId = row.id;
  });

  it('отклоняет дубликат связи', async () => {
    await expect(
      caller.curriculumProfiles.create({ curriculumId, profileId })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.curriculumProfiles.create({ curriculumId, profileId });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Связь учебного плана с этим профилем уже существует');
      }
    }
  });

  it('отклоняет отсутствие обязательных полей', async () => {
    await expect(
      (caller.curriculumProfiles.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ curriculumId })
    ).rejects.toThrow();
    await expect(
      (caller.curriculumProfiles.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ profileId })
    ).rejects.toThrow();
  });

  it('список содержит созданную связь', async () => {
    const list = await caller.curriculumProfiles.list();
    expect(list.some(r => r.id === cpId)).toBe(true);
  });

  it('получает существующую связь', async () => {
    const row = await caller.curriculumProfiles.get({ id: cpId });
    expect(row).toMatchObject({ curriculumId, profileId });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.curriculumProfiles.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет isActive', async () => {
    await caller.curriculumProfiles.update({ id: cpId, isActive: false });
    const row = await caller.curriculumProfiles.get({ id: cpId });
    expect(row?.isActive).toBe(false);
  });

  it('отклоняет обновление на дублирующую пару', async () => {
    // Создаём второй curriculum
    const disc2Id = await createTestDiscipline(deptId);
    const [curr2] = await caller.curriculum.create({
      course: 2,
      semester: 1,
      disciplineId: disc2Id,
      hoursLecture: 20,
    });
    const [link2] = await caller.curriculumProfiles.create({
      curriculumId: curr2.id,
      profileId,
    });

    // Пытаемся обновить link2 на комбинацию первого curriculum + profile (которая уже есть)
    await expect(
      caller.curriculumProfiles.update({ id: link2.id, curriculumId, profileId })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.curriculumProfiles.update({ id: link2.id, curriculumId, profileId });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.curriculumProfiles.update({ id: 9999, isActive: false })
    ).resolves.toBeDefined();
  });

  it('удаляет существующую связь', async () => {
    await caller.curriculumProfiles.delete({ id: cpId });
    const row = await caller.curriculumProfiles.get({ id: cpId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.curriculumProfiles.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});