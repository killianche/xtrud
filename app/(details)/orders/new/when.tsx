// Шаг создания задания «Когда» — настоящий маршрут Stack, как и остальные
// шаги: «назад» и свайп от края делают один POP, черновик сохраняется.
import { NewOrderScreen } from "../new";

export default function NewOrderWhenRoute() {
  return <NewOrderScreen screenPhase="when" />;
}
