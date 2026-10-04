/**
 * Подтверждение номера кодом из SMS — системная шторка iOS (2026-10-04).
 *
 * Владелец: «подключить SMS с кодом». Один экран и для регистрации, и для
 * «Забыли пароль?». Как подтверждение в системных приложениях Apple и в
 * банках: шесть ячеек, код из «Сообщений» iPhone подставляет над
 * клавиатурой (textContentType oneTimeCode в OtpInput), проверка — сама на
 * шестой цифре, без кнопки; «Отправить ещё раз» — после таймера 60 с.
 * Шторку можно смахнуть вниз — это отмена.
 *
 * Использование: const code = usePhoneCodeConfirm(); … const token = await
 * code.confirm(phone, "register"); {code.sheet} — в разметке экрана.
 * Результат — одноразовое подтверждение номера для сервера, null — отмена.
 */

import { X } from "phosphor-react-native";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OtpInput, type OtpInputHandle } from "@/components/OtpInput";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/use-theme-color";
import { formatRuPhone } from "./RegisterFormFields";

export type CodePurpose = "register" | "reset";

const RESEND_SEC = 60;

interface Request {
  phone: string;
  purpose: CodePurpose;
  resolve: (token: string | null) => void;
}

export function usePhoneCodeConfirm(): {
  confirm: (phone: string, purpose: CodePurpose) => Promise<string | null>;
  sheet: ReactNode;
} {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = useCallback(
    (phone: string, purpose: CodePurpose) =>
      new Promise<string | null>((resolve) => setRequest({ phone, purpose, resolve })),
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
        onRequestClose={() => finish(null)}
      >
        {request ? (
          <PhoneCodeBody phone={request.phone} purpose={request.purpose} onDone={finish} />
        ) : null}
      </Modal>
    ),
  };
}

function PhoneCodeBody({
  phone,
  purpose,
  onDone,
}: {
  phone: string;
  purpose: CodePurpose;
  onDone: (token: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "mute"]);
  const inputRef = useRef<OtpInputHandle>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(true);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const digits = phone.replace(/\D/g, "").slice(-10);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    const r = await supabase.auth.sendCode(phone, purpose);
    setSending(false);
    if (r.error) {
      setError(r.error.message);
      if (r.retryInSec) {
        // Код уже отправлен недавно — ждём его, а не шлём новый.
        setSent(true);
        setCooldown(r.retryInSec);
      }
      return;
    }
    setSent(true);
    setCode("");
    setCooldown(RESEND_SEC);
  }, [phone, purpose]);

  // Код уходит сразу, как открылась шторка.
  useEffect(() => {
    void send();
  }, [send]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const check = async (value: string) => {
    setChecking(true);
    setError(null);
    const r = await supabase.auth.verifyCode(phone, purpose, value);
    setChecking(false);
    if (r.token) {
      onDone(r.token);
      return;
    }
    setError(r.error?.message ?? "Не удалось проверить код");
    setCode("");
  };

  const onChange = (value: string) => {
    setCode(value);
    if (error) setError(null);
    if (value.length === 6 && !checking) void check(value);
  };

  const busy = sending || checking;
  // Поле доступно, когда код отправлен и ничего не идёт, — тогда и фокус:
  // в недоступное поле клавиатура не откроется.
  useEffect(() => {
    if (sent && !busy) inputRef.current?.focus();
  }, [sent, busy]);
  const mm = Math.floor(cooldown / 60);
  const ss = String(cooldown % 60).padStart(2, "0");

  return (
    <View className="flex-1 bg-canvas" style={{ paddingBottom: insets.bottom + 16 }}>
      <View className="flex-row justify-end px-4 pt-4">
        <NavCircleButton label="Отмена" onPress={() => onDone(null)}>
          <SystemIcon sf="xmark" fallback={X} size={18} weight="semibold" color={tc.ink} />
        </NavCircleButton>
      </View>
      <View className="px-6">
        <AppText accessibilityRole="header" weight="bold" className="text-ios-title1 text-ink">
          Введите код
        </AppText>
        <AppText className="mt-2 text-ios-body text-mute">
          {sent ? "Отправили SMS на номер " : "Отправляем SMS на номер "}
          <AppText weight="semibold" className="text-ios-body text-ink">
            +7 {formatRuPhone(digits)}
          </AppText>
        </AppText>

        <View className="mt-8">
          <OtpInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            hasError={!!error}
            disabled={busy || !sent}
            autoFocus
          />
        </View>

        <View className="mt-4 min-h-6 flex-row items-center gap-2">
          {busy ? <ActivityIndicator color={tc.mute} /> : null}
          {error ? (
            <AppText accessibilityRole="alert" className="flex-1 text-ios-subheadline text-error">
              {error}
            </AppText>
          ) : busy ? (
            <AppText className="text-ios-subheadline text-mute">
              {checking ? "Проверяем…" : "Отправляем…"}
            </AppText>
          ) : null}
        </View>

        {cooldown > 0 ? (
          <AppText className="mt-4 text-ios-subheadline text-mute">
            Отправить код ещё раз — через {mm}:{ss}
          </AppText>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void send()}
            disabled={busy}
            hitSlop={12}
            className="mt-4 min-h-11 justify-center self-start active:opacity-60"
          >
            <AppText weight="semibold" className="text-ios-subheadline text-accent">
              Отправить код ещё раз
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}
