// Регистрация с подтверждением номера кодом из SMS (2026-10-04).
//
// Спрашивать ли код, решает сервер (GET /v2/auth/options): включается одной
// настройкой, когда у отправителя SMS подключены все операторы. Если
// настройку включили, пока экран был открыт, сервер ответит
// phone_verification_required — тогда код спрашивается и регистрация
// повторяется один раз. Отмена шторки — null, без ошибки.

import { usePhoneCodeConfirm } from "./PhoneCodeSheet";
import { type RegisterInput, useRegister } from "./use-auth-mutations";
import { fetchAuthOptions } from "./use-auth-options";

export function useRegisterWithCode() {
  const register = useRegister();
  const code = usePhoneCodeConfirm();

  const run = async (
    input: Omit<RegisterInput, "verificationToken">,
  ): Promise<{ ok: true; userId: string } | null> => {
    let token: string | undefined;
    const options = await fetchAuthOptions();
    if (options.phoneCodeAtRegistration) {
      const t = await code.confirm(input.phone, "register");
      if (!t) return null;
      token = t;
    }
    try {
      return await register.mutateAsync({ ...input, verificationToken: token });
    } catch (e) {
      if (!token && (e as { code?: string }).code === "phone_verification_required") {
        const t = await code.confirm(input.phone, "register");
        if (!t) return null;
        return await register.mutateAsync({ ...input, verificationToken: t });
      }
      throw e;
    }
  };

  return { run, sheet: code.sheet, isPending: register.isPending };
}
