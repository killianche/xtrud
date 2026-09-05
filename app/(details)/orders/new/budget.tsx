// Шаг создания задания «Бюджет» — настоящий маршрут Stack, как и остальные
// шаги: «назад» и свайп от края делают один POP, черновик сохраняется.
import { NewOrderScreen } from "../new";

export default function NewOrderBudgetRoute() {
  return <NewOrderScreen screenPhase="budget" />;
}
