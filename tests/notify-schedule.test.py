import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location("notify", Path(__file__).resolve().parents[1] / "scripts/notify-schedule.py")
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)

ENV = {
    "SMTP_HOST": "smtp.example.com", "SMTP_PORT": "587", "SMTP_USER": "sender",
    "SMTP_PASSWORD": "secret-value", "MAIL_FROM": "from@example.com", "MAIL_TO": "to@example.com",
    "UPDATE_STATUS": "failure", "PUBLISH_OUTCOME": "success", "COMMIT_OUTCOME": "failure",
    "GITHUB_REPOSITORY": "owner/repo", "GITHUB_RUN_ID": "123",
}


class NotificationTest(unittest.TestCase):
    def test_configuration_requires_secrets_and_secure_ports(self):
        self.assertEqual(notify.configuration(ENV), 587)
        for key in ("SMTP_PASSWORD", "MAIL_TO"):
            with self.assertRaises(ValueError):
                notify.configuration({**ENV, key: ""})
        with self.assertRaises(ValueError):
            notify.configuration({**ENV, "SMTP_PORT": "25"})
        with self.assertRaises(ValueError):
            notify.configuration({**ENV, "MAIL_TO": "to@example.com\nBcc: other@example.com"})

    def test_report_has_status_run_link_and_no_credentials(self):
        report = notify.message(ENV).get_content()
        self.assertIn("failure", report)
        self.assertIn("Production import: success", report)
        self.assertIn("https://github.com/owner/repo/actions/runs/123", report)
        self.assertNotIn(ENV["SMTP_PASSWORD"], report)

    def test_starttls_and_implicit_tls_delivery(self):
        for port in ("587", "465"):
            smtp = MagicMock()
            smtp.__enter__.return_value = smtp
            with patch.dict(notify.os.environ, {**ENV, "SMTP_PORT": port}, clear=True), patch.object(notify.sys, "argv", ["notify"]), patch.object(notify.smtplib, "SMTP", return_value=smtp) as plain, patch.object(notify.smtplib, "SMTP_SSL", return_value=smtp) as secure:
                notify.main()
                smtp.login.assert_called_once_with("sender", "secret-value")
                smtp.send_message.assert_called_once()
                if port == "587":
                    plain.assert_called_once()
                    smtp.starttls.assert_called_once()
                    secure.assert_not_called()
                else:
                    secure.assert_called_once()
                    plain.assert_not_called()
                    smtp.starttls.assert_not_called()


if __name__ == "__main__":
    unittest.main()
