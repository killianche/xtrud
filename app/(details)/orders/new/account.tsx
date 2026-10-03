/**
 * /orders/new/account — «Ваш аккаунт»: последний шаг создания задания для
 * гостя. Владелец, 2026-10-03: «не так, что создал задание, потом говорят
 * „ещё зарегистрируйся“ — пускай регистрация идёт в рамках создания задания».
 * Раньше гость на «Опубликовать» видел отдельную шторку «Войдите, чтобы
 * опубликовать» и уходил в регистрацию; теперь на проверке у него «Далее»,
 * здесь — имя, телефон, пароль и одна кнопка «Опубликовать»: аккаунт
 * создаётся и задание публикуется одним действием.
 *
 * Черновик гостя переходит новому аккаунту тем же путём, что в обычной
 * регистрации (begin/completeGuestDraftAuthJourney). Публикуется снимок
 * ответов и фото, сделанный до регистрации: смена владельца черновика не
 * должна поменять то, что человек проверил. Публикация ждёт, пока экран
 * получит сессию нового аккаунта, — иначе результат посчитался бы чужим.
 *
 * Есть аккаунт — «Войти»: вход с возвратом к черновику (как прежде).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { RegisterFormFields } from "@/features/auth/RegisterFormFields";
import { useRegister } from "@/features/auth/use-auth-mutations";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  normalizeRuPhoneDigits,
  type RegisterFormValues,
  registerFormSchema,
} from "@/features/auth/validation";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import {
  PublishOutcomeScreen,
  PublishProgressScreen,
} from "@/features/task-composer/PublishOutcomeScreens";
import { isComposerComplete } from "@/features/task-composer/steps";
import { usePublishTask } from "@/features/task-composer/use-publish-task";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { beginGuestDraftAuthJourney, completeGuestDraftAuthJourney } from "@/lib/order-draft-store";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";

/** Сколько ждать, пока сессия нового аккаунта дойдёт до экрана. */
const SESSION_WAIT_MS = 3000;

export default function TaskAccountScreen() {
  const router = useRouter();
  const composer = useComposer();
  const { values, photos, mode } = composer;
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const publish = usePublishTask(mode, userId);
  const register = useRegister();
  const [serverError, setServerError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [started, setStarted] = useState(false);
  // Аккаунт создан в этой попытке — повтор публикует от него, не дожидаясь,
  // пока сессия дойдёт до экрана (QA 2026-10-03).
  const registeredUid = useRef<string | null>(null);

  // Ждём, пока экран увидит нового пользователя (см. шапку файла).
  const waiter = useRef<{ uid: string; resolve: () => void } | null>(null);
  useEffect(() => {
    if (waiter.current && userId === waiter.current.uid) {
      waiter.current.resolve();
      waiter.current = null;
    }
  }, [userId]);
  const waitForSession = (uid: string) =>
    new Promise<void>((resolve) => {
      if (userId === uid) return resolve();
      waiter.current = { uid, resolve };
      setTimeout(() => {
        waiter.current = null;
        resolve();
      }, SESSION_WAIT_MS);
    });

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { firstName: "", lastName: "", phone: "", password: "" },
    mode: "onChange",
  });

  const busy = register.isPending || publish.busy;
  usePreventRemove(busy, () => {});
  useBackGestureLock(busy || publish.outcome !== null);

  if (publish.busy && !publish.outcome) return <PublishProgressScreen />;
  if (publish.outcome) return <PublishOutcomeScreen outcome={publish.outcome} />;
  if (!composer.ready) return null;
  // Сюда попадают только гостем и только с готовым черновиком.
  if (!started && (mode.kind !== "create" || !isComposerComplete(values))) {
    return <Redirect href="/orders/new" />;
  }
  if (!started && userId) return <Redirect href="/orders/new/review" />;

  const onPublish = handleSubmit(async (form) => {
    const snapshot = { values, photos };
    setServerError(null);
    setStarted(true);
    const journey = beginGuestDraftAuthJourney();
    let registered = false;
    try {
      const result = await register.mutateAsync({
        phone: `+7${normalizeRuPhoneDigits(form.phone)}`,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
      });
      registered = true;
      registeredUid.current = result.userId;
      await completeGuestDraftAuthJourney(journey ?? undefined, result.userId);
      await waitForSession(result.userId);
      await publish.run(result.userId, snapshot.values, snapshot.photos);
    } catch (e) {
      // Ошибка регистрации — форма снова доступна. Ошибку публикации
      // показывает publish.error, повтор — через ту же кнопку.
      if (!registered) setStarted(false);
      setServerError(e instanceof Error ? e.message : "Не удалось создать аккаунт");
    }
  });

  const goLogin = () => {
    const journey = beginGuestDraftAuthJourney();
    useAuthReturnUrlStore.getState().setReturnUrl(ORDER_CREATE_RETURN_TO);
    router.push({
      pathname: "/(auth)/phone",
      params: { returnTo: ORDER_CREATE_RETURN_TO, ...(journey ? { draftJourney: journey } : {}) },
    } as never);
  };

  return (
    <ComposerScreen
      step="review"
      title="Создайте аккаунт"
      onBack={() => router.back()}
      primaryLabel="Опубликовать"
      // Аккаунт уже создан, а публикация сорвалась — повтор только публикует,
      // не регистрирует тот же номер второй раз.
      onPrimary={() => {
        const uid = registeredUid.current;
        if (uid) {
          setServerError(null);
          void publish.run(uid, values, photos);
        } else {
          void onPublish();
        }
      }}
      primaryDisabled={registeredUid.current ? false : !isValid || !acceptedTerms}
      busy={busy}
      error={publish.error}
    >
      <View className="px-5">
        <RegisterFormFields
          control={control}
          errors={errors}
          isBusy={busy}
          acceptedTerms={acceptedTerms}
          onToggleTerms={() => setAcceptedTerms((v) => !v)}
          serverError={serverError}
        />
        <View className="mt-6 flex-row flex-wrap items-center justify-center">
          <AppText className="text-body-md text-mute">Уже есть аккаунт? </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Войти в существующий аккаунт"
            onPress={goLogin}
            disabled={busy}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          >
            <AppText weight="semibold" className="text-body-md text-accent">
              Войти
            </AppText>
          </Pressable>
        </View>
      </View>
    </ComposerScreen>
  );
}
