/**
 * Канал уведомлений Android. Тот же идентификатор сервер передаёт в FCM
 * (`server/src/push/rustore.ts` → ANDROID_CHANNEL_ID): если канала с таким
 * именем на телефоне нет, Android покажет push в служебном канале «Прочее».
 */
export const ANDROID_NOTIFICATION_CHANNEL = "default";
