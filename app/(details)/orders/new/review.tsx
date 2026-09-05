// Шаг создания задания «Проверка и публикация» — настоящий маршрут Stack, как и остальные
// шаги: «назад» и свайп от края делают один POP, черновик сохраняется.
import { NewOrderScreen } from "../new";

export default function NewOrderReviewRoute() {
  return <NewOrderScreen screenPhase="review" />;
}
