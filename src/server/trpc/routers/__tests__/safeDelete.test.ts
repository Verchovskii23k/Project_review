import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { institutes, buildings, departments, classrooms } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { clearAllTestData } from '@/test/helpers';
import { seedTestData } from '@/test/fixtures/fixtures';
import { safeDelete } from '@/lib/safeDelete';

beforeEach(async () => {
  await clearAllTestData();
  await seedTestData();
});

describe('safeDelete', () => {
  it('успешно удаляет запись без зависимостей', async () => {
    const [inst] = await db.insert(institutes).values({
      name: 'Институт для удаления',
      universityCode: 12345,
    }).returning();

    const result = await safeDelete(institutes, inst.id, 'institutes');
    expect(result.success).toBe(true);

    const [deleted] = await db.select().from(institutes).where(eq(institutes.id, inst.id));
    expect(deleted).toBeUndefined();
  });

  it('выбрасывает CONFLICT с именами дочерних таблиц', async () => {
    const [inst] = await db.insert(institutes).values({
      name: 'Институт с кафедрой',
      universityCode: 54321,
    }).returning();

    await db.insert(departments).values({
      name: 'Кафедра',
      abbreviation: 'КФ',
      instituteId: inst.id,
      departmentCode: 999,
    });

    await expect(safeDelete(institutes, inst.id, 'institutes'))
      .rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('Невозможно удалить'),
      });
  });

  it('без tableNameKey выбрасывает общую ошибку при нарушении FK', async () => {
    const [bld] = await db.insert(buildings).values({ number: 777 }).returning();
    await db.insert(classrooms).values({
      buildingId: bld.id,
      roomNumber: '999',
      capacity: 10,
    });

    await expect(safeDelete(buildings, bld.id))
      .rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('Невозможно удалить'),
      });
  });

  it('успешно удаляет после удаления дочерних записей', async () => {
    const [inst] = await db.insert(institutes).values({
      name: 'Чистый институт',
      universityCode: 11111,
    }).returning();

    const [dept] = await db.insert(departments).values({
      name: 'Временная кафедра',
      abbreviation: 'ВР',
      instituteId: inst.id,
      departmentCode: 888,
    }).returning();

    await db.delete(departments).where(eq(departments.id, dept.id));

    const result = await safeDelete(institutes, inst.id, 'institutes');
    expect(result.success).toBe(true);
  });
});