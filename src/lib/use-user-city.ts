/**
 * useUserCity — глобальное состояние «текущего города пользователя» с
 * жизненным циклом инициализации.
 *
 * Подход скопирован из Ingush-Business `CityContext`:
 *
 *   1. Читать из AsyncStorage (Zustand persist) — мгновенно при mount.
 *   2. Если cityId всё ещё default (нет сохранённого выбора) — спросить
 *      геолокацию устройства.
 *   3. Получить coords → `getNearestCity(lat, lng)` (Haversine, threshold 30км).
 *   4. Если до ближайшего города > 30км — fallback на `DEFAULT_CITY_ID`.
 *   5. После выбора пользователем через CitySelector → setCity() автоматически
 *      сохранит в AsyncStorage (Zustand persist).
 *
 * **Геолокация:**
 *   - Web — `navigator.geolocation.getCurrentPosition()` (browser-API).
 *   - Native — пока no-op (TODO: установить `expo-location` и заменить).
 *     При установке: import { getCurrentPositionAsync } from "expo-location"
 *     и заменить `getDeviceCoordinates` ниже. См. TASKS.md follow-up.
 *
 * **API:**
 *   const { cityId, cityName, setCity, isInitialized } = useUserCity();
 *
 * **Семантика cityId:**
 *   - валидный id из MAJOR_CITIES (8 поселений) — конкретный город
 *   - "all" — «Вся Ингушетия» (без привязки)
 *   - default (`nazran-magas`, «Назрань · Магас») при первом запуске до завершения init.
 *     После миграции 0051 раздельные `nazran`/`magas` помечены `hiddenInPicker` —
 *     юзер их не выбирает руками, но старые persisted значения автомиграцией
 *     (migrate v3→v4 в zustand persist) приводятся к паре.
 */

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  ALL_INGUSHETIA_CITY_ID,
  DEFAULT_CITY_ID,
  getCityName as _getCityName,
  getNearestCity,
  normalizeCityId,
} from "@/lib/location-config";
import { storage } from "@/lib/storage";

interface CityState {
  cityId: string;
  /** Был ли init-цикл (AsyncStorage + geolocation) пройден. False — UI может
   *  показать skeleton; true — можно показывать конкретное значение. */
  isInitialized: boolean;
  /** True если cityId пришёл из user-выбора (CitySelector), а не из geo / default.
   *  Если false — это значит «init ещё не сделал явный выбор, юзер не подтверждал». */
  isUserChoice: boolean;
  setCity: (id: string) => void;
  _markInitialized: (cityId: string, isUserChoice: boolean) => void;
}

/** Zustand store с persist через @/lib/storage (SecureStore on native /
 *  localStorage on web). Ключ `xtrud-city` сохранён для обратной совместимости
 *  со старым CitySelector. Bumped version 2 → 3 (поля isInitialized, isUserChoice). */
export const useCityStore = create<CityState>()(
  persist(
    (set) => ({
      cityId: DEFAULT_CITY_ID,
      isInitialized: false,
      isUserChoice: false,
      setCity: (id) =>
        set({
          cityId: normalizeCityId(id),
          isInitialized: true,
          isUserChoice: true,
        }),
      _markInitialized: (cityId, isUserChoice) =>
        set({ cityId: normalizeCityId(cityId), isInitialized: true, isUserChoice }),
    }),
    {
      name: "xtrud-city",
      version: 4,
      storage: createJSONStorage(() => storage),
      // Партиализация: НЕ персистим isInitialized (всегда false при cold start —
      // переинициализируем). Сохраняем только cityId + isUserChoice (последний
      // показывает, делал ли юзер явный выбор когда-либо).
      partialize: (state) => ({
        cityId: state.cityId,
        isUserChoice: state.isUserChoice,
      }),
      // Миграция v3 → v4: старые persisted cityId='nazran' / 'magas' пришли
      // из эпохи до миграции 0051 (когда раздельные Назрань и Магас были
      // top-level в picker'е). Сейчас единая опция «Назрань · Магас»,
      // нормализуем automatically чтобы пользователь не видел старое значение
      // в header pill после deploy.
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<CityState>;
        if (version < 4 && typeof state.cityId === "string") {
          return { ...state, cityId: normalizeCityId(state.cityId) };
        }
        return state;
      },
    },
  ),
);

// ============================================================================
// Geolocation utility — web через navigator.geolocation, native заглушка.
// ============================================================================

/** Получить координаты устройства. Возвращает null если:
 *   - API недоступен (native без expo-location)
 *   - Пользователь отказал в permission
 *   - Timeout (5s) или другая ошибка
 *
 *  Не выбрасывает исключений — caller просто использует fallback на DEFAULT_CITY. */
async function getDeviceCoordinates(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return null;
    }
    return new Promise((resolve) => {
      let resolved = false;
      const settle = (value: { lat: number; lng: number } | null) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };
      const timer = setTimeout(() => settle(null), 5000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          settle({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          settle(null);
        },
        { timeout: 5000, maximumAge: 60_000, enableHighAccuracy: false },
      );
    });
  }

  // TODO native: установить expo-location и заменить:
  //   import * as Location from "expo-location";
  //   const { status } = await Location.requestForegroundPermissionsAsync();
  //   if (status !== "granted") return null;
  //   const pos = await Location.getCurrentPositionAsync({});
  //   return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  return null;
}

// ============================================================================
// Hook
// ============================================================================

interface UseUserCityResult {
  /** Текущий cityId из MAJOR_CITIES, или "all" для «Вся Ингушетия». */
  cityId: string;
  /** Человеко-читаемое имя для UI (getCityName из location-config). */
  cityName: string;
  /** True после первой попытки инициализации (AsyncStorage + geo). */
  isInitialized: boolean;
  /** True если cityId пришёл из явного выбора пользователя. */
  isUserChoice: boolean;
  /** Установить cityId (пользовательский выбор) + persist в AsyncStorage. */
  setCity: (id: string) => void;
}

export function useUserCity(): UseUserCityResult {
  const cityId = useCityStore((s) => s.cityId);
  const isInitialized = useCityStore((s) => s.isInitialized);
  const isUserChoice = useCityStore((s) => s.isUserChoice);
  const setCity = useCityStore((s) => s.setCity);
  const markInitialized = useCityStore((s) => s._markInitialized);

  // Bootstrap: при mount если не было user-выбора — попробовать geolocation.
  // Если был — пропустить geolocation и сразу пометить initialized.
  useEffect(() => {
    if (isInitialized) return;

    if (isUserChoice) {
      // Уже есть сохранённый user-выбор — просто mark initialized без geo.
      markInitialized(cityId, true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const coords = await getDeviceCoordinates();
      if (cancelled) return;
      if (coords) {
        const nearest = getNearestCity(coords.lat, coords.lng);
        markInitialized(nearest, false); // geo-результат, не user-choice
      } else {
        markInitialized(DEFAULT_CITY_ID, false); // fallback
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isInitialized, isUserChoice, cityId, markInitialized]);

  return {
    cityId,
    cityName: _getCityName(cityId),
    isInitialized,
    isUserChoice,
    setCity,
  };
}

// ============================================================================
// Legacy / compat exports — для не-обновлённых импортеров.
// Удалить после полного rewrite потребителей `getCityName` и `useCityStore`
// в импорт прямо из location-config / use-user-city.
// ============================================================================

/** @deprecated Импортировать `getCityName` из `@/lib/location-config`. */
export const getCityName = _getCityName;

/** Сахар для не-React контекста (e.g. в API-обёртках). */
export function getCurrentCityIdSync(): string {
  return useCityStore.getState().cityId;
}

/** Семантический «вся Ингушетия» — для случаев когда нужно сбросить фильтр. */
export function setAllIngushetia(): void {
  useCityStore.getState().setCity(ALL_INGUSHETIA_CITY_ID);
}
