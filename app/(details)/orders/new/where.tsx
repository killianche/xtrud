// Шаг создания задания «Где» — настоящий маршрут Stack, как и остальные
// шаги: «назад» и свайп от края делают один POP, черновик сохраняется.
import { NewOrderScreen } from "../new";

export default function NewOrderWhereRoute() {
  return <NewOrderScreen screenPhase="where" />;
}
