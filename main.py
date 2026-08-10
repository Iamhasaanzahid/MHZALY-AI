"""
main.py
Entry point for the local automation agent.

Usage:
  - Install dependencies (see README section below).
  - Put credentials in a .env file or environment variables.
  - Define tasks in tasks.json or pass a single task via CLI.

Examples:
  python main.py run-task greet
  python main.py start   # run scheduler loop (reads tasks.json)
"""

import os
import sys
import time
import json
import argparse
from dotenv import load_dotenv
import schedule

from automation import run_task, load_tasks, validate_config

load_dotenv()

def schedule_tasks_from_file(path="tasks.json", interval_seconds=60):
    tasks = load_tasks(path)
    if not tasks:
        print("No tasks found in", path)
        return
    for t in tasks:
        # schedule by cron-like or every-X-second support: here we support "every_minutes" and "at_time"
        name = t.get("name", "<unnamed>")
        if "every_minutes" in t:
            mins = int(t["every_minutes"])
            schedule.every(mins).minutes.do(lambda task=t: run_task(task))
            print(f"Scheduled task {name} every {mins} minutes")
        elif "at_time" in t:
            # at_time should be "HH:MM"
            schedule.every().day.at(t["at_time"]).do(lambda task=t: run_task(task))
            print(f"Scheduled task {name} at {t['at_time']} daily")
        else:
            # default: schedule once at startup
            schedule.every(interval_seconds).seconds.do(lambda task=t: run_task(task)).tag(f"{name}_oneshot")
            print(f"Scheduled task {name} every {interval_seconds}s (fallback)")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "run-task", "show-tasks", "validate"], help="action")
    parser.add_argument("--task", "-t", help="task name to run (if run-task)")
    parser.add_argument("--tasks-file", "-f", default="tasks.json", help="path to tasks.json")
    args = parser.parse_args()

    # Basic config validation
    cfg_ok, cfg_msg = validate_config()
    if not cfg_ok:
        print("Configuration warning:", cfg_msg)

    if args.action == "show-tasks":
        tasks = load_tasks(args.tasks_file)
        print("Tasks:", json.dumps(tasks, indent=2))
        return

    if args.action == "run-task":
        if not args.task:
            print("Please provide --task <name>")
            return
        tasks = load_tasks(args.tasks_file)
        for t in tasks:
            if t.get("name") == args.task:
                print("Running task", args.task)
                run_task(t)
                return
        print("Task not found:", args.task)
        return

    if args.action == "start":
        schedule_tasks_from_file(args.tasks_file)
        print("Scheduler started. Press Ctrl+C to stop.")
        try:
            while True:
                schedule.run_pending()
                time.sleep(1)
        except KeyboardInterrupt:
            print("Scheduler stopped.")
            return

    if args.action == "validate":
        ok, msg = validate_config()
        print("Config OK?" , ok, msg)

if __name__ == "__main__":
    main()
