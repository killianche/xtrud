#!/usr/bin/env python3
"""
Внешний монитор xtrud (№305, владелец 2026-10-08: «присылай мне в Telegram
и на почту»). Запускается раз в минуту с VDS — не с Beget, поэтому видит и
полное падение сервера (28–30.09 сервер лежал 59 ч, и никто не узнал).

Проверки: API /v2/health, сайт, админка, место на диске Beget, свежесть
ночной копии базы. Оповещение — при смене состояния (упало / восстановилось),
плюс напоминание раз в час, пока лежит. Состояние — в STATE_FILE.

Настройки — /root/.config/xtrud/monitor.env (вне Git):
  TELEGRAM_BOT_TOKEN=...   TELEGRAM_CHAT_ID=...
  SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=... SMTP_PASSWORD=...
  ALERT_EMAIL=pmrhhm@gmail.com
Пустое — канал пропускается (пишется только в журнал).
"""
import json, os, smtplib, ssl, subprocess, sys, time, urllib.request
from email.mime.text import MIMEText

ENV_FILE = "/root/.config/xtrud/monitor.env"
STATE_FILE = "/var/lib/xtrud-monitor/state.json"
LOG_FILE = "/var/log/xtrud-monitor.log"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "root@217.114.8.196"]
REMIND_SEC = 3600


def load_env():
    env = {}
    try:
        for line in open(ENV_FILE, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env


def http_ok(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "xtrud-monitor"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return 200 <= r.status < 400, f"HTTP {r.status}"
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:120]


def ssh_out(cmd):
    try:
        return subprocess.run(SSH + [cmd], capture_output=True, text=True, timeout=25).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def checks():
    res = {}
    # Два подряд неудачных ответа — чтобы не будить из-за одной сетевой икоты.
    for name, url in [
        ("API", "https://api.xtrud.pro/v2/health"),
        ("Сайт", "https://xtrud.pro/"),
        ("Админка", "https://xtrud.pro/admin/"),
    ]:
        ok, detail = http_ok(url)
        if not ok:
            time.sleep(5)
            ok, detail = http_ok(url)
        res[name] = (ok, detail)
    disk = ssh_out("df --output=pcent / | tail -1 | tr -dc 0-9")
    if disk.isdigit():
        res["Диск"] = (int(disk) < 90, f"занято {disk}%")
    else:
        res["Диск"] = (res["API"][0], "нет ответа по SSH") if not res["API"][0] else (True, "SSH не ответил")
    age = ssh_out("echo $(( $(date +%s) - $(stat -c %Y /var/log/xtrud-backup.log 2>/dev/null || echo 0) ))")
    if age.isdigit():
        hours = int(age) // 3600
        res["Копия базы"] = (hours <= 30, f"последняя {hours} ч назад")
    return res


def send(env, text):
    sent = []
    if env.get("TELEGRAM_BOT_TOKEN") and env.get("TELEGRAM_CHAT_ID"):
        try:
            data = json.dumps({"chat_id": env["TELEGRAM_CHAT_ID"], "text": text}).encode()
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{env['TELEGRAM_BOT_TOKEN']}/sendMessage",
                data=data, headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=15)
            sent.append("telegram")
        except Exception as e:  # noqa: BLE001
            log(f"telegram error: {str(e)[:80]}")
    if env.get("SMTP_USER") and env.get("SMTP_PASSWORD") and env.get("ALERT_EMAIL"):
        try:
            msg = MIMEText(text, _charset="utf-8")
            msg["Subject"] = text.splitlines()[0][:120]
            msg["From"] = env["SMTP_USER"]
            msg["To"] = env["ALERT_EMAIL"]
            with smtplib.SMTP_SSL(env.get("SMTP_HOST", "smtp.gmail.com"), int(env.get("SMTP_PORT", "465")),
                                  context=ssl.create_default_context(), timeout=20) as s:
                s.login(env["SMTP_USER"], env["SMTP_PASSWORD"])
                s.send_message(msg)
            sent.append("email")
        except Exception as e:  # noqa: BLE001
            log(f"email error: {str(e)[:80]}")
    return sent


def log(line):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + line + "\n")


def main():
    env = load_env()
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    try:
        state = json.load(open(STATE_FILE))
    except Exception:  # noqa: BLE001
        state = {}
    now = int(time.time())
    if "--test" in sys.argv:
        print(send(env, "xtrud: проверка оповещений — канал работает."))
        return
    for name, (ok, detail) in checks().items():
        prev = state.get(name, {"ok": True, "since": now, "notified": 0})
        if ok and not prev["ok"]:
            mins = (now - prev["since"]) // 60
            ch = send(env, f"✅ xtrud: {name} снова работает ({detail}). Не работало {mins} мин.")
            log(f"UP {name} {detail} after {mins}m sent={ch}")
            state[name] = {"ok": True, "since": now, "notified": now}
        elif not ok and prev["ok"]:
            ch = send(env, f"🔴 xtrud: {name} не работает — {detail}.")
            log(f"DOWN {name} {detail} sent={ch}")
            state[name] = {"ok": False, "since": now, "notified": now}
        elif not ok and now - prev.get("notified", 0) >= REMIND_SEC:
            hours = (now - prev["since"]) // 3600
            ch = send(env, f"🔴 xtrud: {name} всё ещё не работает ({hours} ч) — {detail}.")
            log(f"STILL {name} {detail} sent={ch}")
            prev["notified"] = now
            state[name] = prev
        else:
            state.setdefault(name, prev)
    json.dump(state, open(STATE_FILE, "w"))


if __name__ == "__main__":
    main()
