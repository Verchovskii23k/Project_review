/**
 * Корневой провайдер приложения.
 *
 * Оборачивает всё приложение в необходимые контексты и отрисовывает общий макет:
 * - **ThemeProvider** (next-themes) — управление светлой/тёмной темой.
 * - **TRPCProvider** — контекст tRPC для клиентских запросов.
 * - **HeaderContent** — шапка с навигацией, информацией о пользователе и кнопкой выхода.
 * - **main** — основная область для дочерних страниц.
 * - **Toaster** (sonner) — глобальные всплывающие уведомления.
 *
 * ## Шапка (HeaderContent)
 * - Показывает кнопку «Главная» (со ссылкой, зависящей от роли: `/admin`, `/teacher`, `/student`),
 *   если пользователь авторизован и находится не на публичных страницах (логин, сброс пароля, 404).
 * - Отображает ФИО и роль текущего пользователя.
 * - Кнопка переключения темы (`ThemeToggle`) и кнопка «Выйти» для выхода из аккаунта.
 *
 * @param children - содержимое страницы, которое будет отрендерено внутри макета.
 */
"use client";
import { authClient } from '@/lib/auth/client';
import { ThemeProvider } from "next-themes";
import { TRPCProvider } from "@/trpc/provider";
import ThemeToggle from "./ThemeToggle";
import Link from "next/link";
import { Home, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Toaster } from "sonner";
import { ReactNode } from 'react';

function HeaderContent() {
  const pathname = usePathname();
  const isLoginPage = pathname.startsWith("/login");
  const isSetupPage = pathname.startsWith("/setup");
  const isPublicPage = isLoginPage || isSetupPage;
  const isHomePage = pathname === "/";

  const { data: user } = trpc.auth.me.useQuery();
  const handleLogout = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  const homePath =
    user?.role === "admin"
      ? "/admin"
      : user?.role === "teacher"
      ? "/teacher"
      : user?.role === "student"
      ? "/student"
      : "/login";

  const roleLabel = (role: string) => {
    switch (role) {
      case "admin": return "Администратор";
      case "teacher": return "Преподаватель";
      case "student": return "Студент";
      default: return role;
    }
  };

return (
    <header className="border-b border-border bg-muted">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        {/* Левая группа */}
        <div className="flex items-center gap-4">
          {!isPublicPage && !isHomePage && (
            <Link
              href={homePath}
              className="flex items-center gap-1.5 text-foreground transition-colors hover:text-primary"
              aria-label="На главную"
            >
              <Home size={20} />
              <span className="hidden text-sm font-medium sm:inline">Главная</span>
            </Link>
          )}
          {(isPublicPage || isHomePage) && <div />}   {/* ← пустой блок, чтобы не ломалась вёрстка */}

          {!isPublicPage && user && (
            <div>
              <div className="text-sm font-medium leading-tight text-foreground">
                {user.fullName}
              </div>
              <div className="text-xs leading-tight text-muted-foreground">
                {roleLabel(user.role)}
              </div>
            </div>
          )}
        </div>

        {/* Правая группа (без изменений) */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {!isPublicPage && user && (
            <button
              onClick={handleLogout}
              disabled={false}
              className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Выйти"
            >
              <LogOut size={20} />
              <span className="hidden text-sm font-medium sm:inline">Выйти</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TRPCProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-background">
          <HeaderContent />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
          <Toaster richColors />
        </div>
      </TRPCProvider>
    </ThemeProvider>
  );
}