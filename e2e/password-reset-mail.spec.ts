import { test, expect } from '@playwright/test';

async function clearMailpit() {
  try {
    await fetch('http://localhost:8025/api/v1/messages', { method: 'DELETE' });
  } catch {}
}

interface MailpitMessage {
  ID: string;
}

interface MailpitMessageDetail {
  Text?: string;
  HTML?: string;
}

async function getLastEmailToken(): Promise<string | null> {
  const resp = await fetch('http://localhost:8025/api/v1/messages');
  if (!resp.ok) return null;
  const data: MailpitMessage[] | { messages: MailpitMessage[] } = await resp.json();
  const list: MailpitMessage[] = Array.isArray(data) ? data : (data.messages || []);
  if (list.length === 0) return null;

  const lastMsg = list[list.length - 1];
  const detailResp = await fetch(`http://localhost:8025/api/v1/message/${lastMsg.ID}`);
  if (!detailResp.ok) return null;
  const detail: MailpitMessageDetail = await detailResp.json();

  const body = detail.Text || detail.HTML || '';
  const match = body.match(/token=([0-9a-f]{64})/i) || body.match(/[0-9a-f]{64}/i);
  return match ? (match[1] || match[0]) : null;
}

test.describe('Password reset via Mailpit', () => {
  let adminLogin: string;

  test.beforeAll(async ({ request }) => {
    await clearMailpit();

    const resp = await request.post('/api/trpc/e2eTestHelpers.resetAndSeed', {
      data: { adminEmail: 'admin@test.com' },
    });
    const result = await resp.json();
    const data = result.result?.data;
    adminLogin = data.login;
  });

  test('reset password via email', async ({ page }) => {
    // 1. Попытка входа с заведомо неверным паролем и проверка «глазка»
    await page.goto('/login');
    const emailInput = page.locator('input[placeholder="Email"]');
    await emailInput.fill(adminLogin);
    const passwordInputLogin = page.locator('input[placeholder="Пароль"]');
    await passwordInputLogin.fill('wrongPassword');

    // Кликаем по «глазку» на странице входа – проверяем, что пароль виден
    const loginShowBtn = page.locator('button[aria-label="Показать пароль"]');
    await loginShowBtn.click();
    await expect(passwordInputLogin).toHaveAttribute('type', 'text');


    // Пытаемся войти – ожидаем ошибку
    await page.click('button:has-text("Войти")');
    await page.waitForSelector('.text-red-500', { timeout: 5000 });

    // 2. Восстановление пароля
    await page.click('a:has-text("Забыли пароль?")');
    await page.waitForURL('/forgot-password');

    const forgotEmailInput = page.locator('input[type="email"]');
    await forgotEmailInput.waitFor({ timeout: 10000 });
    await forgotEmailInput.fill('admin@test.com');
    await page.click('button:has-text("Восстановить пароль")');

    // Ожидаем появления зелёного сообщения об успехе
    await page.waitForSelector('.text-green-600', { timeout: 15000 });

    const token = await getLastEmailToken();
    if (!token) throw new Error('Token not found in Mailpit');
    console.log('Mail token:', token);

    // 3. Установка нового пароля
    await page.goto(`/reset-password?token=${token}`);
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });

    const newPassword = 'mailPass456';
    const resetPasswordInput = page.locator('input[type="password"], input[type="text"]').first();
    await resetPasswordInput.fill(newPassword);

    // Кликаем по «глазку» на странице сброса
    const resetShowBtn = page.locator('button[aria-label="Показать пароль"]');
    await resetShowBtn.click();
    // После клика поле должно быть текстовым – проверяем, что значение видно
    await expect(resetPasswordInput).toHaveValue(newPassword);

    // Сохраняем новый пароль
    await page.click('button:has-text("Сохранить")');

    // 4. Вход с новым паролем
    await page.waitForURL('/login', { timeout: 15000 });
    await expect(page).toHaveURL('/login');

    await page.fill('input[placeholder="Email"]', adminLogin);
    const loginPasswordInput2 = page.locator('input[placeholder="Пароль"]');
    await loginPasswordInput2.fill(newPassword);

    // Снова показываем пароль на странице входа
    const loginShowBtn2 = page.locator('button[aria-label="Показать пароль"]');
    await loginShowBtn2.click();
    await expect(loginPasswordInput2).toHaveAttribute('type', 'text');

    // Входим
    await page.click('button:has-text("Войти")');
    const dashboardLink = page.locator('a:has-text("Перейти в панель управления")');
    await dashboardLink.waitFor({ state: 'visible', timeout: 15000 });
    await dashboardLink.click();
    await page.waitForURL(/\/admin/);
    await expect(page).toHaveURL(/\/admin/);
  });
});