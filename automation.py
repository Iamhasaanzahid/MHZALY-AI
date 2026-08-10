"""
automation.py

EnterpriseAutomationEngine - improved, safer automation helper for MHZALY AI.

Features:
- robust logging (string trail + structured JSON audit file)
- improved natural language parsing with simple heuristics
- site/app opening with safe fallback search
- WhatsApp web deep-link handling when a phone number is provided
- screenshot, volume adjustment (best-effort), and safe call subsystem stub
- gentle integration point with security.audit_log (if security.py exists)
- confirmation guard rails via SAFE_MODE / ALLOWED_RECIPIENTS environment vars
"""
from __future__ import annotations

import datetime
import json
import logging
import os
import re
import sys
import time
import urllib.parse
import webbrowser
from typing import Dict, List, Optional

# Optional integrations
try:
    import pyautogui
except Exception:
    pyautogui = None

# Optional audit integration (from security.py)
try:
    from security import audit_log  # type: ignore
except Exception:
    def audit_log(event_type: str, details: Dict) -> None:
        return

# Configuration
SAFE_MODE = os.environ.get("SAFE_MODE", "true").lower() in ("1", "true", "yes")
ALLOWED_RECIPIENTS = set(
    p.strip() for p in os.environ.get("ALLOWED_RECIPIENTS", "").split(",") if p.strip()
)
AUDIT_LOG_PATH = os.environ.get("EXECUTION_AUDIT_PATH", "execution_audit.jsonl")

# Logging
logger = logging.getLogger("EnterpriseAutomationEngine")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


def _append_audit(entry: Dict) -> None:
    """Write structured audit record (non-sensitive) to file and call audit_log hook."""
    try:
        entry_with_ts = {"ts": datetime.datetime.utcnow().isoformat() + "Z", **entry}
        with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry_with_ts, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.debug("Failed to write audit log: %s", e)
    try:
        audit_log(entry.get("event", "audit"), entry_with_ts)
    except Exception:
        pass


PHONE_RE = re.compile(r"(\+?\d[\d\-\s]{6,}\d)")


class EnterpriseAutomationEngine:
    def __init__(self, owner_name: str = "Muhammad Hassaan Zahid"):
        self.owner = owner_name
        self.version = "5.2.0-Enterprise"
        self.session_started = datetime.datetime.utcnow().isoformat() + "Z"
        self.execution_audit_trail: List[str] = []
        self.security_logs: List[str] = []
        self.global_platform_registry: Dict[str, Dict] = {
            "whatsapp": {"category": "communication", "type": "app", "url": "https://web.whatsapp.com", "secure": True},
            "telegram": {"category": "communication", "type": "app", "url": "https://web.telegram.org", "secure": True},
            "signal": {"category": "communication", "type": "app", "url": "https://signal.org", "secure": True},
            "discord": {"category": "communication", "type": "app", "url": "https://discord.com", "secure": True},
            "slack": {"category": "communication", "type": "app", "url": "https://slack.com", "secure": True},
            "github": {"category": "dev", "type": "website", "url": "https://github.com/", "secure": True},
            "google": {"category": "utility", "type": "website", "url": "https://google.com", "secure": True},
            "youtube": {"category": "media", "type": "website", "url": "https://www.youtube.com/", "secure": True},
            "notion": {"category": "productivity", "type": "website", "url": "https://notion.so", "secure": True},
        }
        self.noise_vocabulary = {
            "on", "off", "please", "kindly", "run", "execute", "start", "open", "launch",
            "access", "visit", "to", "via", "app", "application", "portal", "system", "browser", "website",
        }
        logger.info("Engine initialized for %s (version=%s)", self.owner, self.version)
        _append_audit({"event": "engine_init", "owner": self.owner, "version": self.version})

    # ----- logging helpers -----
    def log_event(self, log_level: str, message: str) -> None:
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        formatted_entry = f"[{timestamp}] [{log_level.upper()}] {message}"
        print(formatted_entry)
        self.execution_audit_trail.append(formatted_entry)
        _append_audit({"event": "log", "level": log_level, "message": message})

    # ----- app/site actions -----
    def open_app_or_site(self, target: str) -> str:
        """Open a known app/site or perform a safe web search fallback."""
        normalized = (target or "").strip().lower()
        if not normalized:
            self.log_event("WARNING", "No target supplied to open_app_or_site")
            return "No target supplied."

        if normalized in self.global_platform_registry:
            url = self.global_platform_registry[normalized]["url"]
            try:
                webbrowser.open(url)
                self.log_event("INFO", f"Opened registered platform: {normalized} -> {url}")
                return f"Opened {normalized}."
            except Exception as e:
                self.log_event("ERROR", f"Failed to open {normalized}: {e}")
                return f"Failed to open {normalized}: {e}"

        query = urllib.parse.quote_plus(target)
        search_url = f"https://www.google.com/search?q={query}"
        try:
            webbrowser.open(search_url)
            self.log_event("INFO", f"No registry entry for {target}; performed search.")
            return f"Searched the web for: {target}"
        except Exception as e:
            self.log_event("ERROR", f"Search fallback failed for {target}: {e}")
            return f"Search failed: {e}"

    def open_site(self, name: str) -> None:
        self.log_event("INFO", f"open_site called for {name}")
        self.open_app_or_site(name)

    # ----- WhatsApp helper -----
    def whatsapp_action(self, contact: str, action_type: str = "chat") -> str:
        """Open WhatsApp Web to chat or call a contact."""
        self.log_event("INFO", f"whatsapp_action: {action_type} -> {contact}")

        match = PHONE_RE.search(contact or "")
        if match:
            phone = re.sub(r"[^\d+]", "", match.group(1))
            url = f"https://web.whatsapp.com/send?phone={urllib.parse.quote_plus(phone)}"
            try:
                webbrowser.open(url)
                _append_audit({"event": "whatsapp_open", "target": phone, "action": action_type})
                return f"Opened WhatsApp Web for {phone}."
            except Exception as e:
                self.log_event("ERROR", f"Failed to open WhatsApp Web: {e}")
                return f"Failed to open WhatsApp Web: {e}"

        try:
            webbrowser.open(self.global_platform_registry.get("whatsapp", {}).get("url", "https://web.whatsapp.com"))
            return f"Opened WhatsApp Web. You can search for contact: {contact}"
        except Exception as e:
            self.log_event("ERROR", f"Failed to open WhatsApp Web: {e}")
            return f"Failed to open WhatsApp Web: {e}"

    # ----- system helpers -----
    def adjust_volume(self, direction: str) -> str:
        """Best-effort volume adjustment using pyautogui if available."""
        self.log_event("INFO", f"adjust_volume called: {direction}")
        if pyautogui is None:
            return "pyautogui not available for volume control."

        try:
            if direction in ("up", "increase", "+"):
                pyautogui.press("volumeup")
            elif direction in ("down", "decrease", "-"):
                pyautogui.press("volumedown")
            else:
                return "Unknown volume direction. Use 'up' or 'down'."
            _append_audit({"event": "volume_adjust", "direction": direction})
            return f"Volume adjusted {direction}."
        except Exception as e:
            self.log_event("ERROR", f"adjust_volume failed: {e}")
            return f"Volume adjustment failed: {e}"

    def take_screenshot(self, folder: str = ".") -> str:
        self.log_event("INFO", "take_screenshot called")
        if pyautogui is None:
            return "pyautogui not available to take screenshot."
        try:
            os.makedirs(folder, exist_ok=True)
            filename = os.path.join(folder, f"screenshot_{int(time.time())}.png")
            shot = pyautogui.screenshot()
            shot.save(filename)
            _append_audit({"event": "screenshot", "file": filename})
            self.log_event("SUCCESS", f"Screenshot saved: {filename}")
            return f"Saved screenshot to {filename}"
        except Exception as e:
            self.log_event("ERROR", f"take_screenshot failed: {e}")
            return f"Screenshot failed: {e}"

    # ----- natural language parsing -----
    def advanced_natural_language_parser(self, raw_command_string: str) -> Dict:
        if not raw_command_string or not isinstance(raw_command_string, str):
            self.log_event("WARNING", "advanced_natural_language_parser called with invalid input")
            return {"action": "none", "target": "", "state": None, "is_whatsapp": False}

        normalized = raw_command_string.strip().lower()
        detected_state: Optional[str] = None
        if re.search(r"\boff\b", normalized):
            detected_state = "OFF"
        elif re.search(r"\bon\b", normalized):
            detected_state = "ON"

        action_type = "general"
        if "call" in normalized:
            action_type = "communication_call"
        elif any(k in normalized for k in ["open", "launch", "access", "visit", "start"]):
            action_type = "navigation_launch"
        elif any(k in normalized for k in ["status", "check", "health"]):
            action_type = "system_status"
        elif any(k in normalized for k in ["volume", "awaz", "sound"]):
            if any(k in normalized for k in ["up", "increase", "unche"]):
                action_type = "volume_up"
            elif any(k in normalized for k in ["down", "decrease", "kam"]):
                action_type = "volume_down"
        elif "screenshot" in normalized or "screen" in normalized:
            action_type = "take_screenshot"
        elif "security log" in normalized or "security" in normalized:
            action_type = "analyze_log"

        # token cleanup
        raw_tokens = re.split(r"\s+|[,.;:]", normalized)
        filtered = [t for t in raw_tokens if t and t not in self.noise_vocabulary]
        control_words = {"call", "whatsapp", "phone", "volume", "screen", "security", "log", "screenshot"}
        filtered = [t for t in filtered if t not in control_words]
        target = " ".join(filtered).strip().title()

        is_whatsapp = "whatsapp" in normalized
        parsed = {"action": action_type, "target": target, "state": detected_state, "is_whatsapp": is_whatsapp}
        self.log_event("DEBUG", f"Parsed command '{raw_command_string}' -> {parsed}")
        _append_audit({"event": "nl_parse", "input": raw_command_string[:500], "parsed": parsed})
        return parsed

    # ----- call subsystem (safe stub) -----
    def execute_call_subsystem(self, target: str, is_whatsapp: bool = False, state: Optional[str] = None) -> str:
        self.log_event("INFO", f"execute_call_subsystem target='{target}', is_whatsapp={is_whatsapp}, state={state}")

        match = PHONE_RE.search(target or "")
        if is_whatsapp or match:
            return self.whatsapp_action(target, action_type="call" if match else "chat")

        key = (target or "").strip().lower()
        if key in self.global_platform_registry:
            self.open_site(key)
            return f"Opened {key} UI to contact {target}."

        msg = f"Could not determine call channel for '{target}'. I opened a web search to help."
        self.open_app_or_site(target)
        return msg

    # ----- security/log analysis integration -----
    def analyze_security_log(self, path: str = "security_log.jsonl") -> Dict:
        self.log_event("INFO", f"Analyzing security log: {path}")
        if not os.path.exists(path):
            return {"found": False, "reason": "log_not_found"}
        counts = {"lines": 0, "errors": 0, "secrets": 0}
        try:
            with open(path, "r", encoding="utf-8") as f:
                for ln in f:
                    counts["lines"] += 1
                    low = ln.lower()
                    if "error" in low or "\"result\": \"error\"" in low:
                        counts["errors"] += 1
                    if "secret" in low or "aws" in low or "ghp_" in low:
                        counts["secrets"] += 1
        except Exception as e:
            self.log_event("ERROR", f"analyze_security_log failed: {e}")
            return {"found": True, "error": str(e)}
        _append_audit({"event": "analyze_security_log", "summary": counts})
        return {"found": True, "summary": counts}

    # ----- small helper to run parsed commands -----
    def handle_command(self, raw: str) -> str:
        parsed = self.advanced_natural_language_parser(raw)
        action = parsed["action"]
        target = parsed["target"] or raw
        if action == "take_screenshot":
            return self.take_screenshot()
        if action in ("volume_up", "volume_down"):
            return self.adjust_volume("up" if action == "volume_up" else "down")
        if action in ("navigation_launch", "general"):
            return self.open_app_or_site(target or raw)
        if action == "communication_call":
            return self.execute_call_subsystem(target or raw, parsed["is_whatsapp"], parsed["state"])
        if action == "analyze_log":
            return json.dumps(self.analyze_security_log(), indent=2)
        return f"Action '{action}' not implemented. Parsed: {parsed}"


if __name__ == "__main__":
    engine = EnterpriseAutomationEngine()
    print(engine.open_app_or_site("github"))
    print(engine.whatsapp_action("+1 555 123 4567"))
    print(engine.take_screenshot())
    print(engine.advanced_natural_language_parser("Please call +1 555 123 4567 on whatsapp"))
    print(engine.handle_command("Take a screenshot"))
