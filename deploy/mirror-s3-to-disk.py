#!/usr/bin/env python3
"""Зеркало объектного хранилища Beget S3 на диск сервера — для ночной копии.

ЗАЧЕМ (FACT, 2026-09-10). С переезда в S3 (2026-09-08) новые файлы —
аватары, фото работ и заданий, паспорта — лежат только в хранилище. Ночная
копия /opt/xtrud/backup.sh архивировала один /opt/xtrud/files, то есть всё
загруженное после переезда в копию не попадало.

Как работает: список объектов бакета (ListObjectsV2), скачивание новых и
изменившихся по размеру в MIRROR_DIR. В хранилище ничего не меняет и с диска
ничего не удаляет — зеркало только пополняется. Паспорта (закрытый раздел)
читаются подписанным запросом так же, как остальное, и на диске лежат с
правами 0600 в каталоге 0700.

Настройки — из того же файла, что у сервера xtrud-api (S3_ENDPOINT,
S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY). Только стандартная
библиотека Python: на сервере ничего не ставится.

Выход: 0 — всё скачано, 1 — были ошибки (перечислены), 2 — нет настроек.
"""

import datetime
import hashlib
import hmac
import os
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ENV_FILE = os.environ.get("XTRUD_API_ENV", "/opt/xtrud/xtrud-api.env")
MIRROR_DIR = os.environ.get("MIRROR_DIR", "/opt/xtrud/files-s3")
NS = "{http://s3.amazonaws.com/doc/2006-03-01/}"
REQUIRED = ("S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY")


def load_env(path):
    cfg = {}
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            cfg[key.strip()] = value.strip().strip('"').strip("'")
    return cfg


def quote(value):
    # SigV4: кодируется всё, кроме unreserved (A-Z a-z 0-9 - _ . ~).
    return urllib.parse.quote(value, safe="-_.~")


def signed_request(cfg, path, params=None):
    params = params or {}
    host = urllib.parse.urlparse(cfg["S3_ENDPOINT"]).netloc
    amz_date = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    day = amz_date[:8]
    payload_hash = hashlib.sha256(b"").hexdigest()
    query = "&".join(f"{quote(k)}={quote(v)}" for k, v in sorted(params.items()))
    headers = {"host": host, "x-amz-content-sha256": payload_hash, "x-amz-date": amz_date}
    names = sorted(headers)
    canonical = "\n".join(
        [
            "GET",
            path,
            query,
            "".join(f"{n}:{headers[n]}\n" for n in names),
            ";".join(names),
            payload_hash,
        ]
    )
    scope = f"{day}/{cfg['S3_REGION']}/s3/aws4_request"
    to_sign = "\n".join(
        ["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()]
    )
    key = ("AWS4" + cfg["S3_SECRET_KEY"]).encode()
    for part in (day, cfg["S3_REGION"], "s3", "aws4_request"):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    headers["Authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={cfg['S3_ACCESS_KEY']}/{scope}, "
        f"SignedHeaders={';'.join(names)}, Signature={signature}"
    )
    url = cfg["S3_ENDPOINT"].rstrip("/") + path + (f"?{query}" if query else "")
    return urllib.request.Request(url, headers=headers, method="GET")


def list_objects(cfg):
    token = None
    while True:
        params = {"list-type": "2"}
        if token:
            params["continuation-token"] = token
        req = signed_request(cfg, f"/{cfg['S3_BUCKET']}/", params)
        with urllib.request.urlopen(req, timeout=60) as resp:
            root = ET.fromstring(resp.read())
        for item in root.iter(f"{NS}Contents"):
            yield item.findtext(f"{NS}Key"), int(item.findtext(f"{NS}Size") or 0)
        if (root.findtext(f"{NS}IsTruncated") or "false") != "true":
            return
        token = root.findtext(f"{NS}NextContinuationToken")


def safe_local_path(key):
    # Ключ не должен выводить за пределы зеркала.
    parts = key.split("/")
    if not key or key.startswith("/") or any(p in ("", ".", "..") for p in parts):
        return None
    return os.path.join(MIRROR_DIR, *parts)


def main():
    try:
        cfg = load_env(ENV_FILE)
    except OSError as exc:
        print(f"нет файла настроек {ENV_FILE}: {exc}", file=sys.stderr)
        return 2
    missing = [k for k in REQUIRED if not cfg.get(k)]
    if missing:
        print(f"не заданы: {', '.join(missing)}", file=sys.stderr)
        return 2

    os.makedirs(MIRROR_DIR, mode=0o700, exist_ok=True)
    os.chmod(MIRROR_DIR, 0o700)
    total = downloaded = skipped = 0
    failed = []
    for key, size in list_objects(cfg):
        total += 1
        local = safe_local_path(key)
        if local is None:
            failed.append(f"{key}: недопустимый ключ")
            continue
        if os.path.isfile(local) and os.path.getsize(local) == size:
            skipped += 1
            continue
        path = f"/{cfg['S3_BUCKET']}/" + "/".join(quote(p) for p in key.split("/"))
        try:
            with urllib.request.urlopen(signed_request(cfg, path), timeout=120) as resp:
                body = resp.read()
        except Exception as exc:  # noqa: BLE001 — любой сбой сети пишем и идём дальше
            failed.append(f"{key}: {exc}")
            continue
        if len(body) != size:
            failed.append(f"{key}: получено {len(body)} Б вместо {size}")
            continue
        os.makedirs(os.path.dirname(local), mode=0o700, exist_ok=True)
        tmp = f"{local}.tmp"
        with open(tmp, "wb") as fh:
            fh.write(body)
        os.chmod(tmp, 0o600)
        os.replace(tmp, local)
        downloaded += 1

    print(
        f"зеркало S3: объектов {total}, скачано {downloaded}, "
        f"уже было {skipped}, ошибок {len(failed)}"
    )
    for line in failed:
        print(f"ОШИБКА {line}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
