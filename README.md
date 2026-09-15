# 📅 Информационная система для учета и составления расписания университета

Данный проект представляет собой реализацию системы для создания расписания с минимизацией конфликтов и максимально возможно близкое к оптимальному. Широкий функционал для настройки должен помочь довести сырой вариант расписания до некоторого оптимизированного варианта.

Система позволяет вести справочники, генерировать учебные группы, юниты, занятия, назначать аудитории, автоматически генерировать расписание жадным алгоритмом и редактировать его вручную через drag‑and‑drop интерфейс с последующей оптимизацией.

Данное приложение не позволяет зарегистрироваться в систему извне, кроме самого первого сотрудника (администратора ИС). Дальнейший вход производится только по логину и паролю для тех пользователей, которых добавил администратор. Предусмотрено восстановление доступа (сброс пароля) по email и через панель администратора, если был забыт логин или потерян доступ к нему.
___
[![CI](https://github.com/Verchovskii23k/PP-NextJS/actions/workflows/ci.yml/badge.svg)](https://github.com/Verchovskii23k/PP-NextJS/actions/workflows/ci.yml)
[![E2E](https://github.com/Verchovskii23k/PP-NextJS/actions/workflows/e2e.yml/badge.svg)](https://github.com/Verchovskii23k/PP-NextJS/actions/workflows/e2e.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

___
## 🧰 Технологический стек

- **Фреймворк:** Next.js 15 (App Router)
- **Язык:** TypeScript (строгий режим)
- **API:** tRPC v11
- **База данных:** PostgreSQL
- **ORM:** Drizzle ORM + drizzle-kit
- **Аутентификация:** Better-Auth
- **Восстановление пароля:** по email (через Mailpit в dev‑режиме)
- **Управление состоянием:** TanStack React Query
- **UI‑кит:** Tailwind CSS, next‑themes (тёмная/светлая тема), Lucide React
- **Таблицы:** TanStack React Table
- **Drag‑and‑Drop:** dnd-kit
- **Уведомления:** Sonner (тосты)
- **Тестирование:** Vitest (540 unit‑теста), Playwright (2 e2e-теста)
- **CI/CD:** GitHub Actions (проверка типов, линтера, тестов и сборки)
- **Почта (dev):** Mailpit (перехватывает письма на localhost:8025)

## 🏗️ Архитектура (основные модули)

- **`public/`** – статические ресурсы (`favicon.ico`).
- **`e2e/`** – end‑to‑end тесты (Playwright): настройка аутентификации и тест восстановления пароля через Mailpit.
- **`mailpit/`** – исполняемый файл почтового сервера Mailpit для Windows (используется при разработке).

### 📁 `src/` – исходный код приложения

#### 🌐 `app/` – роутинг Next.js (App Router)
- **`globals.css`** – глобальные стили Tailwind CSS.
- **`layout.tsx`** – корневой layout: подключает провайдеры (`Providers`, `ConfirmProvider`), задаёт метаданные.
- **`not-found.tsx`** – кастомная страница 404.
- **`page.tsx`** – главная страница: для авторизованных пользователей показывает кнопку перехода по роли, иначе предлагает вход или регистрацию.

**`admin/`** – панель администратора (все страницы защищены `adminProcedure`):
- **`layout.tsx`** – проверка роли `admin`, иначе `Forbidden`.
- **`page.tsx`** – дашборд администратора: сетка карточек разделов.
- **`account/`** – личный кабинет администратора (изменение email и пароля).
- **`administrators/`** – управление списком администраторов (назначение/снятие роли).
- **`credentials/`** – генерация учётных записей преподавателей и студентов.
- **`crud/`** – универсальный CRUD для всех справочников:
  - `page.tsx` – выбор таблицы и отрисовка `DataTable`.
  - `_components/`:
    - `DataTable.tsx` – таблица на основе метаданных (сортировка, фильтры, пагинация, массовое удаление, импорт/экспорт).
    - `RecordForm.tsx` – модальная форма создания/редактирования записи.
    - `ForeignKeyCell.tsx` – отображение значения внешнего ключа через запрос к связанной таблице.
    - `ColumnFilterPopover.tsx` – всплывающий фильтр для столбца.
- **`generations/`** – запуск генераторов данных (групп, юнитов, занятий, расписания) с параметрами. Генераторы блокируются при активной версии расписания. При генерации расписания запрашивается имя версии, создаётся новая сохранённая версия.
- **`import-export/`** – глобальный импорт/экспорт всей БД в JSON.
- **`manual/`** – инструкция пользователя.
- **`optimization-settings/`** – редактирование весов штрафов и параметров имитации отжига.
- **`schedule/`** – просмотр, drag‑and‑drop редактирование, оптимизация с возможностью автоматического возврата занятий из буфера (через чекбокс «Использовать буфер») и версионирование расписания. Поддерживает «Чистый лист» и сохранённые версии, мгновенное переключение между версиями, кнопки «Сохранить как…», «Удалить версию», «Переименовать».
- **`users/`** – управление пользователями (персональный сброс пароля и логина).

**`api/`** – API-роуты:
- **`auth/[...all]/route.ts`** – обработчик better‑auth (вход, регистрация, сессии).
- **`trpc/[trpc]/route.ts`** – tRPC-сервер (все процедуры).

**Публичные страницы:**
- **`forgot-password/`** – форма отправки email для сброса пароля.
- **`login/`** – форма входа (email + пароль).
- **`reset-password/`** – форма сброса пароля по токену.
- **`setup/`** – форма создания первого администратора (доступна только при пустой БД).

**Кабинеты пользователей (заглушки):**
- **`student/`** – кабинет студента (проверка роли `student`, иначе `Forbidden`).
- **`teacher/`** – кабинет преподавателя (проверка роли `teacher`, иначе `Forbidden`).

#### 🧩 `components/` – переиспользуемые UI-компоненты
- **`EntityTooltip.tsx`** – всплывающая карточка с полной информацией о связанной сущности.
- **`Forbidden.tsx`** – ошибка 403 «Доступ запрещён».
- **`Providers.tsx`** – корневой провайдер: `ThemeProvider`, `TRPCProvider`, шапка (`HeaderContent`), `Toaster`.
- **`ThemeToggle.tsx`** – кнопка переключения светлой/тёмной темы.
- **`Unauthorized.tsx`** – ошибка 401 «Вы не авторизованы».
- **`ui/`** – примитивные UI-компоненты:
  - `ConfirmDialog.tsx` – модальное окно подтверждения.
  - `InputDialog.tsx` – диалог ввода строки.
  - `page_skeleton.tsx` – скелетон для страниц.
  - `skeleton.tsx` – базовый скелетон (прямоугольник) и скелетон таблицы.

#### 🗂️ `contexts/` – React-контексты
- **`ConfirmContext.tsx`** – провайдер для `ConfirmDialog`, предоставляет метод `confirm()`.
- **`VersionContext.tsx`** – контекст версий для расписания.
#### 🗄️ `db/` – база данных (Drizzle ORM)
- **`index.ts`** – подключение к PostgreSQL через `drizzle-orm/postgres-js`.
- **`schema.ts`** – описание всех таблиц (пользователи, институты, …, расписание).
- **`seed.ts`** – начальное наполнение (для разработки).

#### 🪝 `hooks/` – пользовательские хуки
- **`useConfirm.ts`** – хук, возвращающий функцию `confirm()` для вызова диалога подтверждения.

#### 📚 `lib/` – бизнес-логика и вспомогательные модули
- **`cascadeDeactivate.ts`** – каскадная деактивация записей в справочных таблицах (institutes, specialties, ...).
- **`password.ts`** – генерация паролей, транслитерация, создание email.
- **`safeDelete.ts`** – удаление записи с предварительной проверкой дочерних таблиц.
- **`table-meta.ts`** – единый реестр метаданных всех таблиц (поля, связи, названия).
- **`uniqueKeys.ts`** - единый источник уникальных идентификаторов записей для функций глобального и локального импорта/экспорта
- **`usageMetrics.ts`** – пересчёт метрики использования аудиторий.
- **`auth/`**:
  - `client.ts` – клиент better‑auth для React (`useSession`, `signIn` и т.д.).
  - `config.ts` – серверная конфигурация better‑auth (адаптер, колбэки, стратегии).

#### ⚙️ `server/` – серверная логика
- **`email.ts`** – отправка писем через Nodemailer (восстановление пароля, учётные данные).

**`trpc/`** – tRPC-сервер:
- **`context.ts`** – создание контекста запроса (сессия, БД, req).
- **`index.ts`** – реэкспорт процедур и типа `Context`.
- **`router.ts`** – корневой роутер (объединение всех подроутеров).
- **`trpc.ts`** – инициализация tRPC, `publicProcedure`, `protectedProcedure`, `adminProcedure`, `errorFormatter`.
- **`routers/`** – роутеры предметной области (CRUD для каждой таблицы + специализированные):
  - `auth.ts`, `adminManagement.ts`, `userManagement.ts`, `batchDelete.ts`, `batchUpdateActive.ts`, `crudImportExport.ts`, `globalImportExport.ts`, `lookup.ts`, `settings.ts`.
  - **Роутеры сущностей:** `academicLoadTypes.ts`, `buildings.ts`, `classRooms.ts`, `controlTypes.ts`, `curriculum.ts`, `curriculumProfiles.ts`, `daysOfWeek.ts`, `departments.ts`, `disciplines.ts`, `disciplineTeachers.ts`, `education.ts`, `educationForms.ts`, `educationLevels.ts`, `employees.ts`, `employeesDepartments.ts`, `employmentTypes.ts`, `hourTypeMapping.ts`, `institutes.ts`, `lessons.ts`, `lessonClassrooms.ts`, `lessonTypes.ts`, `pairs.ts`, `positions.ts`, `profiles.ts`, `specialties.ts`, `students.ts`, `studyGroups.ts`, `units.ts`, `unitRoots.ts`, `unitTypes.ts`, `weeks.ts`.
  - **Расписание:** `schedule.ts` (публичное API), `scheduleDisplay.ts` (drag‑and‑drop, буфер, флаги), `scheduleOptimizer.ts` (имитация отжига), `scheduleVersions.ts` (версионирование).
  - **Генераторы:** `generations` (объединение), `generateCredentials.ts`, `generateGroups.ts`, `generateUnits.ts`, `generateLessons.ts`, `assignClassrooms.ts`, `generateSchedule.ts` а также `helpers.ts` для проверки открытия чистого листа и `index.ts` для подключения генераторов в один подроутер.
  - **Тесты:** `__tests__/` – **Unit-тесты (Vitest, 540 тестов)** покрывают все CRUD-роутеры справочных таблиц, роутеры аутентификации и управления пользователями, отдельные утилиты, генератор учетных записей, модуль версионирования `scheduleVersions`, роутеры `scheduleDisplay` и `scheduleOptimizer` а также логику вызова генераторов. Отдельно тестируется функция `checkSlots` для контроля конфликтов в `dnd`.

#### 🧪 `test/` – тестовая инфраструктура
- **`helpers.ts`** – хелперы: очистка таблиц, создание тестовых сущностей.
- **`setup.ts`** – глобальная настройка тестов (env, мок `next/headers`).
- **`trpc.ts`** – создание тестового tRPC‑клиента с моковой сессией.
- **`fixtures/fixtures.ts`** – полные фикстуры: очистка БД и заполнение тестовыми данными.

#### 🖥️ `trpc/` – tRPC-клиент для фронтенда
- **`client.ts`** – создание React‑клиента (`createTRPCReact`).
- **`provider.tsx`** – провайдер tRPC + React Query (`QueryClient`, `httpBatchLink`).

#### 📝 `types/` – дополнительные декларации типов
- **`better-auth.d.ts`** – расширение типов для better‑auth.
- **`css.d.ts`** – декларация для CSS‑модулей.

## 📋 Требования

- **Node.js** ≥ 20.17 (рекомендуется последняя LTS)
- **npm** ≥ 9
- **PostgreSQL** ≥ 14 (или совместимый)
___
## 🚀 Быстрый старт (локальная разработка)

### 1. Клонирование репозитория

```bash
git clone <url-репозитория> ваша_папка
cd ваша_папка
```

### 2. Установка зависимостей
```bash
npm install
```
### 3. Настройка окружения
Создайте файл ```.env``` в корне проекта. В нем хранятся глобальные переменные для подключения к базе данных и почтовому серверу. Вы можете использовать файл ```.env.example``` в корне проекта как шаблон.

### 4. Создайте базу данных
Приложение работает с СУБД ```postgresql```. Следуйте инструкциям по настройке и созданию базы данных из <a href="https://postgrespro.ru/">официального источника</a>.

### 5. Локальный почтовый сервер
Для тестирования отправки писем на восстановление доступа (сброс логина и пароля) вы можете использовать приложение MailPit (уже включено в проект, описанные команды доступны пользователям OC Windows). 
Проверьте что вы указали конфигурацию почтового сервиса в файле ```.env```:
```bash
# Локальный почтовый сервер (Mailpit) – для восстановления пароля через почту
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM="Расписание университета <ваша_почта@mail.ru>"
```
Запустите ```Mailpit``` в отдельном терминале командой:
```bash
# В корне проекта выполните
./ваша_папка/mailpit/mailpit.exe
```

Почтовый сервис ```MailPit``` будет доступен на [http://localhost:8025](http://localhost:8025).

Если у вас возникнут трудности с запуском, обратитесь к  <a href="https://mailpit.axllent.org/docs/install/">официальному сайту MailPit</a>.
### 6. Создание базы таблиц и накат схемы БД
В корне проекта последовательно выполните команды:
```bash
npm run db:generate   # генерация миграций
npm run db:push       # применение миграций к базе данных
npm run seed          # заполнение базы тестовыми данными (не создает администратора)
```
Не забудьте создать базу данных в ```postgresql``` и настроить подключение в файле ```.env```.
### 7. Запуск приложения
В отдельном терминале откройте корень проекта и выполните команду:
```bash
npm run dev
```
Перейдите по адресу [http://localhost:3000](http://localhost:3000). Вам будет предложено зарегистрироваться. 

Если этого не произошло перейдите по пути [http://localhost:3000/setup](http://localhost:3000/setup). Заполните обязательные поля и нажмите кнопку "Зарегистрироваться". 

Вы будете перенаправлены на страницу входа. Введите логин и пароль, которые вы указали при регистрации, и нажмите кнопку "Войти". Вы будет перенаправлены на главную страницу приложения в панель администратора.

___

### 8. Тестирование

## 8.1 Unit-тесты
Для запуска ```unit```-тестов необходимо создать тестовое окружение и тестовую базу данных.
создайте файл ```.env.test``` и заполните его данными:
```bash
DATABASE_URL=postgresql://postgres:ваш_пароль@localhost:5432/ваша_тестовая_база_данных

# Локальный почтовый сервер (Mailpit) – для восстановления пароля через почту
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM="Расписание университета <ваша_почта@mail.ru>"
```

Когда база будет создана, последовательно в корне проекта выполните команды:
```bash
npm run test:db:push
npm run test
```
### 8.2 E2E-тесты (Playwright).
Установите браузеры playwright:
```bash
npx playwright install
```
Перед запуском убедитесь, что основной сервер разработки (`npm run dev`) **остановлен**, так как тесты автоматически поднимут свой сервер на том же порту `3000`.

Для тестирования восстановления пароля через почту дополнительно запустите Mailpit (см. п. 5).
Доступные команды для запуска E2E‑тестов:
```bash
npm run test:e2e:auth    # только авторизация
npm run test:e2e:mail    # восстановление пароля через почту (Mailpit)
npm run test:e2e         # все E2E‑тесты (локально с графикой, на CI в headless-режиме)
```
E2E‑тесты покрывают сценарии авторизации, восстановления пароля (в том числе через Mailpit) и готовы к расширению.

### 9. Непрерывная интеграция (CI/CD)
Проект использует GitHub Actions:
- **CI** — `.github/workflows/ci.yml` — автоматический прогон типов, линтера, unit‑тестов и сборки при пушах.
- **E2E** — `.github/workflows/e2e.yml` — полный цикл Playwright‑тестов с поднятием тестового сервера и Mailpit. Запускается **вручную** из вкладки Actions.
### 10. 📜 Доступные npm‑скрипты

|Скрипт	              |   Описание                                                |
|:--------------------|:----------------------------------------------------------|
|npm run dev	        |   Запуск сервера разработки (рабочая БД)                  |
|npm run dev:test	    |   Запуск сервера с тестовой базой данных, для e2e-тестов  |
|npm run build	      |   Сборка production‑версии                                |
|npm run start	      |   Запуск production‑сервера                               |
|npm run db:generate	|   Генерация миграций Drizzle                              |
|npm run db:push	    |   Применение миграций к текущей БД                        |
|npm run db:migrate   |   Применение сгенерированных миграций к базе данных       |
|npm run type-check	  |   Проверка типов TypeScript                               |
|npm run lint	        |   Линтинг кода (ESLint)                                   |
|npm run lint:fix	    |   Автоисправление ошибок линтинга                         |
|npm run test:db:push	|   Накат схемы на тестовую БД                              |
|npm run test	        |   Запуск всех unit‑тестов Vitest (исключая e2e/)          |
|npm run test:e2e:auth|   Запуск E2E теста авторизации (с графикой)               |
|npm run test:e2e:mail|   Запуск E2E теста восстановления через почту (Mailpit)   |
|npm run test:e2e	    |   Запуск всех E2E‑тестов (без графического интерфейса)    |
|npm run seed	        |   Наполнение БД тестовыми данными                         |

### 11. Структура проекта
```
e2e/                                                                     # end‑to‑end тесты (Playwright)
├── auth-setup.spec.ts                                                   # Настройка аутентификации перед тестами
└── password-reset-mail.spec.ts                                          # Тест проверки email‑сообщения при сбросе пароля
mailpit/                                                                 # служебная папка почтового сервера Mailpit
├── LICENSE                                                              # Лицензионное соглашение Mailpit
├── README.md                                                            # Документация по использованию Mailpit
└── mailpit.exe                                                          # Исполняемый файл Mailpit для Windows
public/
└── favicon.ico                                                          # статические ресурсы
src
├── app/                                                                 # Роутинг Next.js (App Router)
│   ├── globals.css                                                      # Глобальные стили Tailwind CSS
│   ├── layout.tsx                                                       # Корневой layout: подключает Providers, ConfirmProvider, задаёт метаданные
│   ├── not-found.tsx                                                    # Кастомная страница 404 "Страница не найдена"
│   ├── page.tsx                                                         # Главная страница: для авторизованных — кнопка по роли, иначе вход/регистрация
│   ├── admin/                                                           # Панель администратора
│   │   ├── layout.tsx                                                   # Проверка роли admin через trpc.auth.me, иначе Forbidden
│   │   ├── page.tsx                                                     # Дашборд администратора: сетка карточек разделов
│   │   ├── account/                                                     # Личный кабинет администратора (настройки профиля)
│   │   │   └── page.tsx                                                 # Изменение email, пароля
│   │   ├── administrators/                                              # Управление списком администраторов
│   │   │   └── page.tsx                                                 # Назначение/снятие роли admin
│   │   ├── credentials/                                                 # Генерация учётных записей преподавателей/студентов
│   │   │   └── page.tsx                                                 # Форма для массового создания/обновления логинов и паролей
│   │   ├── crud/                                                        # Универсальный CRUD для всех справочников
│   │   │   ├── page.tsx                                                 # Выбор таблицы и рендеринг DataTable
│   │   │   └── _components/
│   │   │       ├── DataTable.tsx                                        # Таблица данных на основе table-meta (сортировка, фильтры, пагинация, массовое удаление, импорт/экспорт)
│   │   │       ├── RecordForm.tsx                                       # Модальная форма создания/редактирования записи (поля по метаданным)
│   │   │       ├── ForeignKeyCell.tsx                                   # Отображение значения внешнего ключа через запрос к связанной таблице
│   │   │       └── ColumnFilterPopover.tsx                              # Всплывающий фильтр-исключение для столбца
│   │   ├── generations/                                                 # Генерация данных
│   │   │   └── page.tsx                                                 # Кнопки запуска генераторов (групп, юнитов, занятий, расписания) с параметрами
│   │   ├── import-export/                                               # Глобальный импорт/экспорт БД
│   │   │   └── page.tsx                                                 # Экспорт всех таблиц в JSON, импорт из JSON с валидацией
│   │   ├── manual/                                                      # Инструкция
│   │   │   └── page.tsx                                                 # Текстовая инструкция пользователя
│   │   ├── optimization-settings/                                       # Настройки оптимизатора расписания
│   │   │   └── page.tsx                                                 # Редактирование весов штрафов и параметров имитации отжига
│   │   ├── schedule/                                                    # Расписание
│   │   │   └── page.tsx                                                 # Просмотр, drag-and-drop редактирование, оптимизация, версионирование
│   │   └── users/                                                       # Управление пользователями (студенты/преподаватели)
│   │       └── page.tsx                                                 # Выборочный сброс логина и пароля
│   ├── api/                                                             # API-роуты
│   │   ├── auth/[...all]/route.ts                                       # Better-auth обработчик (вход, регистрация, сессии)
│   │   └── trpc/[trpc]/route.ts                                         # tRPC-сервер (все процедуры)
│   ├── forgot-password/                                                 # Восстановление пароля
│   │   └── page.tsx                                                     # Форма отправки email для сброса
│   ├── login/                                                           # Вход в систему
│   │   └── page.tsx                                                     # Форма входа (email + пароль)
│   ├── reset-password/                                                  # Сброс пароля по токену
│   │   ├── page.tsx                                                     # Проверка токена и форма нового пароля
│   │   └── ResetPasswordForm.tsx                                        # Компонент формы сброса
│   ├── setup/                                                           # Первоначальная настройка
│   │   ├── layout.tsx                                                   # Публичный layout (без проверки ролей)
│   │   └── page.tsx                                                     # Форма создания первого администратора
│   ├── student/                                                         # Кабинет студента (заглушка)
│   │   ├── layout.tsx                                                   # Проверка роли student, иначе Forbidden
│   │   └── page.tsx                                                     # Заглушка "Раздел студента в разработке"
│   └── teacher/                                                         # Кабинет преподавателя (заглушка)
│       ├── layout.tsx                                                   # Проверка роли teacher, иначе Forbidden
│       └── page.tsx                                                     # Заглушка "Раздел преподавателя в разработке"
│
├── components/                                                          # Переиспользуемые UI-компоненты
│   ├── EntityTooltip.tsx                                                # Всплывающая карточка с полной информацией о связанной сущности
│   ├── Forbidden.tsx                                                    # Компонент ошибки 403 "Доступ запрещён" с кнопкой "Вернуться на главную"
│   ├── Providers.tsx                                                    # Корневой провайдер: ThemeProvider, TRPCProvider, шапка (HeaderContent), Toaster
│   ├── ThemeToggle.tsx                                                  # Кнопка переключения светлой/тёмной темы
│   ├── Unauthorized.tsx                                                 # Компонент ошибки 401 "Вы не авторизованы" с кнопкой "Войти"
│   └── ui/                                                              # Примитивные UI-компоненты
│       ├── ConfirmDialog.tsx                                            # Модальное окно подтверждения (удалить, сбросить и т.д.)
│       ├── InputDialog.tsx                                              # Диалог ввода строки (название версии расписания)
│       ├── page_skeleton.tsx                                            # Скелетон для страниц (заглушка во время загрузки)
│       └── skeleton.tsx                                                 # Базовый скелетон (прямоугольник) и скелетон таблицы
│
├── contexts/                                                            # React-контексты
│   ├── ConfirmContext.tsx                                               # Провайдер для ConfirmDialog, предоставляет метод confirm()
│   └── VersionContext.tsx                                               # Контекст версий для расписания
│
├── db/                                                                  # База данных (Drizzle ORM)
│   ├── index.ts                                                         # Подключение к PostgreSQL через drizzle-orm/postgres-js
│   ├── schema.ts                                                        # Описание всех таблиц (users, institutes, …, schedule)
│   └── seed.ts                                                          # Начальное наполнение (опционально, для разработки)
│
├── hooks/                                                               # Пользовательские хуки
│   └── useConfirm.ts                                                    # Хук, возвращающий функцию confirm() для вызова ConfirmDialog
│
├── lib/                                                                 # Бизнес-логика и вспомогательные модули
│   ├── cascadeDeactivate.ts                                             # Каскадная деактивация записей от родителя до последнего потомка. Работает только для таблиц, записи которых имеют настраиваемый атрибут isActive
│   ├── password.ts                                                      # Генерация паролей, транслитерация, создание email
│   ├── safeDelete.ts                                                    # Удаление записи с предварительной проверкой дочерних таблиц
│   ├── table-meta.ts                                                    # Единый реестр метаданных всех таблиц (поля, связи, названия)
│   ├── uniqueKeys.ts                                                    # Уникальные ключи для функций импорта/экспорта
│   ├── usageMetrics.ts                                                  # Пересчёт метрики использования аудиторий (по lessonClassrooms)
│   └── auth/
│       ├── client.ts                                                    # Клиент better-auth для React (useSession, signIn и т.д.)
│       └── config.ts                                                    # Серверная конфигурация better-auth (адаптер, колбэки, стратегии)

│
├── server/                                                              # Серверная логика
│   ├── email.ts                                                         # Отправка писем через nodemailer (восстановление пароля, учётные данные)
│   └── trpc/                                                            # tRPC-сервер
│       ├── context.ts                                                   # Создание контекста запроса (сессия, БД, req)
│       ├── index.ts                                                     # Реэкспорт: процедуры, тип Context
│       ├── router.ts                                                    # Корневой роутер (объединение всех подроутеров)
│       ├── trpc.ts                                                      # Инициализация tRPC, publicProcedure, protectedProcedure, adminProcedure, errorFormatter
│       └── routers/                                                     # Роутеры предметной области
│           ├── academicLoadTypes.ts                                     # CRUD "Типы нагрузки"
│           ├── adminManagement.ts                                       # Повышение/понижение администраторов
│           ├── auth.ts                                                  # Аутентификация: setup, me, смена пароля/email, сброс
│           ├── batchDelete.ts                                           # Массовое удаление с проверкой зависимостей
│           ├── batchUpdateActive.ts                                     # Массовое переключение активности записей
│           ├── buildings.ts                                             # CRUD "Корпуса"
│           ├── classRooms.ts                                            # CRUD "Аудитории"
│           ├── controlTypes.ts                                          # CRUD "Типы контроля"
│           ├── crudImportExport.ts                                      # Импорт/экспорт одной таблицы (JSON)
│           ├── curriculum.ts                                            # CRUD "Учебные планы"
│           ├── curriculumProfiles.ts                                    # CRUD "Профили учебных планов"
│           ├── daysOfWeek.ts                                            # CRUD "Дни недели"
│           ├── departments.ts                                           # CRUD "Кафедры"
│           ├── disciplines.ts                                           # CRUD "Дисциплины"
│           ├── disciplineTeachers.ts                                    # CRUD "Преподаватели дисциплин"
│           ├── e2eTestHelpers.ts                                        # Сброс БД и создание тестового админа для E2E-тестов
│           ├── education.ts                                             # CRUD "Образование"
│           ├── educationForms.ts                                        # CRUD "Формы обучения"
│           ├── educationLevels.ts                                       # CRUD "Уровни образования"
│           ├── employees.ts                                             # CRUD "Сотрудники"
│           ├── employeesDepartments.ts                                  # CRUD "Сотрудники кафедр"
│           ├── employmentTypes.ts                                       # CRUD "Типы занятости"
│           ├── globalImportExport.ts                                    # Глобальный импорт/экспорт всей БД (JSON)
│           ├── hourTypeMapping.ts                                       # CRUD "Соответствие типов часов"
│           ├── institutes.ts                                            # CRUD "Институты"
│           ├── lessonClassrooms.ts                                      # CRUD "Аудитории занятий"
│           ├── lessons.ts                                               # CRUD "Занятия"
│           ├── lessonTypes.ts                                           # CRUD "Типы занятий"
│           ├── lookup.ts                                                # Получение одной строки таблицы по ID (для EntityTooltip)
│           ├── pairs.ts                                                 # CRUD "Пары"
│           ├── positions.ts                                             # CRUD "Должности"
│           ├── profiles.ts                                              # CRUD "Профили"
│           ├── schedule.ts                                              # Публичное API расписания (фильтры, список занятий)
│           ├── scheduleDisplay.ts                                       # Работа с отображаемым расписанием (drag-and-drop, буфер, флаги)
│           ├── scheduleOptimizer.ts                                     # Оптимизация расписания методом имитации отжига
│           ├── scheduleVersions.ts                                      # Управление версиями расписания (сохранение, переключение, удаление)
│           ├── settings.ts                                              # Управление настройками (ключ-значение)
│           ├── specialties.ts                                           # CRUD "Специальности"
│           ├── students.ts                                              # CRUD "Студенты"
│           ├── studyGroups.ts                                           # CRUD "Учебные группы"
│           ├── unitRoots.ts                                             # CRUD "Корни юнитов"
│           ├── units.ts                                                 # CRUD "Юниты"
│           ├── unitTypes.ts                                             # CRUD "Типы юнитов"
│           ├── userManagement.ts                                        # Управление пользователями (персональный сброс логина и пароля, фильтрация по ролям)
│           ├── weeks.ts                                                 # CRUD "Недели"
│           ├── generations/                                             # Генераторы данных
│           │   ├── index.ts                                             # Объединение всех генераторов в один роутер
│           │   ├── assignClassrooms.ts                                  # Назначение аудиторий занятиям
│           │   ├── generateCredentials.ts                               # Генерация учётных записей преподавателей/студентов
│           │   ├── generateGroups.ts                                    # Генерация учебных групп
│           │   ├── generateLessons.ts                                   # Генерация занятий
│           │   ├── generateSchedule.ts                                  # Генерация расписания (жадный алгоритм)
│           │   ├── generateUnits.ts                                     # Генерация юнитов (потоки, группы, подгруппы)
│           │   └── helpers.ts                                            # Проверка открытия чистого листа расписания перед запуском генераторов
│           └── __tests__/                                                   # Unit‑тесты (Vitest)
│               ├── academicLoadTypes.test.ts                                # CRUD "Типы нагрузки"
│               ├── adminManagement.test.ts                                  # Назначение/снятие администраторов
│               ├── auth.test.ts                                             # Аутентификация (me, forgotPassword, changeEmail)
│               ├── batchDelete.test.ts                                      # Массовое удаление с проверкой зависимостей
│               ├── batchUpdateActive.test.ts                                # Массовое переключение активности
│               ├── buildings.test.ts                                        # CRUD "Корпуса"
│               ├── canMoveToSlot.test.ts                                    # Проверка конфликтов при работе оптимизатора
│               ├── checkSlots.test.ts                                       # Проверка конфликтов drag‑and‑drop
│               ├── classRooms.test.ts                                       # CRUD "Аудитории"
│               ├── controlTypes.test.ts                                     # CRUD "Типы контроля"
│               ├── crudImportExport.test.ts                                 # Импорт/экспорт одной таблицы (JSON)
│               ├── curriculum.test.ts                                       # CRUD "Учебные планы"
│               ├── curriculumProfiles.test.ts                               # CRUD "Профили учебных планов"
│               ├── daysOfWeek.test.ts                                       # CRUD "Дни недели"
│               ├── departments.test.ts                                      # CRUD "Кафедры"
│               ├── disciplines.test.ts                                      # CRUD "Дисциплины"
│               ├── disciplineTeachers.test.ts                               # CRUD "Преподаватели дисциплин"
│               ├── education.test.ts                                        # CRUD "Образование"
│               ├── educationForms.test.ts                                   # CRUD "Формы обучения"
│               ├── educationLevels.test.ts                                  # CRUD "Уровни образования"
│               ├── employees.test.ts                                        # CRUD "Сотрудники"
│               ├── employeesDepartments.test.ts                             # CRUD "Сотрудники кафедр"
│               ├── employmentTypes.test.ts                                  # CRUD "Типы занятости"
│               ├── generateCredentials.test.ts                              # Тесты генератора учётных записей
│               ├── generators-logic.test.ts                                 # Логика работы генераторов (групп, юнитов, занятий)
│               ├── generators.test.ts                                       # Последовательный вызов генераторов
│               ├── globalImportExport.test.ts                               # Глобальный импорт/экспорт всей БД
│               ├── hourTypeMapping.test.ts                                  # CRUD "Соответствие типов часов"
│               ├── institutes.test.ts                                       # CRUD "Институты"
│               ├── lessons.test.ts                                          # CRUD "Занятия"
│               ├── lessonTypes.test.ts                                      # CRUD "Типы занятий"
│               ├── lookup.test.ts                                           # Получение записи по ID (EntityTooltip)
│               ├── pairs.test.ts                                            # CRUD "Пары"
│               ├── password.test.ts                                         # Тесты утилит паролей и транслитерации
│               ├── positions.test.ts                                        # CRUD "Должности"
│               ├── profiles.test.ts                                         # CRUD "Профили"
│               ├── safeDelete.test.ts                                       # Тесты безопасного удаления
│               ├── schedule.test.ts                                         # Публичное API расписания
│               ├── scheduleDisplay.test.ts                                  # Тест ручных перемещений занятий в расписании
│               ├── scheduleOptimizer.test.ts                                # Тестирование оптимизатора на основной функционал
│               ├── scheduleVersions.test.ts                                 # Тесты версионирования расписания
│               ├── settings.test.ts                                         # Управление настройками (ключ-значение)
│               ├── specialties.test.ts                                      # CRUD "Специальности"
│               ├── students.test.ts                                         # CRUD "Студенты"
│               ├── studyGroups.test.ts                                      # CRUD "Учебные группы"
│               ├── unitRoots.test.ts                                        # CRUD "Корни юнитов"
│               ├── units.test.ts                                            # CRUD "Юниты"
│               ├── unitTypes.test.ts                                        # CRUD "Типы юнитов"
│               ├── userManagement.test.ts                                   # Управление пользователями (сброс логина и пароля)
│               └── weeks.test.ts                                            # CRUD "Недели"
│
├── test/                                                                # Тестовая инфраструктура
│   ├── helpers.ts                                                       # Хелперы: очистка таблиц, создание тестовых сущностей
│   ├── setup.ts                                                         # Глобальная настройка тестов (env, мок next/headers)
│   ├── trpc.ts                                                          # Создание тестового tRPC-клиента с моковой сессией
│   └── fixtures/
│       └── fixtures.ts                                                  # Полные фикстуры: очистка БД и заполнение тестовыми данными
│
├── trpc/                                                                # tRPC-клиент для фронтенда
│   ├── client.ts                                                        # Создание React-клиента (createTRPCReact)
│   └── provider.tsx                                                     # Провайдер tRPC + React Query (QueryClient, httpBatchLink)
│
└── types/                                                               # Дополнительные декларации типов
    ├── better-auth.d.ts                                                 # Расширение типов для better-auth
    └── css.d.ts                                                         # Декларация для CSS-модулей (если используются)

Корневые файлы:
├── .env                                                                 # Переменные окружения (нужно создать вручную)
├── .env.example                                                         # Шаблон переменных окружения для разработчиков
├── .env.test                                                            # Переменные окружения для тестовой среды (нужно создать вручную)
├── .gitignore                                                           # Список файлов/папок, игнорируемых Git
├── drizzle.config.ts                                                    # Конфигурация Drizzle ORM (подключение к БД, схема)
├── eslint.config.js                                                     # Конфиг ESLint (для линтинга JavaScript/TypeScript)
├── eslint.config.mjs                                                    # Альтернативный конфиг ESLint в формате ES-модуля
├── LICENSE                                                              # Лицензионное соглашение проекта
├── next.config.ts                                                       # Конфигурация Next.js (App Router, webpack, и т.д.)
├── package-lock.json                                                    # Фиксация точных версий зависимостей (npm)
├── package.json                                                         # Список зависимостей и скриптов проекта
├── postcss.config.mjs                                                   # Конфигурация PostCSS (для Tailwind CSS)
├── README.md                                                            # Документация проекта (описание, установка, запуск)
├── tailwind.config.ts                                                   # Конфигурация Tailwind CSS (темы, плагины)
├── tsconfig.json                                                        # Настройки компилятора TypeScript
└── vitest.config.mts                                                    # Конфигурация Vitest (unit-тесты, окружение)
```

### 12. 🗄️ Схема базы данных
Вы можете ознакомиться со структурой базы данных по этой схеме:

```mermaid
erDiagram
  users {
    text id PK
    text name
    text email UK
    boolean emailVerified
    text image
    role role
    timestamp createdAt
    timestamp updatedAt
    text hashedPassword
  }

  sessions {
    text id PK
    text userId FK
    text token UK
    timestamp expiresAt
    text ipAddress
    text userAgent
    timestamp createdAt
    timestamp updatedAt
  }

  accounts {
    text id PK
    text userId FK
    text providerId
    text accountId
    text refreshToken
    text accessToken
    timestamp expiresAt
    text password
    timestamp createdAt
    timestamp updatedAt
  }
  note for accounts "UNIQUE(providerId, accountId)"

  verificationTokens {
    text id PK
    text identifier
    text token UK
    timestamp expires
    timestamp createdAt
  }

  scheduleVersions {
    serial id PK
    text name
    timestamp created_at
  }

  institutes {
    serial id PK
    integer university_code UK
    text name
    integer director_id FK
    boolean is_active
  }

  buildings {
    serial id PK
    integer number UK
    boolean is_active
  }

  unitTypes {
    serial id PK
    text name UK
    integer max_size
    integer priority_lecture
    integer priority_workshop
    integer priority_guided_study
    integer priority_lab
    boolean is_active
  }

  lessonTypes {
    serial id PK
    text name UK
    text abbreviation UK
    boolean is_active
  }

  hourTypeMapping {
    serial id PK
    text plan_hour_column UK
    text priority_column
    integer lesson_type_id FK
    boolean is_active
  }

  departments {
    serial id PK
    text name
    text abbreviation UK
    integer institute_id FK
    integer department_code UK
    integer head_id FK
    boolean is_active
  }

  specialties {
    serial id PK
    text code UK
    text name
    integer department_id FK
    boolean is_active
  }

  profiles {
    serial id PK
    text name
    text abbreviation
    integer specialty_id FK
    text letter_code
    integer education_id FK
    boolean is_active
  }
  note for profiles "UNIQUE(letter_code, specialty_id)"

  disciplines {
    serial id PK
    text name
    text abbreviation
    integer department_id FK
    boolean is_active
  }

  employees {
    serial id PK
    text surname
    text name
    text patronymic
    text user_id UK
    boolean is_active
    boolean is_admin
  }

  studyGroups {
    serial id PK
    text code UK
    integer profile_id FK
    integer course
    integer student_count
    integer curator_id FK
    boolean is_active
  }

  students {
    serial id PK
    text surname
    text name
    text patronymic
    integer admission_year
    integer profile_id FK
    integer study_group_id FK
    integer course
    text user_id UK
    boolean is_active
  }

  educationLevels {
    serial id PK
    text name UK
    text abbreviation
    boolean is_active
  }

  educationForms {
    serial id PK
    text name UK
    text abbreviation
    boolean is_active
  }

  education {
    serial id PK
    integer level_id FK
    integer form_id FK
    integer duration_months
    boolean is_active
  }
  note for education "UNIQUE(level_id, form_id)"

  academicLoadTypes {
    serial id PK
    text name
    text abbreviation
    boolean is_active
  }

  controlTypes {
    serial id PK
    text name
    text abbreviation
    boolean is_active
  }

  curriculum {
    serial id PK
    integer course
    integer semester
    integer discipline_id FK
    integer hours_lecture
    integer hours_guided_study
    integer hours_workshop
    integer hours_lab
    integer additional_task_id FK
    integer control_type_id FK
    boolean is_active
  }

  curriculumProfiles {
    serial id PK
    integer curriculum_id FK
    integer profile_id FK
    boolean is_active
  }
  note for curriculumProfiles "UNIQUE(curriculum_id, profile_id)"

  employeesDepartments {
    serial id PK
    integer employee_id FK
    integer department_id FK
    integer employment_type_id FK
    integer position_id FK
    boolean is_active
  }
  note for employeesDepartments "UNIQUE(employee_id, department_id)"

  disciplineTeachers {
    serial id PK
    integer lesson_type_id FK
    integer discipline_id FK
    integer teacher_department_id FK
    boolean is_active
  }

  classrooms {
    serial id PK
    integer building_id FK
    text room_number
    integer capacity
    integer department_id FK
    integer priority_lecture
    integer priority_workshop
    integer priority_guided_study
    integer priority_lab
    integer usage_metric
    boolean is_active
  }

  units {
    serial id PK
    text code
    integer unit_type_id FK
    integer version_id FK
    boolean is_active
  }
  note for units "Частичный уникальный индекс на (code) WHERE is_active = true"

  unitRoots {
    serial id PK
    text unit_code
    integer study_group_id FK
    integer version_id FK
    boolean is_active
  }
  note for unitRoots "Частичный уникальный индекс на (unit_code, study_group_id) WHERE is_active = true"

  lessons {
    serial id PK
    integer curriculum_id FK
    integer unit_id FK
    integer lesson_type_id FK
    integer discipline_id FK
    integer teacher_id FK
    integer count_per_semester
    integer version_id FK
    boolean is_active
  }

  lessonClassrooms {
    serial id PK
    integer lesson_id FK
    integer classroom_id FK
    integer version_id FK
    boolean is_active
  }
  note for lessonClassrooms "UNIQUE(lesson_id, classroom_id)"

  daysOfWeek {
    serial id PK
    text name
    boolean is_active
  }

  pairs {
    serial id PK
    integer number
    boolean is_active
  }

  weeks {
    serial id PK
    text type
    boolean is_active
  }

  schedule {
    serial id PK
    integer week_number FK
    integer day_of_week_id FK
    integer pair_number_id FK
    integer lesson_id FK
    integer classroom_id FK
    integer merge_flag
    integer position_flag
    integer classroom_flag
    integer version_id FK
    boolean is_active
  }

  scheduleDisplay {
    serial id PK
    integer lesson_id FK
    integer week_number FK
    integer day_of_week_id FK
    integer pair_number_id FK
    text unit_code
    text display_text
    integer merge_number
    boolean position_flag
    boolean classroom_flag
    integer classroom_id FK
    boolean is_buffered
    integer version_id FK
    boolean is_active
  }

  settings {
    serial id PK
    text key UK
    text value
    timestamp created_at
    timestamp updated_at
  }

  positions {
    serial id PK
    text name UK
    text abbreviation
    boolean is_active
  }

  employmentTypes {
    serial id PK
    text name UK
    text abbreviation
    boolean is_active
  }

  %% связи
  users ||--o{ sessions : userId
  users ||--o{ accounts : userId
  users ||--|| employees : user_id
  users ||--|| students : user_id
  scheduleVersions ||--o{ units : version_id
  scheduleVersions ||--o{ unitRoots : version_id
  scheduleVersions ||--o{ lessons : version_id
  scheduleVersions ||--o{ lessonClassrooms : version_id
  scheduleVersions ||--o{ schedule : version_id
  scheduleVersions ||--o{ scheduleDisplay : version_id
  institutes }o--|| employees : director_id
  institutes ||--o{ departments : institute_id
  buildings ||--o{ classrooms : building_id
  unitTypes ||--o{ units : unit_type_id
  lessonTypes ||--o{ hourTypeMapping : lesson_type_id
  lessonTypes ||--o{ lessons : lesson_type_id
  lessonTypes ||--o{ disciplineTeachers : lesson_type_id
  departments }o--|| institutes : institute_id
  departments }o--|| employees : head_id
  departments ||--o{ specialties : department_id
  departments ||--o{ disciplines : department_id
  departments ||--o{ employeesDepartments : department_id
  departments ||--o{ classrooms : department_id
  specialties ||--o{ profiles : specialty_id
  profiles }o--|| specialties : specialty_id
  profiles }o--|| education : education_id
  profiles ||--o{ studyGroups : profile_id
  profiles ||--o{ students : profile_id
  profiles ||--o{ curriculumProfiles : profile_id
  disciplines ||--o{ curriculum : discipline_id
  disciplines ||--o{ disciplineTeachers : discipline_id
  employees ||--o{ studyGroups : curator_id
  employees ||--o{ employeesDepartments : employee_id
  studyGroups ||--o{ students : study_group_id
  studyGroups ||--o{ unitRoots : study_group_id
  educationLevels ||--o{ education : level_id
  educationForms ||--o{ education : form_id
  education ||--o{ profiles : education_id
  curriculum }o--|| disciplines : discipline_id
  curriculum }o--|| academicLoadTypes : additional_task_id
  curriculum }o--|| controlTypes : control_type_id
  curriculum ||--o{ curriculumProfiles : curriculum_id
  curriculum ||--o{ lessons : curriculum_id
  curriculumProfiles }o--|| curriculum : curriculum_id
  curriculumProfiles }o--|| profiles : profile_id
  employeesDepartments ||--o{ disciplineTeachers : teacher_department_id
  employeesDepartments }o--|| employees : employee_id
  employeesDepartments }o--|| departments : department_id
  employeesDepartments }o--|| employmentTypes : employment_type_id
  employeesDepartments }o--|| positions : position_id
  disciplineTeachers }o--|| lessonTypes : lesson_type_id
  disciplineTeachers }o--|| disciplines : discipline_id
  disciplineTeachers }o--|| employeesDepartments : teacher_department_id
  classrooms }o--|| buildings : building_id
  classrooms }o--|| departments : department_id
  units }o--|| unitTypes : unit_type_id
  units }o--|| scheduleVersions : version_id
  unitRoots }o--|| studyGroups : study_group_id
  unitRoots }o--|| units : "unit_code -> code (не FK)"
  lessons }o--|| curriculum : curriculum_id
  lessons }o--|| units : unit_id
  lessons }o--|| lessonTypes : lesson_type_id
  lessons }o--|| disciplines : discipline_id
  lessons }o--|| employeesDepartments : teacher_id
  lessons }o--|| scheduleVersions : version_id
  lessonClassrooms ||--o| lessons : lesson_id
  lessonClassrooms ||--o| classrooms : classroom_id
  schedule }o--|| weeks : week_number
  schedule }o--|| daysOfWeek : day_of_week_id
  schedule }o--|| pairs : pair_number_id
  schedule }o--|| lessons : lesson_id
  schedule }o--|| classrooms : classroom_id
  schedule }o--|| scheduleVersions : version_id
  scheduleDisplay }o--|| lessons : lesson_id
  scheduleDisplay }o--|| weeks : week_number
  scheduleDisplay }o--|| daysOfWeek : day_of_week_id
  scheduleDisplay }o--|| pairs : pair_number_id
  scheduleDisplay }o--|| classrooms : classroom_id
  scheduleDisplay }o--|| scheduleVersions : version_id
```
или по этой ссылке: [![Схема базы данных](https://dbdiagram.io/d/PP-NextJS-6a107420dfb20dafcdd05b8a/export/png)](https://dbdiagram.io/d/PP-NextJS-6a107420dfb20dafcdd05b8a).

### 13. Схема tRPC-маршрутов
Ниже представлена сводная таблица всех tRPC-процедур, сгруппированная по функциональным модулям. Она отражает финальную реализацию проекта.

### 🗄️ CRUD-роутеры справочных таблиц
| Роутер | Метод | Тип | Доступ |
|--------|-------|-----|--------|
| `institutes`, `buildings`, `departments`, `specialties`, `profiles`, `disciplines`, `employees`, `students`, `studyGroups`, `units`, `unitRoots`, `lessons`, `lessonClassrooms`, `classrooms`, `curriculum`, `curriculumProfiles`, `academicLoadTypes`, `controlTypes`, `hourTypeMapping`, `employeesDepartments`, `disciplineTeachers`, `daysOfWeek`, `pairs`, `weeks`, `educationLevels`, `educationForms`, `education`, `positions`, `employmentTypes`, `unitTypes`, `lessonTypes` | `list` | query | `admin` |
| | `create` | mutation | `admin` |
| | `update` | mutation | `admin` |
| | `get` | query | `admin` |
| | `delete` | mutation | `admin` |

____

### ⚙️ Специализированные роутеры
| Роутер | Процедура | Доступ | Описание |
|--------|-----------|--------|----------|
| `auth` | `me` | `protected` | Получить текущего пользователя |
| | `setup` | `public` | Создать первого администратора (только если БД пуста) |
| | `canSetup` | `public` | Проверить, можно ли регистрироваться |
| | `forgotPassword` | `public` | Отправить токен сброса пароля на email |
| | `resetPassword` | `public` | Сбросить пароль по токену |
| | `changeEmail` | `protected` | Сменить email (логин) текущего пользователя |
| | `changePassword` | `protected` | Сменить пароль текущего пользователя |
| `adminManagement` | `listEmployeesWithAdminFlag` | `admin` | Список сотрудников с флагом админа |
| | `toggleAdmin` | `admin` | Назначить/снять роль администратора |
| `userManagement` | `getUsers` | `admin` | Список пользователей с фильтрацией по роли |
| | `resetUserPassword` | `admin` | Сбросить логин и пароль пользователю |
| `batchDelete` | `deleteMany` | `admin` | Массовое удаление записей (с проверкой зависимостей) |
| `batchUpdateActive` | `updateMany` | `admin` | Массовая активация/деактивация записей |
| `crudImportExport` | `exportAll` | `admin` | Экспорт одной таблицы в JSON |
| | `importData` | `admin` | Импорт данных в таблицу из JSON |
| `globalImportExport` | `exportAll` | `admin` | Экспорт всей БД в JSON |
| | `importAll` | `admin` | Импорт всей БД из JSON (с валидацией) |
| `lookup` | `getRow` | `protected` | Получить строку таблицы по ID (для EntityTooltip) |
| `settings` | `get` | `admin` | Получить значение настройки (веса штрафов и т.д.) |
| | `update` | `admin` | Обновить значение настройки |
| `e2eTestHelpers` | `resetAndSeed` | `admin`* | Сбросить БД и наполнить тестовыми данными (только для тестов) |

___

### 🗓️ Работа с расписанием
| Роутер | Процедура | Доступ | Описание |
|--------|-----------|--------|----------|
| `schedule` | `getSchedule` | `public` | Получить расписание с фильтрами (публичное API) |
| | `filters` | `public` | Получить доступные фильтры для расписания |
| `scheduleDisplay` | `getForWeekPair` | `admin` | Расписание «По юнитам» (для drag‑and‑drop) |
| | `getByGroup` | `admin` | Расписание для одной группы |
| | `getByStudyGroups` | `admin` | Расписание «По группам» |
| | `getBuffer` | `admin` | Занятия, находящиеся в буфере |
| | `getBufferedCount` | `admin` | Количество занятий в буфере |
| | `moveToBuffer` | `admin` | Переместить занятие в буфер |
| | `moveFromBuffer` | `admin` | Вернуть занятие из буфера |
| | `checkSlots` | `admin` | Проверить слоты для drag‑and‑drop |
| | `move` | `admin` | Переместить занятие в свободный слот |
| | `swap` | `admin` | Обменять два занятия местами |
| | `updateFlags` | `admin` | Изменить флаги занятия (merge, position, classroom) |
| | `optimizeSchedule` | `admin` | Запустить оптимизацию (имитация отжига). При включённом чекбоксе «Использовать буфер» буферные занятия автоматически размещаются в расписании (с возможностью вытеснения конфликтующих) |
| | `resetFlags` | `admin` | Массовый сброс флагов для всех занятий |
| `scheduleVersions` | `list` | `admin` | Список сохранённых версий расписания |
| | `switchToVersion` | `admin` | Переключиться на другую версию |
| | `saveActive` | `admin` | Сохранить текущее расписание как новую версию |
| | `delete` | `admin` | Удалить версию |
| | `update` | `admin` | Переименовать версию |


___

### 🔧 Генераторы (роутер `generations`)
| Процедура | Доступ | Описание |
|-----------|--------|----------|
| `generateGroups` | `admin` | Генерация учебных групп на основе профилей |
| `generateUnits` | `admin` | Генерация юнитов (потоки, группы, подгруппы) |
| `generateLessons` | `admin` | Генерация занятий на основе учебных планов |
| `assignClassroomsAuto` | `admin` | Автоматическое назначение аудиторий для занятий |
| `generateSchedule` | `admin` | Генерация расписания жадным алгоритмом (без сохранения версии) |
| `generateAndSaveSchedule` | `admin` | Генерация расписания + создание новой версии |
| `generateCredentials` | `admin` | Генерация логинов и паролей для студентов/преподавателей |
| `clearAllCredentials` | `admin` | Сброс всех учётных данных (логинов и паролей) |

___

### 14. 🔑 Аутентификация и безопасность
* Вход осуществляется по логину и паролю (логином является почта). Такой подход позволяет централизованно хранить и проверять логины на уникальность.
* Первичная регистрация доступна только в том случае, если в базе нет ни одной записи для аутентификации с ролью ```admin```. Если есть хотя бы одна такая запись - регистрация будет недоступна. Это сделано осознанно дабы исключить несанкционированный доступ в систему. Другие пользователи могут попасть в систему только после того как администратор физически добавит пользователя в базу и сгенерирует для него логин и пароль. 
* При генерации логина используется несуществующий домен что исключает дублирование с реальными почтовыми адресами. После входа в свой аккаунт пользователь может сменить сгенерированный логин на любой по своему усмотрению (пока реализовано только в панели администратора).
* Все административные процедуры защищены через adminProcedure.

* Пароли хэшируются с помощью bcryptjs.

* Сессии хранятся в httpOnly cookie (установлено по умолчанию better-auth), что предотвращает XSS‑атаки.

* При попытке удалить запись, на которую ссылаются другие таблицы, пользователь видит тост с понятным сообщением.

### 15. Инструкция пользователя ИС
На панели администратора вы можете ознакомиться с инструкцией администратора ИС, где описаны возможные действия с интерфейсом.

### 16. 🩺 Возможные проблемы и их решение
* Ошибка подключения к БД – проверьте DATABASE_URL и доступность PostgreSQL.

* Письма не отправляются – убедитесь, что Mailpit запущен и адрес [http://localhost:8025](http://localhost:8025) доступен. Для продакшена настройте реальный SMTP.

* Тесты падают с ошибками уникальности – выполните npm run test:db:push для тестовой БД и убедитесь, что в .env.test указана правильная строка подключения.
