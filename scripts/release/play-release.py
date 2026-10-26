#!/usr/bin/env python3
"""Выложить AAB в Google Play через Android Publisher API (service account).

    python3 scripts/release/play-release.py <xtrud.aab> <mapping.txt> <notes.txt> [track]

track — production (по умолчанию) или internal. Ключ сервисного аккаунта —
/root/.config/xtrud/google-play/service-account.json (не в Git). Порядок:
edit → bundle → mapping → трек с заметками ru-RU → commit; затем печатает
состояние треков. Раньше скрипт писался заново в каждой сессии во временной
папке и пропадал — теперь живёт здесь (№363).
"""

import base64
import json
import sys
import time
import urllib.error
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

KEY = "/root/.config/xtrud/google-play/service-account.json"
PKG = "com.xtrud.app"
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PKG}"
UPLOAD = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PKG}"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def token() -> str:
    sa = json.load(open(KEY))
    now = int(time.time())
    claims = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }
    head = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    body = b64(json.dumps(claims).encode())
    key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
    sig = key.sign(f"{head}.{body}".encode(), padding.PKCS1v15(), hashes.SHA256())
    form = f"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion={head}.{body}.{b64(sig)}"
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=form.encode(), method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    return json.load(urllib.request.urlopen(req))["access_token"]


def call(tok, method, url, body=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {tok}")
    req.add_header("Content-Type", "application/octet-stream" if raw is not None else "application/json")
    try:
        resp = urllib.request.urlopen(req, timeout=600)
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url.split(PKG)[-1]} → {e.code}: {e.read().decode()[:600]}")
    text = resp.read().decode()
    return json.loads(text) if text else {}


def main():
    aab, mapping, notes_file = sys.argv[1:4]
    track = sys.argv[4] if len(sys.argv) > 4 else "production"
    notes = open(notes_file).read().strip()
    if len(notes) > 500:
        sys.exit(f"заметки длиннее 500 символов: {len(notes)}")
    tok = token()
    edit = call(tok, "POST", f"{API}/edits", {})["id"]
    vc = call(tok, "POST", f"{UPLOAD}/edits/{edit}/bundles?uploadType=media", raw=open(aab, "rb").read())["versionCode"]
    print("bundle versionCode", vc)
    call(tok, "POST", f"{UPLOAD}/edits/{edit}/apks/{vc}/deobfuscationFiles/proguard?uploadType=media", raw=open(mapping, "rb").read())
    print("mapping uploaded")
    release = {"versionCodes": [str(vc)], "status": "completed", "releaseNotes": [{"language": "ru-RU", "text": notes}]}
    call(tok, "PUT", f"{API}/edits/{edit}/tracks/{track}", {"track": track, "releases": [release]})
    call(tok, "POST", f"{API}/edits/{edit}:commit")
    print("committed edit", edit)
    check = call(tok, "POST", f"{API}/edits", {})["id"]
    for t in call(tok, "GET", f"{API}/edits/{check}/tracks").get("tracks", []):
        for r in t.get("releases", []):
            print(t["track"], r.get("status"), r.get("versionCodes"), r.get("name", ""))
    call(tok, "DELETE", f"{API}/edits/{check}")


if __name__ == "__main__":
    main()
