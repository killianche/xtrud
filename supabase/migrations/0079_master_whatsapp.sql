-- Migration 0079 — WhatsApp номер для мастера.
--
-- Why. User feedback (2026-05-16): «мастер при регистрации/редактировании
-- добавляет WhatsApp. Может быть тот же что основной телефон (чекбокс),
-- может быть другой, может вообще отсутствовать. Если не указан — кнопка
-- WhatsApp не отображается у клиента».
--
-- Дизайн:
--   - `whatsapp_phone`: явный номер. NULL = не указан.
--   - `whatsapp_same_as_phone`: чекбокс «совпадает с основным». true →
--     UI читает users.phone (через useMasterPhone RPC).
--   - Итоговый WhatsApp для отображения:
--     if same_as_phone → master.phone
--     else if whatsapp_phone IS NOT NULL → whatsapp_phone
--     else null (кнопка не показывается)
--
-- Helper `src/lib/whatsapp.ts:resolveWhatsappNumber()` инкапсулирует логику.

ALTER TABLE public.master_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone           text
    CHECK (whatsapp_phone IS NULL OR length(whatsapp_phone) BETWEEN 5 AND 20),
  ADD COLUMN IF NOT EXISTS whatsapp_same_as_phone   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.master_profiles.whatsapp_phone IS
  'Sprint 0079: явный WhatsApp номер мастера (E.164 или local). NULL = не указан. Если whatsapp_same_as_phone=true — игнорируется в UI (используется users.phone).';
COMMENT ON COLUMN public.master_profiles.whatsapp_same_as_phone IS
  'Sprint 0079: WhatsApp совпадает с основным телефоном мастера (users.phone). Если true — UI берёт users.phone, whatsapp_phone игнорируется.';

-- Constraint: если same_as_phone=true, отдельный whatsapp_phone должен быть NULL
-- (чтобы UI не путался каким значением пользоваться).
ALTER TABLE public.master_profiles
  ADD CONSTRAINT master_profiles_whatsapp_xor
    CHECK (
      NOT (whatsapp_same_as_phone = true AND whatsapp_phone IS NOT NULL)
    );
