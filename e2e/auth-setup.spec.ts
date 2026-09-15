import { test, expect } from '@playwright/test';

test.describe('Full registration and credentials generation flow', () => {
  const adminEmail = `admin-${Date.now()}@example.com`;
  const adminPassword = 'adminPass123';
  let employeeLogin: string;
  let employeePassword: string;

  test.beforeAll(async ({ request }) => {
    await request.post('/api/trpc/e2eTestHelpers.resetAndSeed', {
      data: {},
    });
  });

  test('register first admin, generate employee credentials, login as employee', async ({ page }) => {
    // === 1. Первичная регистрация ===
    await page.goto('/');
    // Ждём, пока скелетон исчезнет или кнопка появится
    await page.waitForSelector('a:has-text("Зарегистрироваться")', { timeout: 15000 });
    const registerLink = page.locator('a:has-text("Зарегистрироваться")');
    await registerLink.click();
    await page.waitForURL('/setup');
    await page.waitForTimeout(1000);

    await page.fill('input[name="surname"]', 'Иванов');
    await page.fill('input[name="name"]', 'Иван');
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPassword);
    await page.click('button:has-text("Создать администратора")');

    await expect(page.locator('text=Готово!')).toBeVisible({ timeout: 10000 });
    await page.click('a:has-text("Войти")');
    await page.waitForURL('/login');
    await page.waitForTimeout(1000);

    // === 2. Вход под администратором ===
    await page.fill('input[placeholder="Email"]', adminEmail);
    await page.fill('input[placeholder="Пароль"]', adminPassword);
    await page.click('button:has-text("Войти")');
    // После входа ждём редиректа на главную
    await page.waitForURL('/', { timeout: 10000 });
    // Ждём появления кнопки "Перейти в панель управления"
    const adminDashboardLink = page.locator('a:has-text("Перейти в панель управления")');
    await expect(adminDashboardLink).toBeVisible({ timeout: 10000 });
    await adminDashboardLink.click();
    await page.waitForURL(/\/admin/, { timeout: 10000 });
    await page.waitForTimeout(1000);

    // === 3. Проверка прав администратора ===
    await page.goto('/admin/administrators');
    await page.waitForTimeout(1000);
    const adminRow = page.locator('tr', { hasText: 'Иванов Иван' });
    await expect(adminRow).toBeVisible();
    const toggle = adminRow.locator('button[class*="bg-primary"]');
    await expect(toggle).toBeVisible();

    // === 4. Генерация логинов и паролей ===
    await page.goto('/admin/credentials');
    await page.waitForTimeout(1000);
    const generateBtn = page.locator('button:has-text("Сгенерировать")');
    await generateBtn.click();
    await page.waitForSelector('tbody tr', { timeout: 10000 });
    const firstRow = page.locator('tbody tr').first();
    const cells = firstRow.locator('td');
    employeeLogin = (await cells.nth(1).textContent())?.trim()!;
    employeePassword = (await cells.nth(2).textContent())?.trim()!;
    console.log(`Generated credentials: ${employeeLogin} / ${employeePassword}`);

    // === 5. Выход из системы ===
    const logoutBtn = page.locator('button:has-text("Выйти")');
    await logoutBtn.click();
    // После выхода переходим на главную и ждём кнопку "Войти"
    await page.waitForURL('/', { timeout: 10000 });
    // Ждём, пока скелетон исчезнет и появится кнопка "Войти"
    const loginLink = page.locator('a:has-text("Войти")');
    await expect(loginLink).toBeVisible({ timeout: 10000 });
    await loginLink.click();
    await page.waitForURL('/login', { timeout: 10000 });

    // === 6. Вход под новым сотрудником ===
    await page.fill('input[placeholder="Email"]', employeeLogin);
    await page.fill('input[placeholder="Пароль"]', employeePassword);
    await page.click('button:has-text("Войти")');
    // После входа сотрудника редирект на главную, затем клик по ссылке
    await page.waitForURL('/', { timeout: 10000 });
    const teacherDashboardLink = page.locator('a:has-text("Перейти в панель управления")');
    await expect(teacherDashboardLink).toBeVisible({ timeout: 10000 });
    await teacherDashboardLink.click();
    await page.waitForURL('/teacher', { timeout: 10000 });
    await expect(page.locator('h1:has-text("Раздел преподавателя")')).toBeVisible();
  }); // увеличиваем таймаут до 2 минут
});