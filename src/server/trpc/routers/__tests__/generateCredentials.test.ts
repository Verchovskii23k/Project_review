import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { users, employees, students } from '@/db/schema';
import { eq, and, isNull, count } from 'drizzle-orm';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData, createTestUser } from '@/test/helpers';
import { seedTestData } from '@/test/fixtures/fixtures';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeEach(async () => {
  await clearAllTestData();
  const seed = await seedTestData();
  const adminUserId = await createTestUser({ email: 'admin@test.com', role: 'admin' });
  caller = await createTestCaller({ id: adminUserId, role: 'admin' });

  // Добавляем уникального сотрудника и студента без учётной записи
  await db.insert(employees).values({
    surname: 'Уникальный',
    name: 'Сотрудник',
    isActive: true,
  });
  await db.insert(students).values({
    surname: 'Уникальный',
    name: 'Студент',
    admissionYear: 2023,
    profileId: seed.profiles.A,
    isActive: true,
  });
});

describe('generateCredentials', () => {
  it('создаёт учётные записи для всех персон без userId и привязывает их', async () => {
    // Получаем количество персон без учётных записей
    const [empCount] = await db
      .select({ cnt: count() })
      .from(employees)
      .where(and(eq(employees.isActive, true), isNull(employees.userId)));
    const [stuCount] = await db
      .select({ cnt: count() })
      .from(students)
      .where(and(eq(students.isActive, true), isNull(students.userId)));
    const totalBefore = (empCount?.cnt ?? 0) + (stuCount?.cnt ?? 0);

    const result = await caller.generations.generateCredentials({
      securityLevel: 'low',
      generateFor: ['employees', 'students'],
    });

    expect(result.count).toBe(totalBefore);
    expect(result.credentials).toHaveLength(totalBefore);

    // Проверяем уникального сотрудника
    const [uniqueEmp] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.surname, 'Уникальный'))
      .limit(1);
    expect(uniqueEmp.userId).not.toBeNull();

    const [newUser] = await db
      .select({ email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, uniqueEmp.userId!));
    expect(newUser).toBeDefined();
    expect(newUser.email).toMatch(/^[a-z]+\.[a-z]\d{2}@internal\.uni$/);
    expect(newUser.role).toBe('teacher');

    // Проверяем уникального студента
    const [uniqueStu] = await db
      .select({ userId: students.userId })
      .from(students)
      .where(eq(students.surname, 'Уникальный'))
      .limit(1);
    expect(uniqueStu.userId).not.toBeNull();

    const [stuUser] = await db
      .select({ email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, uniqueStu.userId!));
    expect(stuUser.role).toBe('student');

    // low – пароли длиной 10
    const lowCredentials = result.credentials.filter(
      c => c.role === 'teacher' || c.role === 'student'
    );
    lowCredentials.forEach(c => expect(c.password).toHaveLength(10));
  });



  it('не создаёт записи для уже привязанных пользователей (идемпотентность)', async () => {
    // Первый вызов
    await caller.generations.generateCredentials({
      securityLevel: 'medium',
      generateFor: ['employees', 'students'],
    });

    // Второй вызов
    const result = await caller.generations.generateCredentials({
      securityLevel: 'medium',
      generateFor: ['employees', 'students'],
    });

    expect(result.count).toBe(0);
  });

  it('medium создаёт пароли длиной 12', async () => {
    const result = await caller.generations.generateCredentials({
      securityLevel: 'medium',
      generateFor: ['employees'],
    });
    result.credentials.forEach(c => expect(c.password).toHaveLength(12))
  });

  it('high с указанной длиной создаёт пароли нужной длины', async () => {
    const result = await caller.generations.generateCredentials({
      securityLevel: 'high',
      loginLength: 16,
      generateFor: ['employees'],
    });
    result.credentials.forEach(c => expect(c.password).toHaveLength(16));
  });
});