#!/usr/bin/env python3
"""Send schedule workflow reports using authenticated SMTP (STARTTLS or TLS)."""

import os
import smtplib
import ssl
import sys
from email.message import EmailMessage


def configuration(env):
    required = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM", "MAIL_TO")
    missing = [key for key in required if not env.get(key)]
    if missing:
        raise ValueError("Missing notification secrets: " + ", ".join(missing))
    port = int(env["SMTP_PORT"])
    if port not in (465, 587):
        raise ValueError("SMTP_PORT must be 465 (TLS) or 587 (STARTTLS).")
    for key in ("SMTP_HOST", "MAIL_FROM", "MAIL_TO"):
        if "\r" in env[key] or "\n" in env[key]:
            raise ValueError(f"Invalid {key}.")
    return port


def message(env):
    status = env.get("UPDATE_STATUS", "unknown")
    repository = env.get("GITHUB_REPOSITORY", "unknown repository")
    run_url = f"{env.get('GITHUB_SERVER_URL', 'https://github.com')}/{repository}/actions/runs/{env.get('GITHUB_RUN_ID', '')}"
    mail = EmailMessage()
    mail["Subject"] = f"[FON raspored] {status}: weekly schedule update"
    mail["From"] = env["MAIL_FROM"]
    mail["To"] = env["MAIL_TO"]
    mail.set_content(
        f"Status: {status}\n"
        f"Production import: {env.get('PUBLISH_OUTCOME', 'not run')}\n"
        f"Data commit: {env.get('COMMIT_OUTCOME', 'not run')}\n\n"
        f"Logs and source-document archive: {run_url}\n\n"
        "If import succeeded but a later step failed, the database may already be updated.\n"
        "An unchanged catalog does not increment the schedule version.\n"
    )
    return mail


def main():
    port = configuration(os.environ)
    if sys.argv[1:] == ["--check"]:
        print("Notification configuration present; SMTP delivery will be checked when sending.")
        return
    if sys.argv[1:]:
        raise ValueError("Usage: notify-schedule.py [--check]")
    context = ssl.create_default_context()
    if port == 465:
        connection = smtplib.SMTP_SSL(os.environ["SMTP_HOST"], port, timeout=30, context=context)
    else:
        connection = smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=30)
    with connection as smtp:
        if port == 587:
            smtp.starttls(context=context)
        smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(message(os.environ))
    print("Schedule execution report sent.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # SMTP responses can contain account information; never print credentials.
        print(f"Email report failed ({type(error).__name__}). Check notification secrets and SMTP access.", file=sys.stderr)
        sys.exit(1)
