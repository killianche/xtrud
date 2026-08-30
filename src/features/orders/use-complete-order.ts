// useCompleteOrder — DEPRECATED. Используй useConfirmCompletion (T4/T5).
//
// Историческая точка входа для «клиент / мастер пометил completed». После
// расширения lifecycle (sprint 0073) логика разделена:
//   - Клиент закрывает работу → useConfirmCompletion (T4/T5)
//   - Мастер помечает «готово» → useMarkOrderDone (T8, awaiting_confirmation)
//   - Cron auto-confirm → T11 (без хука)
//
// Для backwards-compat этот хук теперь прокидывает в `confirm_completion` RPC
// (работает только для клиента; для мастера вернёт 42501 not_order_owner).

export type { ConfirmCompletionInput as CompleteOrderInput } from "./use-confirm-completion";
export { useConfirmCompletion as useCompleteOrder } from "./use-confirm-completion";
