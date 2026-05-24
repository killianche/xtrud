-- 0100_order_photos.sql
-- Фото в заказах (до 5 на заказ).
--
-- Why. Клиент при создании заказа прикладывает фото проблемы (сломанный
-- смеситель, комната под ремонт). Мастер видит реальный объём → даёт точную
-- цену сразу, без переписки. Стандарт Avito Услуги / Profi.ru / YouDo.
--
-- Модель хранения: массив публичных URL прямо в orders.photo_urls.
--   - индекс 0 = обложка (показывается первой в карусели и миниатюрой в ленте);
--   - максимум 5 (CHECK + клиентская проверка);
--   - читается вместе с заказом (все select'ы по orders используют "*").
-- Отдельная таблица order_photos не нужна: метаданных на фото нет, порядок =
-- порядок массива. Файлы лежат в публичном bucket order-photos.

-- 1. Колонка для ссылок на фото (обложка = photo_urls[1] в SQL / [0] в JS).
alter table public.orders
  add column if not exists photo_urls text[] not null default '{}';

-- 2. Лимит 5 фото на заказ (safety-net поверх клиентской проверки).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_photo_urls_max5'
  ) then
    alter table public.orders
      add constraint orders_photo_urls_max5
      check (array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 5);
  end if;
end $$;

-- 3. Публичный bucket order-photos (паттерн chat-images: чтение всем, запись —
--    только в свою папку {auth.uid()}/...).
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', true)
on conflict (id) do nothing;

-- 4. RLS на storage.objects для order-photos.
drop policy if exists "order_photos_public_read" on storage.objects;
create policy "order_photos_public_read"
  on storage.objects for select to public
  using (bucket_id = 'order-photos');

drop policy if exists "order_photos_upload_own" on storage.objects;
create policy "order_photos_upload_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-photos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "order_photos_delete_own" on storage.objects;
create policy "order_photos_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'order-photos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
