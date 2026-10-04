// Регистрация с подтверждением номера звонком (№206, 2026-10-04).
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
  ): Promise<{ ok: true; userId: string } | null> => {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    try {
      return await runOnce(input);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const runOnce = async (
    input: Omit<RegisterInput, "verificationToken">,
  ): Promise<{ ok: true; userId: string } | null> => {
    let token: string | undefined;
    const options = await fetchAuthOptions();
    if (options.phoneCallAtRegistration) {
      const t = await call.confirm(input.phone);
      if (!t) return null;
      token = t;
    }
    try {
      return await register.mutateAsync({ ...input, verificationToken: token });
    } catch (e) {
      if (!token && (e as { code?: string }).code === "phone_verification_required") {
        const t = await call.confirm(input.phone);
        if (!t) return null;
        return await register.mutateAsync({ ...input, verificationToken: t });
      }
      throw e;
    }
  };

  return { run, sheet: call.sheet, isPending: busy || register.isPending };
}
