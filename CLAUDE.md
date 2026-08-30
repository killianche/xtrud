# CLAUDE.md

Тонкий adapter для Claude Code. Единственная общая точка входа проекта —
[`AGENTS.md`](AGENTS.md); не дублируй здесь продуктовые или инфраструктурные
правила.

## Обязательный порядок

1. Прочитай полностью [`AGENTS.md`](AGENTS.md).
2. Затем прочитай [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) и верхний
   актуальный блок [`STATUS.md`](STATUS.md).
3. Открой только профильные документы, перечисленные в `AGENTS.md` для текущей
   задачи.
4. Соблюдай [`.claude/rules/working-rules.md`](.claude/rules/working-rules.md),
   а для крупной задачи —
   [`.claude/rules/agent-delegation.md`](.claude/rules/agent-delegation.md).

## Важное

- Не считай этот файл самостоятельным источником модели продукта, deploy или
  версий: эти факты намеренно вынесены в канонические документы.
- Не commit, push, deploy, EAS submit и не меняй Supabase/VPS без явной команды
  владельца.
- Не создавай другую «актуальную копию» проекта и не перезаписывай чужой dirty
  worktree.
- При конфликте документов применяй приоритет из
  [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md), а не выбирай наугад.
