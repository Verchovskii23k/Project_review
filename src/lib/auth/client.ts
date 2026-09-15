/**
 * Клиент better-auth для использования на клиентской стороне (React-компоненты).
 *
 * Создаётся с помощью `createAuthClient` и указывает `baseURL` из переменной
 * окружения `NEXT_PUBLIC_BASE_URL` или `http://localhost:3000` по умолчанию.
 *
 * ## Где используется
 * - В компоненте `<Providers>` для оборачивания приложения в `AuthProvider`.
 * - В хуках `useSession`, `signIn`, `signOut` и других методах better-auth.
 *
 * @example
 * ```tsx
 * import { authClient } from '@/lib/auth/client';
 * const { data: session } = authClient.useSession();
 * ```
 */
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
});