// Регистрация с подтверждением номера звонком (№206, 2026-10-04).
//
// Номер уже подтверждён на экране «Ваш номер» (№217) — регистрация берёт то
// подтверждение (`verified`), если номер в форме тот же; устарело — сервер
// ответит phone_verification_required, и звонок спросится ещё раз.
//
// Спрашивать ли звонок, решает сервер (GET /v2/auth/options): включается
// токеном провайдера на сервере. Если его включили, пока экран был открыт,
// сервер ответит phone_verification_required — тогда звонок спрашивается и
// регистрация повторяется один раз. Отмена шторки — null, без ошибки.

import { useRef, useState } from "react";
import { useCallConfirm } from "./CallConfirmSheet";
import { type RegisterInput, useRegister } from "./use-auth-mutations";
import { fetchAuthOptions } from "./use-auth-options";

export function useRegisterWithCode() {
  const register = useRegister();
  const call = useCallConfirm();
  // Занято с нажатия до конца регистрации, включая ожидание звонка: второе
  // нажатие не открывает вторую шторку поверх первой (QA 2026-10-04).
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = async (
    input: Omit<RegisterInput, "verificationToken">,
    verified?: { phone: string; token: string },
  ): Promise<{ ok: true; userId: string } | null> => {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    try {
      return await runOnce(input, verified?.phone === input.phone ? verified.token : undefined);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const runOnce = async (
    input: Omit<RegisterInput, "verificationToken">,
    preToken?: string,
  ): Promise<{ ok: true; userId: string } | null> => {
    let token: string | undefined = preToken;
    if (!token) {
      const options = await fetchAuthOptions();
      if (options.phoneCallAtRegistration) {
        const t = await call.confirm(input.phone, "register");
        if (!t) return null;
        token = t;
      }
    }
    try {
      return await register.mutateAsync({ ...input, verificationToken: token });
    } catch (e) {
      // Подтверждения не было или оно устарело (15 минут) — спросить звонок.
      if ((e as { code?: string }).code === "phone_verification_required") {
        const t = await call.confirm(input.phone, "register");
        if (!t) return null;
        return await register.mutateAsync({ ...input, verificationToken: t });
      }
      throw e;
    }
  };

  return { run, sheet: call.sheet, isPending: busy || register.isPending };
}
