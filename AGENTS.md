# AGENTS.md

Короткая точка входа для любого AI-агента в xtrud. Этот файл намеренно не
дублирует продуктовую, дизайн- и эксплуатационную документацию.

## Обязательный порядок чтения

До любых действий прочитай полностью:

1. [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) — приоритет источников,
   Git-процесс, версии и release-контракт.
2. Верхний актуальный блок [`STATUS.md`](STATUS.md) — состояние и блокеры.
3. [`.claude/rules/working-rules.md`](.claude/rules/working-rules.md) — правила
   выполнения и отчётности.
4. Для крупной задачи —
   [`.claude/rules/agent-delegation.md`](.claude/rules/agent-delegation.md).

Затем читай только профильные источники из таблицы ниже.

## Канонические источники

| Область | Читать перед работой |
|---|---|
| Текущая модель продукта | [`docs/SIMPLE_FLOW.md`](docs/SIMPLE_FLOW.md), [`PRODUCT_CONTEXT.md`](PRODUCT_CONTEXT.md) |
| Категории и product scope | [`src/lib/product-scope.ts`](src/lib/product-scope.ts), [`CATEGORIES_AND_PROFILES.md`](CATEGORIES_AND_PROFILES.md), [`docs/SERVICE_PRIORITY.md`](docs/SERVICE_PRIORITY.md) |
| UI и новый экран | [`UI_PATTERNS.md`](UI_PATTERNS.md), [`DESIGN.md`](DESIGN.md), [`CROSS_PLATFORM_RULES.md`](CROSS_PLATFORM_RULES.md), [`.claude/rules/design-quality.md`](.claude/rules/design-quality.md), [`.claude/rules/design-enforcement.md`](.claude/rules/design-enforcement.md) |
| UI-иконки | [`docs/UI_ICONS.md`](docs/UI_ICONS.md); новый mono UI — Phosphor |
| Аватары | [`src/lib/avatar.ts`](src/lib/avatar.ts): только реальное фото, иначе инициалы; любой DiceBear — legacy |
| Mobile-first release | [`docs/MOBILE_RELEASE_STRATEGY.md`](docs/MOBILE_RELEASE_STRATEGY.md), [`CROSS_PLATFORM_RULES.md`](CROSS_PLATFORM_RULES.md) |
| Web/mobile/backend и серверы | [`PROJECT_OPERATIONS.md`](PROJECT_OPERATIONS.md) |
| Стек и внешние сервисы | [`docs/EXTERNAL_DEPENDENCIES.md`](docs/EXTERNAL_DEPENDENCIES.md), [`docs/adr/0001-mobile-first-expo-and-beget-supabase.md`](docs/adr/0001-mobile-first-expo-and-beget-supabase.md) |
| Свой сервер вместо Supabase | [`docs/BACKEND_REWRITE_PLAN.md`](docs/BACKEND_REWRITE_PLAN.md), код — [`server/`](server/), клиент — [`src/lib/xtrud-client/`](src/lib/xtrud-client/) |
| Админка (веб и в приложении) | [`docs/ADMIN_PANEL.md`](docs/ADMIN_PANEL.md) |
| Setup и команды | [`README.md`](README.md), [`package.json`](package.json) |
| Что делаем дальше | [`TASKS.md`](TASKS.md) — актуальный план работ |

Если исторический текст внутри документа противоречит более новому явно
помеченному override или исполняемому коду, следуй порядку из
`docs/AGENT_WORKFLOW.md` и зафиксируй конфликт в отчёте.

## Непереговорные правила

- Рабочий проект существует только в `/root/projects/xtrud` на VDS (машина
  владельца не используется — см. `PROJECT_OPERATIONS.md`). Не создавай
  «актуальные копии» проекта в других каталогах.
- Commit, push и сборка в TestFlight после зелёного гейта — обычная работа
  (DECISION владельца 2026-09-04). Продуктовое и необратимое — удаление
  данных, подача версии в App Store, смена модели продукта, DNS — только по
  слову владельца.
- Не отменяй и не перезаписывай чужой dirty worktree. Перед правкой проверь
  `git status --short`; stage — только явными путями или через `git add -p`.
- Сервер Beget, App Store и база — производные внешние состояния, не место
  для редактирования исходников и не источник обратного копирования в Git.
- Для backend сначала нужен live read-only снимок и backup: цепочка миграций в
  репозитории пока не доказана как полный снимок production.
- Никогда не угадывай факты, значения конфигурации или внешнее состояние:
  проверь кодом/read-only источником либо явно зафиксируй `UNKNOWN` и закрой
  опасное действие. Правила доказательности — в `docs/AGENT_WORKFLOW.md`.
- Любая осмысленная product/architecture/UI/data/release-задача проходит совет
  ролей из `.claude/rules/agent-delegation.md`; автор не является единственным
  QA или финальным reviewer собственной работы.
- Для нового/изменённого UI обязательны профильные design-rules, обе темы и
  preview-проверка. Основной шрифт — системный, не Geist.
- Изображения шире 1200 px уменьши до `<=1200 px` перед визуальным чтением.
- После изменения agent-конфигурации запусти:
  `node scripts/governance/check-agent-config.mjs`.

## Codex-роли

`.codex/agents/*.toml` — только адаптеры. Они не должны копировать продуктовые
правила. Спецификация общей роли хранится в соответствующем tracked-файле
`.claude/agents/<role>.md`; актуальные правила xtrud всегда берутся из таблицы
выше. При конфликте проектные источники xtrud имеют приоритет над generic role.
