/**
 * /orders/new/catalog — каталог разделов из подсказок первого экрана «Что
 * нужно сделать?» («Выбрать из списка», «Другая категория», №242).
 * Написанное уже сохранено названием; выбор подкатегории ведёт дальше, как
 * на первом экране.
 */

import { useRouter } from "expo-router";
import { CategoryCatalogStep } from "@/features/task-composer/CategoryCatalogStep";
import { useComposer } from "@/features/task-composer/composer-store";

export default function TaskCategoryCatalogScreen() {
  const router = useRouter();
  const composer = useComposer();
  if (!composer.ready) return null;
  return <CategoryCatalogStep onBack={() => router.back()} />;
}
