/**
 * Модуль отправки почтовых уведомлений через SMTP.
 *
 * Использует nodemailer с настройками из переменных окружения:
 * - `SMTP_HOST` (по умолчанию 'localhost')
 * - `SMTP_PORT` (по умолчанию 1025, например, для Maildev в dev-окружении)
 * - `SMTP_USER`, `SMTP_PASS` – если заданы, включается аутентификация.
 * - `SMTP_FROM` – адрес отправителя (по умолчанию '"Расписание" <noreply@university.ru>').
 *
 * ## Функции
 * - `sendPasswordResetEmail` – отправляет ссылку для сброса пароля.
 * - `sendResetCodeEmail` – отправляет код сброса (альтернативный метод).
 * - `sendNewCredentialsEmail` – отправляет новые учётные данные (логин и пароль).
 *
 * Все функции возвращают `true` при успешной отправке и `false` при ошибке.
 */
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

export async function sendPasswordResetEmail(
  email: string,
  tokenOrPassword?: string,
  isNewCredentials = false
) {
  let subject = 'Восстановление пароля';
  let html = '';

  if (isNewCredentials) {
    subject = 'Новые учётные данные';
    html = `<p>Ваши новые данные для входа:</p>
            <p><strong>Логин:</strong> ${email}</p>
            <p><strong>Пароль:</strong> ${tokenOrPassword}</p>`;
  } else {
    const resetLink = `http://localhost:3000/reset-password?token=${tokenOrPassword}`;
    html = `<p>Для сброса пароля перейдите по ссылке:</p>
            <a href="${resetLink}">${resetLink}</a>
            <p>Ссылка действительна 30 минут.</p>`;
  }

  try {
    console.log("Attempting to send email to", email, "via", process.env.SMTP_HOST, process.env.SMTP_PORT);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Расписание" <noreply@university.ru>',
      to: email,
      subject,
      html,
    });
    return true;
  } catch (e) {
    console.error('Email sending failed:', e);
    return false;
  }
}
export async function sendResetCodeEmail(email: string, code: string) {
  const html = `<p>Ваш код для сброса пароля: <strong>${code}</strong></p><p>Код действителен 10 минут.</p>`;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Расписание" <noreply@university.ru>',
      to: email,
      subject: 'Код сброса пароля',
      html,
    });
    return true;
  } catch (e) {
    console.error('Email sending failed:', e);
    return false;
  }
}
export async function sendNewCredentialsEmail(email: string, password: string) {
  const html = `<p>Ваши новые данные для входа:</p>
                <p><strong>Логин:</strong> ${email}</p>
                <p><strong>Пароль:</strong> ${password}</p>`;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Расписание" <noreply@university.ru>',
      to: email,
      subject: 'Новые учётные данные',
      html,
    });
    return true;
  } catch (e) {
    console.error('Email sending failed:', e);
    return false;
  }
}