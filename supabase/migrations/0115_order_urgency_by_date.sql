-- Добавляем значение 'by_date' в enum order_urgency: клиент может выбрать
-- точную дату вместо относительного срока (urgent/this_week/this_month/flexible).
-- Конкретная дата хранится в orders.preferred_date (миграция 0116).
-- ADD VALUE — аддитивно и безопасно; в отдельной миграции, т.к. новое
-- значение нельзя использовать в той же транзакции, где оно добавлено.
ALTER TYPE order_urgency ADD VALUE IF NOT EXISTS 'by_date';
