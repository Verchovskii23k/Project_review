"use client";
import Link from "next/link";
import {
  Database,
  Cog,
  CalendarDays,
  UserCog,
  KeyRound,
  Shield,
  Users,
  Sliders,
  FileQuestionIcon, 
  Album,
} from "lucide-react";

const sections = [
  { title: "Инструкция по эксплуатации", description: "Описание характеристик и параметров системы", href: "/admin/manual", icon: FileQuestionIcon, available: true },
  { title: "CRUD", description: "Управление справочниками и данными", href: "/admin/crud", icon: Database, available: true },
  { title: "Локальный поиск", description: "Настройка параметров локального поиска", href: "/admin/optimization-settings", icon: Sliders, available: true },
  { title: "Генерации", description: "Запуск генераторов данных", href: "/admin/generations", icon: Cog, available: true },
  { title: "Расписание", description: "Просмотр, оптимизация и экспорт расписания", href: "/admin/schedule", icon: CalendarDays, available: true },
  { title: "Администраторы", description: "Управление администраторами", href: "/admin/administrators", icon: Shield, available: true },
  { title: "Логины и пароли", description: "Генерация учётных записей", href: "/admin/credentials", icon: KeyRound, available: true },
  { title: "Пользователи", description: "Сброс логинов и паролей", href: "/admin/users", icon: Users, available: true },
  { title: "Импорт/экспорт данных БД", description: "Глобальный импорт/экспорт данных в формате JSON", href: "/admin/import-export", icon: Album, available: true },
  { title: "Настройки аккаунта", description: "Личные данные и безопасность аккаунта", href: "/admin/account", icon: UserCog, available: true },

];

export default function AdminDashboard() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">
        Панель администратора
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ title, description, href, icon: Icon, available }) => {
          const commonClasses =
            "relative flex flex-col items-start p-5 rounded-xl border bg-background shadow-sm transition-all duration-200";

          const interactiveClasses = available
            ? "hover:shadow-md hover:border-primary/50 hover:-translate-y-0.5 cursor-pointer border-border"
            : "opacity-60 cursor-not-allowed border-border";

          if (!available) {
            return (
              <div key={title} className={`${commonClasses} ${interactiveClasses}`}>
                <div className="mb-2 flex w-full items-center justify-between">
                  <div className="bg-primary/10 rounded-lg p-2 text-primary">
                    <Icon size={24} />
                  </div>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    Скоро
                  </span>
                </div>
                <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
              </div>
            );
          }

          return (
            <Link key={title} href={href} className={`${commonClasses} ${interactiveClasses}`}>
              <div className="mb-2 flex w-full items-center justify-between">
                <div className="bg-primary/10 rounded-lg p-2 text-primary">
                  <Icon size={24} />
                </div>
              </div>
              <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}