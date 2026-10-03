/**
 * /specialists/category?l1= — подразделы раздела (второй уровень каталога
 * «Специалистов»). Первая строка — все специалисты раздела (решение
 * владельца 2026-09-07), дальше подразделы; тап — /specialists/section.
 */

import { useRouter } from "expo-router";
import { SubcategoryScreen } from "@/features/categories/SubcategoryScreen";

export default function SpecialistsCategoryRoute() {
  const router = useRouter();
  return (
    <SubcategoryScreen
      allRow={{
        title: "Все специалисты раздела",
        onPress: (l1) => router.push({ pathname: "/specialists/section", params: { l1 } } as never),
      }}
      onPick={(l2) => router.push({ pathname: "/specialists/section", params: { l2 } } as never)}
    />
  );
}
