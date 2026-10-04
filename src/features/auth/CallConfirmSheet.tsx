/**
 * Подтверждение номера обратным звонком — системная шторка iOS (№209,
 * 2026-10-04).
 *
 * Владелец выбрал обратный звонок SMS.ru: входящие звонки от компаний
 * операторы режут, а исходящий звонок человека — нет
 * (docs/PHONE_CALL_VERIFICATION_2026-10.md). На экране одно действие —
 * «Позвонить» на бесплатный номер; звонок сбрасывается сам, приложение
 * само узнаёт, что он был (опрос раз в 3 с и сразу по возврату). Звонить нужно с того номера, что человек ввёл, —
 * это сказано прямо, с самим номером.
 *
 * Использование: const call = useCallConfirm(); … const token = await
 * call.confirm(phone, purpose); {call.sheet} — в разметке экрана. Результат —
 * одноразовое подтверждение номера для этой цели (регистрация, «Забыли
 * пароль?», смена номера — №209, №215, №220), null — отмена.
 */

import { CheckCircle, Phone, X } from "phosphor-react-native";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/use-theme-color";
import { SUPPORT_URL } from "./BannedScreen";
import { formatRuPhone } from "./RegisterFormFields";

// Раз в 3 с: у опроса на сервере свой лимит 120 в минуту с адреса, его
// хватает и соседям за тем же адресом оператора.
const POLL_MS = 3000;

// Секрет проверки — на номер, пока номер действует: шторку закрыли и открыли
// снова — тот же бесплатный номер, а не отказ «номер уже ждёт звонка».
const secrets = new Map<string, { secret: string; expiresAt: number }>();
function secretFor(phone: string): string | undefined {
  const s = secrets.get(phone);
  if (s && s.expiresAt > Date.now()) return s.secret;
  secrets.delete(phone);
  return undefined;
}

// Ошибки, которые повтор не исправит: человек меняет номер в форме или входит.
const FINAL_ERRORS = new Set([
  "phone_taken",
  "phone_not_supported",
  "phone_invalid",
  "phone_same",
  "account_not_found",
  "account_blocked",
]);

export type CallPurpose = "register" | "recover" | "change_phone";

interface Request {
  phone: string;
  purpose: CallPurpose;
  /** Номер не вводили (свой номер аккаунта) — «Закрыть» вместо «Изменить номер». */
  fixedPhone: boolean;
  resolve: (token: string | null) => void;
}

export function useCallConfirm(): {
  confirm: (
    phone: string,
    purpose?: CallPurpose,
    opts?: { fixedPhone?: boolean },
  ) => Promise<string | null>;
  sheet: ReactNode;
} {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = useCallback(
    (phone: string, purpose: CallPurpose = "register", opts?: { fixedPhone?: boolean }) =>
      new Promise<string | null>((resolve) =>
        setRequest({ phone, purpose, fixedPhone: opts?.fixedPhone === true, resolve }),
      ),
    [],
  );
  const finish = useCallback(
    (token: string | null) => {
      request?.resolve(token);
      setRequest(null);
    },
    [request],
  );
  return {
    confirm,
    sheet: (
      <Modal
        visible={request !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onRequestClose={() => finish(null)}
      >
        {request ? (
          <CallConfirmBody
            phone={request.phone}
            purpose={request.purpose}
            fixedPhone={request.fixedPhone}
            onDone={finish}
          />
        ) : null}
      </Modal>
    ),
  };
}

interface Call {
  callPhone: string;
  callPhonePretty: string;
  expiresAt: number;
}

function CallConfirmBody({
  phone,
  purpose,
  fixedPhone,
  onDone,
}: {
  phone: string;
  purpose: CallPurpose;
  fixedPhone: boolean;
  onDone: (token: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "mute", "success", "on-accent"]);
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; final: boolean } | null>(null);
  const [expired, setExpired] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const alive = useRef(true);
  const polling = useRef(false);
  const lastPollAt = useRef(0);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpired(false);
    let r = await supabase.auth.callStart(phone, secretFor(phone), purpose);
    // Сервер ещё держит место под прошлый запрос (до 15 с) — дождаться и
    // спросить снова, а не пугать «номер уже ждёт звонка».
    const wait = !r.call && r.error.code === "call_busy" ? (r.retryInSec ?? 99) : 99;
    if (wait <= 15) {
      await new Promise((ok) => setTimeout(ok, (wait + 1) * 1000));
      if (!alive.current) return;
      r = await supabase.auth.callStart(phone, secretFor(phone), purpose);
    }
    if (!alive.current) return;
    setLoading(false);
    if (!r.call) {
      setCall(null);
      setError({
        message: r.error.message,
        final: FINAL_ERRORS.has(r.error.code ?? ""),
      });
      return;
    }
    secrets.set(phone, {
      secret: r.call.secret,
      expiresAt: Date.now() + r.call.expiresInSec * 1000,
    });
    setCall({
      callPhone: r.call.callPhone,
      callPhonePretty: r.call.callPhonePretty,
      expiresAt: Date.now() + r.call.expiresInSec * 1000,
    });
  }, [phone, purpose]);

  useEffect(() => {
    void start();
  }, [start]);

  const poll = useCallback(async () => {
    const secret = secretFor(phone);
    // Не чаще раза в 1,5 с — возврат из «Телефона» и таймер не дублируют друг друга.
    if (
      !secret ||
      polling.current ||
      confirmed ||
      expired ||
      Date.now() - lastPollAt.current < 1500
    ) {
      return;
    }
    polling.current = true;
    lastPollAt.current = Date.now();
    const r = await supabase.auth.callStatus(phone, secret);
    polling.current = false;
    if (!alive.current) return;
    if (r.token) {
      secrets.delete(phone);
      setConfirmed(true);
      // Галочка видна мгновенье — человек понимает, что всё получилось.
      setTimeout(() => {
        if (alive.current) onDone(r.token);
      }, 600);
      return;
    }
    if (r.error?.code === "call_expired") {
      secrets.delete(phone);
      setExpired(true);
    }
    // Остальные сбои — тихо: следующий опрос спросит снова.
  }, [phone, confirmed, expired, onDone]);

  // Пока номер действует — спрашиваем, был ли звонок, и считаем время.
  useEffect(() => {
    if (!call || expired || confirmed) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= call.expiresAt) setExpired(true);
      else void poll();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [call, expired, confirmed, poll]);

  // Вернулись из «Телефона» — сразу проверить, не ждать следующего тика.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void poll();
    });
    return () => sub.remove();
  }, [poll]);

  const left = call ? Math.max(0, Math.ceil((call.expiresAt - now) / 1000)) : 0;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  // Неразрывные пробелы: номер не рвётся между строками.
  const ownNumber = `+7 ${formatRuPhone(phone.replace(/^\+7/, ""))}`.replace(/ /g, "\u00A0");

  return (
    <View className="flex-1 bg-canvas" style={{ paddingBottom: insets.bottom + 16 }}>
      <View className="flex-row justify-end px-4 pt-4">
        <NavCircleButton label="Отмена" onPress={() => onDone(null)}>
          <SystemIcon sf="xmark" fallback={X} size={18} weight="semibold" color={tc.ink} />
        </NavCircleButton>
      </View>
      <View className="flex-1 px-6">
        <AppText accessibilityRole="header" weight="bold" className="text-ios-title1 text-ink">
          {purpose === "change_phone" ? "Подтвердите новый номер" : "Подтвердите номер звонком"}
        </AppText>
        <AppText className="mt-2 text-ios-body text-mute">
          Позвоните на этот номер с телефона{" "}
          <AppText weight="semibold" className="text-ios-body text-ink">
            {ownNumber}
          </AppText>
          . Это бесплатно — звонок сбросится сам.
        </AppText>

        <View className="mt-8 min-h-24 justify-center rounded-2xl bg-canvas-soft px-5 py-5">
          {loading ? (
            <View className="flex-row items-center gap-3">
              <ActivityIndicator color={tc.mute} />
              <AppText className="text-ios-body text-mute">Получаем номер…</AppText>
            </View>
          ) : call && !expired ? (
            <AppText
              weight="bold"
              selectable
              className="text-ios-title1 text-ink"
              accessibilityLabel={`Номер для звонка: ${call.callPhonePretty}`}
            >
              {call.callPhonePretty}
            </AppText>
          ) : (
            <AppText accessibilityRole="alert" className="text-ios-body text-error">
              {expired ? "Время вышло — получите новый номер." : error?.message}
            </AppText>
          )}
        </View>

        {call && !expired && !loading ? (
          <View className="mt-4 min-h-6 flex-row items-center gap-2">
            {confirmed ? (
              <>
                <CheckCircle size={20} weight="fill" color={tc.success} />
                <AppText accessibilityRole="alert" className="text-ios-subheadline text-success">
                  Номер подтверждён
                </AppText>
              </>
            ) : (
              <>
                <ActivityIndicator size="small" color={tc.mute} />
                <AppText className="text-ios-subheadline text-mute">
                  Ждём звонок · номер действует {mm}:{ss}
                </AppText>
              </>
            )}
          </View>
        ) : null}
      </View>

      <View className="gap-2 px-6">
        {call && !expired && !loading ? (
          <Button
            variant="accent"
            size="lg"
            fullWidth
            disabled={confirmed}
            onPress={() => void Linking.openURL(`tel:+${call.callPhone}`)}
            accessibilityHint="Откроет звонок на бесплатный номер"
            leftIcon={<Phone size={20} weight="fill" color={tc["on-accent"]} />}
          >
            Позвонить
          </Button>
        ) : !loading && error?.final && !expired ? (
          <Button variant="accent" size="lg" fullWidth onPress={() => onDone(null)}>
            {fixedPhone ? "Закрыть" : "Изменить номер"}
          </Button>
        ) : !loading ? (
          <Button variant="accent" size="lg" fullWidth onPress={() => void start()}>
            {expired ? "Получить новый номер" : "Попробовать ещё раз"}
          </Button>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openURL(SUPPORT_URL)}
          hitSlop={8}
          className="min-h-11 items-center justify-center active:opacity-60"
        >
          <AppText className="text-ios-subheadline text-mute">
            Не получается?{" "}
            <AppText className="text-ios-subheadline text-accent">Напишите нам</AppText>
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
