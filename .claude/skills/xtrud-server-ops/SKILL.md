---
name: xtrud-server-ops
description: Выложить xtrud-api, веб-админку, статический сайт или поменять nginx на сервере Beget 217.114.8.196. Использовать после правок в server/, admin/, public/ или для настроек HTTPS/HTTP2/сжатия/портов.
---

# Сервер Beget

На одной машине xtrud и соседний проект padelmagas (общий nginx, порт 443).

## xtrud-api (Docker, не systemd)

1. Копия исходников: `tar -czf /root/api-backups/xtrud-api-src-<ts>.tgz -C /opt/xtrud/xtrud-api src package.json package-lock.json`.
2. `cd server && npm run check` локально.
3. `rsync -a --delete --exclude node_modules --exclude dist server/src/ root@217.114.8.196:/opt/xtrud/xtrud-api/src/`
4. `cd /opt/xtrud/xtrud-api && docker compose up -d --build xtrud-api`; проверка `curl https://api.xtrud.pro/v2/health` → 200.
5. Сверить: `md5sum` файла локально и на сервере.

## Веб-админка

`cd admin && npm run build`; копия `/var/www/xtrud-admin` в `/root/admin-backups/`; `rsync -a --delete dist/ root@217.114.8.196:/var/www/xtrud-admin/`; проверить, что новый бандл с нужной строкой отдаётся.

## Статический сайт

Только через `deploy/static.sh` из временного worktree `main` (скрипт требует чистое дерево и сам откатывается): см. память static-site-deploy.

## nginx

- Копии конфигов — **только** в `/root/nginx-backups/`, никогда в `sites-enabled` (копия там уронила сайт на 9,5 ч 16.09).
- `sites-enabled` — симлинки: искать `grep -R`, править файл в `sites-available`.
- После правки: `nginx -t`, затем `systemctl reload nginx` (не restart).
- `http2` стоит на всех `listen 443` (xtrud-api, xtrud-web, padelmagas-ssl) — нужен, чтобы приложение ходило одним соединением (см. навык xtrud-reachability). Новые `listen 443` добавлять тоже с `http2`.

## Ловушки

- `systemctl status xtrud-api` не существует — это контейнер `docker ps`.
- Запись не своего сервиса: на 85.198.86.41 ничего не делать — это не xtrud.
- Beget останавливает VPS при нулевом балансе: если сервер не отвечает никому (ping и TCP молчат отовсюду, соседние адреса 217.114.8.x отвечают) — сначала спросить владельца про баланс.
