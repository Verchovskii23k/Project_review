"use client";
import Link from 'next/link';
import { trpc } from "@/trpc/client";
import { PageSkeleton } from '@/components/ui/page_skeleton';

export default function HomePage() {
  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery();

  const { data: canSetup, isLoading: setupLoading } = trpc.auth.canSetup.useQuery(
    undefined,
    { enabled: !me }
  );

  if (meLoading || setupLoading) return <PageSkeleton />;

  const dashboardLink =
    me?.role === 'teacher' ? '/teacher' :
    me?.role === 'student' ? '/student' :
    '/admin';

  const isSetupAllowed = canSetup ?? false;
  const loginLink = isSetupAllowed ? '/setup' : '/login';
  const loginButtonText = isSetupAllowed ? 'Зарегистрироваться' : 'Войти';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Расписание университета
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Храните все нужные данные в одном месте. Используйте генераторы для рутинных задач.
      </p>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Автоматизируйте планирование занятий, управляйте аудиториями и группами.
        Быстро, удобно и без ошибок.
      </p>

      <div className="mt-10">
        {me ? (
          <Link
            href={dashboardLink}
            className="hover:bg-primary/90 rounded-lg bg-primary px-8 py-3 text-lg font-medium text-white shadow transition-colors"
          >
            Перейти в панель управления
          </Link>
        ) : (
          <Link
            href={loginLink}
            className="hover:bg-primary/90 rounded-lg bg-primary px-8 py-3 text-lg font-medium text-white shadow transition-colors"
          >
            {loginButtonText}
          </Link>
        )}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        {me
          ? `Вы вошли как ${me.fullName || me.email}.`
          : isSetupAllowed
            ? 'Для начала работы создайте учётную запись администратора.'
            : 'Для продолжения войдите в систему.'}
      </p>
    </main>
  );
}