"""
automation.py

Contains safe helper functions to:
 - automate desktop UI (pyautogui)
 - send email (smtplib)
 - send SMS / WhatsApp / call via Twilio (official API)
 - send messages to Slack via webhook
 - run composed tasks

Security & safety design choices:
 - All network credentials must be supplied by environment variables or .env
 - Recipient numbers/IDs must be explicitly listed in allowed_recipients for sending
 - Simple rate-limit cooldowns and an explicit "require_confirmation" option for risky ops
 - Use official APIs (Twilio, SMTP, Slack webhooks). Do NOT scrape or reverse-engineer other apps.
"""

import os
import sys
import time
import json
import threading
import smtplib
from email.message import EmailMessage
import requests

# Try to import audit_log from security.py (if present); otherwise no-op
try:
    from security import audit_log
except Exception:
    def audit_log(event_type, details):
        pass

SAFE_MODE = os.environ.get("SAFE_MODE", "true").lower() in ("1", "true", "yes")

# Optional libs
try:
    import pyautogui
except Exception:
    pyautogui = None

try:
    from twilio.rest import Client as TwilioClient
except Exception:
    TwilioClient = None

# Simple in-memory rate-limiter (not persistent)
_last_sent = {}
DEFAULT_COOLDOWN = 30  # seconds

# Allowed recipients (must be configured by you)
ALLOWED_RECIPIENTS = os.environ.get("ALLOWED_RECIPIENTS", "")  # comma-separated numbers/emails/ids
_allowed_set = set([s.strip() for s in ALLOWED_RECIPIENTS.split(",") if s.strip()])

def _cooldown_check(key, cooldown=DEFAULT_COOLDOWN):
    now = time.time()
    last = _last_sent.get(key, 0)
    if now - last < cooldown:
        return False, cooldown - (now - last)
    _last_sent[key] = now
    return True, 0

def _require_allowed(recipient):
    if not _allowed_set:
        # If none configured, require interactive confirmation
        print("WARNING: No ALLOWED_RECIPIENTS configured. Interactive confirmation will be required.")
        return False
    return recipient in _allowed_set

def validate_config():
    # Simple checks for typical integrations. Return (ok, message)
    msgs = []
    if TwilioClient is None:
        msgs.append("twilio library not installed (pip install twilio) — Twilio actions disabled")
    if pyautogui is None:
        msgs.append("pyautogui not installed (pip install pyautogui) — desktop automation disabled")
    if not os.environ.get("SMTP_USERNAME") and not os.environ.get("TWILIO_ACCOUNT_SID"):
        msgs.append("No SMTP_USERNAME or TWILIO_ACCOUNT_SID detected — messaging/calls disabled until configured")
    return (len(msgs) == 0, "; ".join(msgs) if msgs else "All good")

def load_tasks(path="tasks.json"):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# Desktop automation (very simple)
def open_app(path_or_command):
    try:
        if os.name == "nt":
            os.startfile(path_or_command)
        elif sys.platform == "darwin":
            os.system(f"open '{path_or_command}' &")
        else:
            os.system(f"xdg-open '{path_or_command}' &")
        return True, "started"
    except Exception as e:
        return False, str(e)

def type_text(text, interval=0.02):
    if pyautogui is None:
        return False, "pyautogui not available"
    pyautogui.write(text, interval=interval)
    return True, "typed"

def press_key(key):
    if pyautogui is None:
        return False, "pyautogui not available"
    pyautogui.press(key)
    return True, "pressed"

# Email (SMTP)
def send_email(to_address, subject, body, require_confirmation=True, cooldown=DEFAULT_COOLDOWN):
    ok, wait = _cooldown_check(f"email:{to_address}", cooldown)
    if not ok:
        return False, f"Cooldown active, wait {wait:.1f}s"
    if require_confirmation and not _require_allowed(to_address):
        confirm = input(f"Send email to {to_address}? Type YES to confirm: ")
        if confirm.strip() != "YES":
            return False, "User cancelled"
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ.get("SMTP_USERNAME")
    pwd = os.environ.get("SMTP_PASSWORD")
    if not user or not pwd:
        return False, "SMTP credentials missing"
    msg = EmailMessage()
    msg["From"] = user
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(user, pwd)
            s.send_message(msg)
        audit_log("send_email", {"to": to_address, "subject": subject, "result": "sent", "require_confirmation": require_confirmation})
        return True, "email sent"
    except Exception as e:
        audit_log("send_email", {"to": to_address, "subject": subject, "result": "error", "error": str(e)})
        return False, str(e)

# Twilio: SMS, WhatsApp, and Calls
def _twilio_client():
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        return None
    if TwilioClient is None:
        return None
    return TwilioClient(sid, token)

def send_sms(to_number, body, from_number=None, require_confirmation=True, cooldown=DEFAULT_COOLDOWN):
    ok, wait = _cooldown_check(f"sms:{to_number}", cooldown)
    if not ok:
        return False, f"Cooldown active, wait {wait:.1f}s"
    if require_confirmation and not _require_allowed(to_number):
        confirm = input(f"Send SMS to {to_number}? Type YES to confirm: ")
        if confirm.strip() != "YES":
            return False, "User cancelled"
    client = _twilio_client()
    if client is None:
        return False, "Twilio not configured or library missing"
    from_ = from_number or os.environ.get("TWILIO_FROM_NUMBER")
    if not from_:
        return False, "TWILIO_FROM_NUMBER not configured"
    try:
        msg = client.messages.create(body=body, from_=from_, to=to_number)
        audit_log("send_sms", {"to": to_number, "from": from_, "sid": getattr(msg, 'sid', None)})
        return True, f"sent id={getattr(msg, 'sid', None)}"
    except Exception as e:
        audit_log("send_sms", {"to": to_number, "from": from_, "result": "error", "error": str(e)})
        return False, str(e)

def send_whatsapp(to_number, body, from_number=None, require_confirmation=True, cooldown=DEFAULT_COOLDOWN):
    # Twilio WhatsApp requires 'whatsapp:+123...' format
    if not to_number.startswith("whatsapp:"):
        to_number = "whatsapp:" + to_number
    if from_number and not from_number.startswith("whatsapp:"):
        from_number = "whatsapp:" + from_number
    return send_sms(to_number, body, from_number=from_number, require_confirmation=require_confirmation, cooldown=cooldown)

def make_call(to_number, twiml_url=None, from_number=None, require_confirmation=True, cooldown=DEFAULT_COOLDOWN):
    ok, wait = _cooldown_check(f"call:{to_number}", cooldown)
    if not ok:
        return False, f"Cooldown active, wait {wait:.1f}s"
    if require_confirmation and not _require_allowed(to_number):
        confirm = input(f"Place call to {to_number}? Type YES to confirm: ")
        if confirm.strip() != "YES":
            return False, "User cancelled"
    client = _twilio_client()
    if client is None:
        return False, "Twilio not configured or library missing"
    from_ = from_number or os.environ.get("TWILIO_FROM_NUMBER")
    if not from_:
        return False, "TWILIO_FROM_NUMBER not configured"
    try:
        call = client.calls.create(to=to_number, from_=from_, url=twiml_url or os.environ.get("DEFAULT_TWIML_URL"))
        audit_log("make_call", {"to": to_number, "from": from_, "sid": getattr(call, 'sid', None)})
        return True, f"call started id={getattr(call, 'sid', None)}"
    except Exception as e:
        audit_log("make_call", {"to": to_number, "result": "error", "error": str(e)})
        return False, str(e)

# Slack webhook
def send_slack(webhook_url, text, require_confirmation=True, cooldown=DEFAULT_COOLDOWN):
    key = f"slack:{webhook_url}"
    ok, wait = _cooldown_check(key, cooldown)
    if not ok:
        return False, f"Cooldown active, wait {wait:.1f}s"
    if require_confirmation and not _allowed_set:
        confirm = input(f"Post to Slack webhook? Type YES to confirm: ")
        if confirm.strip() != "YES":
            return False, "User cancelled"
    payload = {"text": text}
    try:
        r = requests.post(webhook_url, json=payload, timeout=10)
        r.raise_for_status()
        audit_log("send_slack", {"webhook_url": webhook_url, "text_preview": text[:200]})
        return True, "slack posted"
    except Exception as e:
        audit_log("send_slack", {"webhook_url": webhook_url, "result": "error", "error": str(e)})
        return False, str(e)

# Higher-level: run a "task" dict
def run_task(task):
    """
    Task format (JSON/dict) examples:
    {
      "name": "greet",
      "actions": [
         {"type": "open_app", "path": "/Applications/Notes.app"},
         {"type": "wait", "seconds": 2},
         {"type": "type", "text": "Hello, this is automated."},
         {"type": "send_sms", "to": "+1234567890", "body": "Automated alert", "require_confirmation": false}
      ]
    }
    """
    actions = task.get("actions", [])
    results = []
    for a in actions:
        t = a.get("type")
        try:
            if t == "open_app":
                res = open_app(a["path"])
            elif t == "type":
                res = type_text(a.get("text", ""))
            elif t == "press":
                res = press_key(a.get("key", "enter"))
            elif t == "wait":
                secs = float(a.get("seconds", 1))
                time.sleep(secs)
                res = (True, f"waited {secs}s")
            elif t == "send_email":
                res = send_email(a["to"], a.get("subject", ""), a.get("body", ""), require_confirmation=a.get("require_confirmation", True))
            elif t == "send_sms":
                res = send_sms(a["to"], a.get("body", ""), from_number=a.get("from"), require_confirmation=a.get("require_confirmation", True))
            elif t == "send_whatsapp":
                res = send_whatsapp(a["to"], a.get("body", ""), from_number=a.get("from"), require_confirmation=a.get("require_confirmation", True))
            elif t == "call":
                res = make_call(a["to"], twiml_url=a.get("twiml_url"), from_number=a.get("from"), require_confirmation=a.get("require_confirmation", True))
            elif t == "slack":
                res = send_slack(a["webhook_url"], a.get("text", ""), require_confirmation=a.get("require_confirmation", True))
            else:
                res = (False, f"unknown action type {t}")
        except Exception as exc:
            res = (False, str(exc))
        results.append({"action": a, "result": res})
    # Optional: return or log results to a file
    log_path = os.environ.get("AUTOMATION_LOG", "automation_log.jsonl")
    try:
        with open(log_path, "a", encoding="utf-8") as lf:
            lf.write(json.dumps({"task": task.get("name"), "results": results, "ts": time.time()}) + "\n")
    except Exception:
        pass
    print("Task", task.get("name"), "completed. Results:", results)
    return results
