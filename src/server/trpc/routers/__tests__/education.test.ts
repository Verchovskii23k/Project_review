import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let levelId: number;
let formId: number;
let level2Id: number;
let form2Id: number;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });

  // Создаём два уровня и две формы для проверки дубликатов и конфликтов
  const [lvl1] = await caller.educationLevels.create({ name: 'Бакалавриат' });
  levelId = lvl1.id;
  const [lvl2] = await caller.educationLevels.create({ name: 'Магистратура' });
  level2Id = lvl2.id;

  const [frm1] = await caller.educationForms.create({ name: 'Очная' });
  formId = frm1.id;
  const [frm2] = await caller.educationForms.create({ name: 'Заочная' });
  form2Id = frm2.id;
});

describe('education CRUD', () => {
  let eduId: number;
  let edu2Id: number;

  it('создаёт запись об образовании', async () => {
    const [row] = await caller.education.create({
      levelId,
      formId,
      durationMonths: 48,
    });
    expect(row).toHaveProperty('id');
    eduId = row.id;
  });

  it('отклоняет дублирование комбинации (уровень + форма)', async () => {
    await expect(
      caller.education.create({ levelId, formId, durationMonths: 36 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.education.create({ levelId, formId, durationMonths: 36 });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Такая комбинация уровня и формы уже существует');
      }
    }
  });

  it('отклоняет отсутствие обязательных полей', async () => {
    await expect(
      (caller.education.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ levelId })
    ).rejects.toThrow();
    await expect(
      (caller.education.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ formId })
    ).rejects.toThrow();
  });

  it('список содержит созданную запись', async () => {
    const list = await caller.education.list();
    expect(list.some(e => e.id === eduId)).toBe(true);
    // Проверим наличие display (формируется через JOIN)
    const entry = list.find(e => e.id === eduId);
    expect(entry?.display).toBeDefined();
  });

  it('получает существующую запись', async () => {
    const row = await caller.education.get({ id: eduId });
    expect(row).toMatchObject({
      levelId,
      formId,
      durationMonths: 48,
    });
    expect(row?.display).toBeDefined();
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.education.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет durationMonths', async () => {
    await caller.education.update({ id: eduId, durationMonths: 24 });
    const row = await caller.education.get({ id: eduId });
    expect(row?.durationMonths).toBe(24);
  });

  it('отклоняет обновление на дублирующую комбинацию', async () => {
    // Создаём вторую запись с другой парой
    const [row2] = await caller.education.create({
      levelId: level2Id,
      formId: form2Id,
      durationMonths: 60,
    });
    edu2Id = row2.id;

    // Пытаемся обновить вторую запись на комбинацию первой (levelId, formId)
    await expect(
      caller.education.update({ id: edu2Id, levelId, formId })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.education.update({ id: edu2Id, levelId, formId });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.education.update({ id: 9999, durationMonths: 10 })
    ).resolves.toBeDefined();
  });

  it('удаляет существующую запись', async () => {
    await caller.education.delete({ id: edu2Id });
    const row = await caller.education.get({ id: edu2Id });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.education.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});