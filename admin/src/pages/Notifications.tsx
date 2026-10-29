// Уведомления админки (0255, №367): включить на этом устройстве, выбрать,
// о чём присылать, проверить. Настройки — на сотрудника (все его
// устройства), включение — на устройство.

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { Icon } from "../components/icons";
import { Cell, ErrorState, PageHead, SkeletonRows, Switch } from "../components/ui";
import { api, type PushSettings } from "../lib/api";
import {
  currentSubscription,
  disablePush,
  enablePush,
  type PushState,
  pushState,
} from "../lib/push";

const KIND_LABEL: Record<string, { title: string; hint: string }> = {
  report: { title: "Жалобы", hint: "Новая жалоба на человека, задание или отзыв" },
  order_review: { title: "Задания на проверке", hint: "Не подошла ни одна категория" },
  order_new: { title: "Каждое новое задание", hint: "Все публикации — их бывает много" },
  passport: { title: "Паспорта", hint: "Заявка на подтверждение личности" },
  company: { title: "Компании", hint: "Заявка на подтверждение компании" },
  instagram: { title: "Instagram", hint: "Новая ссылка на проверку" },
  experience: { title: "Большой опыт", hint: "Заявка на значок" },
  recovery: { title: "Восстановление доступа", hint: "Человек просит перезвонить" },
  specialist_new: { title: "Новые специалисты", hint: "Каждая регистрация специалиста" },
};

export function Notifications({ onBack }: { onBack: () => void }) {
  const { toast } = useFeedback();
  const [state, setState] = useState<PushState | null>(null);
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [st, sub] = await Promise.all([pushState(), currentSubscription()]);
      setState(st);
      setSettings(await api.pushSettings(sub?.endpoint ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDevice = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = state === "on" ? await disablePush() : await enablePush();
      setState(next);
      if (next === "on") toast("Уведомления включены");
      else if (next === "denied")
        toast("iPhone запретил уведомления — включите в Настройках", true);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не получилось", true);
    } finally {
      setBusy(false);
    }
  };

  const setKind = async (kind: string, enabled: boolean) => {
    if (!settings) return;
    // Сразу на экране, сервер — следом; при ошибке вернуть.
    setSettings({
      ...settings,
      kinds: settings.kinds.map((k) => (k.kind === kind ? { ...k, enabled } : k)),
    });
    try {
      await api.setPushKind(kind, enabled);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не сохранилось", true);
      void load();
    }
  };

  const test = async () => {
    try {
      await api.pushTest();
      toast("Отправили — придёт через пару секунд");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не получилось", true);
    }
  };

  return (
    <>
      <PageHead onBack={onBack} backLabel="Ещё" title="Уведомления" />

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {state === null && !error ? <SkeletonRows count={3} height={56} /> : null}

      {state === "needs-install" ? (
        <section className="card stack">
          <p className="headline">Сначала — на экран «Домой»</p>
          <p className="body-md text-body" style={{ margin: 0 }}>
            iPhone присылает уведомления только приложениям с экрана «Домой». В Safari нажмите{" "}
            <b>Поделиться</b> → <b>На экран «Домой»</b>, откройте админку оттуда и вернитесь сюда.
          </p>
        </section>
      ) : null}

      {state === "unsupported" ? (
        <section className="card">
          <p className="body-md" style={{ margin: 0 }}>
            Этот браузер не умеет получать уведомления. На iPhone нужна iOS 16.4 или новее.
          </p>
        </section>
      ) : null}

      {state === "denied" ? (
        <section className="card stack">
          <p className="headline">Уведомления запрещены</p>
          <p className="body-md text-body" style={{ margin: 0 }}>
            Откройте <b>Настройки</b> iPhone → <b>Уведомления</b> → <b>xtrud админ</b> и разрешите.
          </p>
        </section>
      ) : null}

      {state === "on" || state === "off" ? (
        <section className="section">
          <div className="group">
            <Cell
              icon={<Icon.bell size={18} />}
              iconBg="var(--tint-red)"
              title="На этом устройстве"
              sub={state === "on" ? "Включены" : "Выключены"}
              value={
                <Switch
                  checked={state === "on"}
                  disabled={busy}
                  onChange={() => void toggleDevice()}
                  label="Уведомления на этом устройстве"
                />
              }
            />
            {state === "on" ? (
              <Cell title="Прислать пробное" onClick={() => void test()} chevron={false} />
            ) : null}
          </div>
          {settings && settings.devices > 0 ? (
            <p className="section-footer">Включены на устройствах: {settings.devices}</p>
          ) : null}
        </section>
      ) : null}

      {settings ? (
        <section className="section">
          <h2 className="section-title">О чём присылать</h2>
          <div className="group">
            {settings.kinds.map((k) => {
              const label = KIND_LABEL[k.kind] ?? { title: k.kind, hint: "" };
              return (
                <Cell
                  key={k.kind}
                  title={label.title}
                  sub={label.hint}
                  value={
                    <Switch
                      checked={k.enabled}
                      onChange={(v) => void setKind(k.kind, v)}
                      label={label.title}
                    />
                  }
                />
              );
            })}
          </div>
          <p className="section-footer">
            В уведомлении нет имён и телефонов — его видно на заблокированном экране.
          </p>
        </section>
      ) : null}
    </>
  );
}
