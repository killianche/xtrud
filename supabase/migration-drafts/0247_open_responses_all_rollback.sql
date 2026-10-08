-- Откат 0247: снова «открыты всем» только прежние 11 подкатегорий, DEFAULT false.
-- Категории, которые админ закрыл/открыл после 0247, откат перезапишет —
-- сверить с владельцем перед применением.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.categories_l2 ALTER COLUMN open_responses SET DEFAULT false;
UPDATE public.categories_l2
   SET open_responses = id IN ('buy-deliver', 'cleaning', 'cleaning-post-renovation',
                               'courier-delivery', 'disposal', 'food-delivery', 'garden',
                               'housekeeping', 'laborers', 'movers', 'uncategorized');

NOTIFY pgrst, 'reload schema';

COMMIT;
