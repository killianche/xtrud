-- Делаем orders.description NULLable. Предыдущая миграция 0089 уже
-- разрешила NULL в CHECK constraint и сняла min-length, но сама колонка
-- осталась NOT NULL — поэтому INSERT с description=NULL падал, и API/
-- сгенерированные TS-типы считали description обязательным `string`.
--
-- UI (`OrderFormBody`) помечает поле «Подробности (необязательно)»,
-- поэтому backend обязан принимать NULL.
ALTER TABLE public.orders ALTER COLUMN description DROP NOT NULL;
