// Второй фактор. Пароль сам по себе прав администратора не даёт: функция
// is_admin_session() в базе требует сессию уровня aal2 и падает закрыто —
// нет фактора, чужая сессия, истёкшая сессия, aal1 — всё это отказ.
//
// Так и задумано (docs/ADMIN_PANEL.md §6): панель читает персональные данные
// всех людей и умеет менять пароли. Украденного пароля для этого мало.
//
// Здесь два состояния: первый раз — привязка приложения-аутентификатора
// (QR-код), дальше — просто ввод шестизначного кода.
//
// Если телефон потерян: фактор снимается на сервере вручную —
// docs/PASSWORD_RECOVERY_RUNBOOK.md, раздел «Потерян второй фактор».

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Field } from "../components/ui";
import { getClient } from "../lib/api";

type Stage = "loading" | "enroll" | "code" | "error";

export function TwoFactor({
  onVerified,
  onSignOut,
}: {
  onVerified: () => void;
  onSignOut: () => void;
}) {
  const [stage, setStage] = useState<Stage>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prepare = useCallback(async () => {
    setError(null);
    try {
      const supabase = await getClient();
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;

      // `totp` в ответе — уже только подтверждённые факторы; неподтверждённые
      // лежат в `all`.
      const verified = factors?.totp?.[0];
      if (verified) {
        setFactorId(verified.id);
        setStage("code");
        return;
      }

      // Неподтверждённые попытки привязки накапливаются, если человек уходил
      // с полпути. Снимаем их, иначе enroll упрётся в лимит факторов.
      const stale = (factors?.all ?? []).filter(
        (factor) => factor.factor_type === "totp" && factor.status !== "verified",
      );
      for (const factor of stale) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Админка xtrud · ${new Date().toLocaleDateString("ru-RU")}`,
      });
      if (enrollError) throw enrollError;
      setFactorId(enrolled.id);
      setQrCode(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setStage("enroll");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось подготовить второй фактор.");
      setStage("error");
    }
  }, []);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !factorId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = await getClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) {
        setError("Код не подошёл. Проверьте время на телефоне и попробуйте снова.");
        return;
      }
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось проверить код.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-mesh" aria-hidden="true" />
      <div className="card card-lg login-card">
        <p className="mono-eyebrow">Второй фактор</p>
        <h1 className="heading-lg" style={{ marginTop: 8 }}>
          {stage === "enroll" ? "Привяжите приложение" : "Введите код"}
        </h1>

        {stage === "loading" ? (
          <p className="body-md text-mute" style={{ marginTop: 16 }}>
            Готовим…
          </p>
        ) : null}

        {stage === "error" ? (
          <>
            <div className="banner-error body-md" style={{ marginTop: 16 }} role="alert">
              {error}
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 16 }}
              onClick={() => void prepare()}
            >
              Повторить
            </button>
          </>
        ) : null}

        {stage === "enroll" ? (
          <>
            <p className="body-md text-mute" style={{ marginTop: 8 }}>
              Откройте Google Authenticator (или любое такое же приложение) и отсканируйте код.
              Дальше вход будет спрашивать шесть цифр из него.
            </p>
            {qrCode ? (
              <img
                src={qrCode}
                alt="QR-код для приложения-аутентификатора"
                style={{
                  width: 200,
                  height: 200,
                  display: "block",
                  margin: "24px auto 8px",
                  background: "var(--canvas-elevated)",
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius-md)",
                }}
              />
            ) : null}
            {secret ? (
              <p
                className="body-sm text-mute"
                style={{ textAlign: "center", wordBreak: "break-all" }}
              >
                Если камера не работает, введите ключ вручную:
                <br />
                <span className="mono" style={{ color: "var(--ink)" }}>
                  {secret}
                </span>
              </p>
            ) : null}
          </>
        ) : null}

        {stage === "enroll" || stage === "code" ? (
          <form onSubmit={submit} className="stack" style={{ marginTop: 24 }}>
            <Field label="Код из приложения" hint="Шесть цифр, меняются каждые 30 секунд">
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={busy}
                required
              />
            </Field>
            {error ? (
              <div className="banner-error body-md" role="alert">
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary btn-pill"
              disabled={busy || code.length !== 6}
            >
              {busy ? "Проверяем…" : "Подтвердить"}
            </button>
          </form>
        ) : null}

        <button
          type="button"
          className="nav-link"
          style={{ marginTop: 16, paddingLeft: 0 }}
          onClick={onSignOut}
        >
          Выйти
        </button>
      </div>
    </div>
  );
}
