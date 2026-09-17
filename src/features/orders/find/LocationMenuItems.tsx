/**
 * Системное меню «Место» в шапке экранов поиска: «Вся Ингушетия», города и
 * районы, галочка у выбранного. Функция, а не компонент: Stack.Toolbar
 * разбирает только свои элементы напрямую.
 */

import { Stack } from "expo-router";
import type { LocationFilter } from "./use-location-filter";

export function LocationMenuItems(location: LocationFilter) {
  return (
    <Stack.Toolbar.Menu
      icon={location.active ? "mappin.circle.fill" : "mappin.and.ellipse"}
      title="Место"
      accessibilityLabel={`Место: ${location.label}`}
    >
      <Stack.Toolbar.MenuAction isOn={!location.active} onPress={location.selectAll}>
        Вся Ингушетия
      </Stack.Toolbar.MenuAction>
      <Stack.Toolbar.Menu inline title="Города">
        {location.cities.map((c) => (
          <Stack.Toolbar.MenuAction
            key={c.id}
            isOn={location.cityId === c.id}
            onPress={() => location.selectCity(c.id)}
          >
            {c.name}
          </Stack.Toolbar.MenuAction>
        ))}
      </Stack.Toolbar.Menu>
      <Stack.Toolbar.Menu inline title="Районы">
        {location.districts.map((d) => (
          <Stack.Toolbar.MenuAction
            key={d}
            isOn={location.district === d}
            onPress={() => location.selectDistrict(d)}
          >
            {d}
          </Stack.Toolbar.MenuAction>
        ))}
      </Stack.Toolbar.Menu>
    </Stack.Toolbar.Menu>
  );
}
