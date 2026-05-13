/**
 * Универсальная модалка «Пожаловаться» (Sprint I.4).
 *
 * Использование:
 *   <ReportModal
 *     visible={open}
 *     targetType="user"
 *     targetId={masterId}
 *     onClose={() => setOpen(false)}
 *   />
 *
 * Внутри: радиокнопки причин (зависят от targetType) + textarea (опц.) + submit.
 * После submit показывает «Жалоба отправлена» и автоматически закрывается через 1.5с.
 */

import { Check, X } from "lucide-react-native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  REASON_LABELS,
  type ReportReason,
  type ReportTargetType,
  reasonsFor,
  useCreateReport,
} from "@/features/reports/use-create-report";
import { useThemeColor } from "@/lib/use-theme-color";

interface ReportModalProps {
  visible: boolean;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}

export function ReportModal({ visible, targetType, targetId, onClose }: ReportModalProps) {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const submit = useCreateReport();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const tcMuted = useThemeColor("muted-soft");
  const tcInk = useThemeColor("ink");

  const reasons = reasonsFor(targetType);
  const canSubmit = reason !== null && !!userId && !submit.isPending;

  const reset = () => {
    setReason(null);
    setDescription("");
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit || !userId || !reason) return;
    try {
      await submit.mutateAsync({
        reporterId: userId,
        targetType,
        targetId,
        reason,
        description,
      });
      setSubmitted(true);
      setTimeout(handleClose, 1500);
    } catch (_e) {
      // submit.error отрендерится ниже
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        <View className="w-full max-w-md rounded-2xl bg-canvas p-6">
          <View className="mb-1 flex-row items-start justify-between">
            <AppText weight="bold" className="flex-1 text-title-md text-ink">
              {submitted ? "Спасибо за сигнал" : "Пожаловаться"}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={handleClose}
              hitSlop={8}
              className="ml-2 active:opacity-70"
            >
              <X size={20} strokeWidth={1.75} color={tcMuted} />
            </Pressable>
          </View>

          {submitted ? (
            <View className="mt-2 flex-row items-center gap-2">
              <Check size={18} strokeWidth={2} color={tcInk} />
              <AppText className="flex-1 text-body-sm text-muted">
                Жалоба отправлена. Модератор рассмотрит в ближайшее время.
              </AppText>
            </View>
          ) : (
            <>
              <AppText className="text-body-sm text-muted">
                Выберите причину. Опционально опишите детали.
              </AppText>

              <ScrollView className="mt-4 max-h-72" showsVerticalScrollIndicator={false}>
                <View className="gap-2">
                  {reasons.map((r) => {
                    const selected = reason === r;
                    return (
                      <Pressable
                        key={r}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setReason(r)}
                        className={`rounded-md border p-3 active:opacity-70 ${
                          selected
                            ? "border-accent bg-accent-soft"
                            : "border-hairline bg-canvas"
                        }`}
                      >
                        <AppText
                          weight={selected ? "semibold" : "medium"}
                          className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}
                        >
                          {REASON_LABELS[r]}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Детали (опц.)"
                  placeholderTextColor={tcMuted}
                  multiline
                  numberOfLines={3}
                  maxLength={2000}
                  textAlignVertical="top"
                  maxFontSizeMultiplier={1.3}
                  className="mt-3 min-h-20 rounded-md border border-hairline bg-canvas px-3 py-2 text-body-sm text-ink"
                  editable={!submit.isPending}
                />
              </ScrollView>

              {submit.error && (
                <AppText weight="medium" className="mt-2 text-caption text-error">
                  {submit.error.message}
                </AppText>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={handleSubmit}
                className={`mt-4 h-11 items-center justify-center rounded-md ${
                  canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
                }`}
              >
                <AppText weight="semibold" className="text-button text-on-primary">
                  {submit.isPending ? "Отправляем..." : "Отправить"}
                </AppText>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
