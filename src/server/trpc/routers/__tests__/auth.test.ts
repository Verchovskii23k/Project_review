import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { db } from '@/db';
import { users, employees } from '@/db/schema';
import { eq } from 'drizzle-orm'


let caller: Awaited<ReturnType<typeof createTestCaller>>;
let adminUserId: string;
let adminEmail: string;

beforeAll(async () => {
  await clearAllTestData();

  // Создаём учётную запись админа напрямую
  const [user] = await db
    .insert(users)
    .values({
      email: 'admin@test.local',
      hashedPassword: 'hashed',
      role: 'admin',
    })
    .returning({ id: users.id });
  adminUserId = user.id;
  adminEmail = 'admin@test.local';

  // Привязываем сотрудника к этой учётной записи (чтобы me вернул fullName)
  await db.insert(employees).values({
    surname: 'Администратор',
    name: 'Тестовый',
    patronymic: 'Тестович',
    userId: adminUserId,
    isAdmin: true,
    isActive: true,
  });

  caller = await createTestCaller({ id: adminUserId, role: 'admin' });
});

describe('auth', () => {
  it('me возвращает текущего пользователя', async () => {
    const me = await caller.auth.me();
    expect(me).not.toBeNull();
    expect(me?.email).toBe(adminEmail);
    // Проверим, что fullName формируется
    expect(me?.fullName).toContain('Администратор');
  });

  it('forgotPassword возвращает сообщение (пользователь с email)', async () => {
    const result = await caller.auth.forgotPassword({ email: adminEmail });
    expect(result).toHaveProperty('message');
  }, 15000);
});
describe('changeEmail', () => {
  it('успешно меняет email на новый', async () => {
    const newEmail = 'newadmin@test.local';
    const result = await caller.auth.changeEmail({ newEmail });
    expect(result.success).toBe(true);

    // Проверяем, что email в базе обновился
    const [user] = await db.select().from(users).where(eq(users.id, adminUserId));
    expect(user.email).toBe(newEmail);

    // Возвращаем обратно для других тестов
    await caller.auth.changeEmail({ newEmail: adminEmail });
  });

  it('возвращает сообщение, если новый email совпадает с текущим', async () => {
    const result = await caller.auth.changeEmail({ newEmail: adminEmail });
    expect(result.success).toBe(true);
    expect(result.message).toBe('Это ваш текущий email');
  });

  it('выбрасывает ошибку, если email уже занят', async () => {
    // Создаём второго пользователя
    const [otherUser] = await db.insert(users).values({
      email: 'other@test.local',
      hashedPassword: 'pw',
      role: 'student',
    }).returning({ id: users.id });
    // Привязываем сотрудника
    await db.insert(employees).values({
      surname: 'Другой', name: 'Пользователь',
      userId: otherUser.id, isAdmin: false, isActive: true,
    });

    await expect(
      caller.auth.changeEmail({ newEmail: 'other@test.local' })
    ).rejects.toThrow('Пользователь с таким email уже существует');
  });
});