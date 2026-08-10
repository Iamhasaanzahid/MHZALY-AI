"""
security.py

Defensive security and auditing helpers for the MHZALY AI assistant.
- secret scanning for common patterns
- pip-audit / bandit integration (if installed)
- local system health checks
- simple encrypted credential helper using Fernet (optional)
- structured logging utilities

This file is intentionally defensive and informational. It does not perform
network scanning, offensive actions, or unauthorized operations.
"""
import os
import json
import re
import subprocess
import platform
import logging
from datetime import datetime

try:
    from cryptography.fernet import Fernet
except Exception:
    Fernet = None

LOG_PATH = os.environ.get("SECURITY_LOG", "security_log.jsonl")

logger = logging.getLogger("security")
logger.setLevel(logging.INFO)

if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)


def _log(entry):
    payload = {"ts": datetime.utcnow().isoformat() + "Z", **entry}
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception:
        pass


# Secret scanning (very simple heuristics)
SECRET_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),  # AWS access key
    re.compile(r"(?i)aws(.{0,20})?(secret|key)"),
    re.compile(r"AIza[0-9A-Za-z\-_]{35}"),  # Google API key
    re.compile(r"ghp_[0-9A-Za-z]{36}"),  # GitHub token pattern
    re.compile(r"xox[baprs]-[0-9a-zA-Z]{10,}")  # Slack token-ish
]


def scan_file_for_secrets(path):
    results = []
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f, start=1):
                for p in SECRET_PATTERNS:
                    if p.search(line):
                        results.append({"path": path, "line": i, "match": p.pattern, "text": line.strip()[:200]})
    except Exception as e:
        logger.warning("scan_file_for_secrets failed: %s", e)
    return results


def scan_repo_for_secrets(root="."):
    findings = []
    for dirpath, dirnames, filenames in os.walk(root):
        # skip common binary directories
        if any(part in (".git", "venv", "env", "__pycache__") for part in dirpath.split(os.sep)):
            continue
        for fn in filenames:
            if fn.endswith(('.py', '.env', '.txt', '.md', '.yaml', '.yml', '.json', '.ini')):
                findings.extend(scan_file_for_secrets(os.path.join(dirpath, fn)))
    _log({"type": "secret_scan", "findings": len(findings)})
    return findings


# Dependency auditing

def run_pip_audit():
    """Run pip-audit if available and return parsed JSON results or text."""
    try:
        res = subprocess.run(["pip-audit", "-f", "json"], capture_output=True, text=True, check=False)
        if res.returncode == 0 or res.stdout:
            try:
                return True, json.loads(res.stdout)
            except Exception:
                return True, res.stdout
        return False, res.stderr or res.stdout
    except FileNotFoundError:
        return False, "pip-audit not installed"
    except Exception as e:
        return False, str(e)


def run_bandit(target="."):
    """Run bandit static analysis if available and return output text."""
    try:
        res = subprocess.run(["bandit", "-r", target, "-f", "json"], capture_output=True, text=True, check=False)
        if res.stdout:
            try:
                return True, json.loads(res.stdout)
            except Exception:
                return True, res.stdout
        return False, res.stderr or res.stdout
    except FileNotFoundError:
        return False, "bandit not installed"
    except Exception as e:
        return False, str(e)


# System info and lightweight health checks
def system_health():
    info = {
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "machine": platform.machine(),
    }
    _log({"type": "system_health", "info": info})
    return info


# Simple Fernet-based secret helper
def generate_key():
    if Fernet is None:
        raise RuntimeError("cryptography.fernet not available")
    return Fernet.generate_key().decode()


def encrypt_secret(key, plaintext):
    if Fernet is None:
        raise RuntimeError("cryptography.fernet not available")
    f = Fernet(key.encode())
    return f.encrypt(plaintext.encode()).decode()


def decrypt_secret(key, token):
    if Fernet is None:
        raise RuntimeError("cryptography.fernet not available")
    f = Fernet(key.encode())
    return f.decrypt(token.encode()).decode()


# Structured logging helper
def audit_log(event_type, details):
    entry = {"type": event_type, "details": details}
    _log(entry)
    logger.info("AUDIT %s %s", event_type, details)


if __name__ == "__main__":
    print("Security helpers available. Running light checks...")
    print(system_health())
    print("Scanning repo for secrets (this may take a while)...")
    s = scan_repo_for_secrets()
    print(f"Found {len(s)} potential secret lines. Use scan_file_for_secrets() for details.")
