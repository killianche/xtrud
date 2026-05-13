/**
 * LoginWall — bottom-sheet с предложением войти, для анон-flow (just-in-time login).
 *
 * Использование: оборачиваешь действие (создание заказа, отправка сообщения, отзыв)
 * и при попытке его выполнить анонимом — открывается шторка с кнопкой «Войти».
 *
 *   const wall = useLoginWall();
 *   <Button onPress={() => wall.guard(() => doAction())}>Действие</Button>
 *   {wall.sheet}
 *
 * Или ручной режим:
 *   <LoginWall open={open} onClose={() => setOpen(false)} reason="чтобы оставить отзыв" />
 *
 * После логина user возвращается на эту страницу (router push сохраняет URL).
 */

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Illustration } from "@/components/Illustration";
import { BottomSheet, Button } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";

export interface LoginWallProps {
  open: boolean;
  onClose: () => void;
  /** Текст причины: "чтобы создать заказ", "чтобы написать сообщение". */
  reason?: string;
}

export function LoginWall({ open, onClose, reason }: LoginWallProps) {
  const router = useRouter();

  const handleLogin = () => {
    onClose();
    router.push("/(auth)/phone" as never);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Войдите чтобы продолжить"
      subtitle={reason ?? "Регистрация занимает 30 секунд по номеру телефона."}
    >
      {/* Doodle-иллюстрация сверху — сигнал «лёгкое приглашение, не блокер».
          levitate = парящий персонаж, подходит «всё легко». */}
      <View className="items-center mt-1 mb-2">
        <Illustration name="levitate" size={120} className="text-ink" />
      </View>
      <View className="gap-3 mt-2">
        <Button size="lg" fullWidth onPress={handleLogin}>
          Войти по телефону
        </Button>
        <Button size="md" variant="ghost" fullWidth onPress={onClose}>
          Не сейчас
        </Button>
      </View>
    </BottomSheet>
  );
}

/**
 * Хук-обёртка: guard выполняет action только если есть session, иначе открывает sheet.
 *
 *   const wall = useLoginWall("чтобы написать мастеру");
 *   <Button onPress={() => wall.guard(() => router.push('/orders/new'))} />
 *   {wall.sheet}
 */
export function useLoginWall(reason?: string) {
  const { session } = useAuthSession();
  const isAuth = !!session?.user?.id;
  const [open, setOpen] = useState(false);

  const guard = useCallback(
    (action: () => void) => {
      if (isAuth) {
        action();
      } else {
        setOpen(true);
      }
    },
    [isAuth],
  );

  return {
    /** Тру если пользователь залогинен — для условного render. */
    isAuth,
    /** Запускает action или открывает шторку. */
    guard,
    /** JSX для рендеринга — обязательно положить в дерево. */
    sheet: <LoginWall open={open} onClose={() => setOpen(false)} reason={reason} />,
  };
}
