"""Real-keyboard regression journeys. Run after build: python3 test/quotes-terminal.test.py.
Uses a real PTY and the real prompt renderer, with a completely mocked HTTP layer.
"""
import copy
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import struct
import subprocess
import tempfile
import termios
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


class Terminal:
    def __init__(self, loaded=True, quote=None, failure=None, rows=45, columns=180):
        self.temp = tempfile.TemporaryDirectory(prefix="sevdesk-terminal-")
        self.dir = Path(self.temp.name)
        self.log = self.dir / "events.jsonl"
        self.output = b""
        self.prompt_count = 0
        self.quote = copy.deepcopy(quote or json.loads((ROOT / "examples/quote.example.json").read_text()))
        self.quote["customer"] = {"number": "C-1"}
        if self.quote["positions"]:
            self.quote["positions"][0]["quantity"] = "2"
        self.quote["delivery"]["to"] = "alpha@example.com"
        self.input = self.dir / "input.json"
        self.input.write_text(json.dumps(self.quote))
        env = dict(os.environ)
        env.pop("CI", None)
        env.update(TERM="xterm-256color", SEVDESK_TOKEN="test-token", XDG_STATE_HOME=str(self.dir / "state"),
                   QUOTE_TEST_LOG=str(self.log), NODE_OPTIONS="--import=" + str(ROOT / "test/fixtures/quotes-terminal-api.mjs"))
        env.pop("QUOTE_TEST_FAILURE", None)
        if failure:
            env["QUOTE_TEST_FAILURE"] = failure
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
        command = ["node", str(ROOT / "dist/index.js"), "quotes:create"]
        if loaded:
            command.append(str(self.input))
        self.process = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, env=env, start_new_session=True)
        os.close(slave)

    def pump(self, seconds=.08):
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            if select.select([self.master], [], [], min(.02, max(0, until - time.monotonic())))[0]:
                try:
                    chunk = os.read(self.master, 65536)
                    if not chunk:
                        break
                    self.output += chunk
                except OSError:
                    break

    def events(self):
        if not self.log.exists():
            return []
        events = []
        for line in self.log.read_text().splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        return events

    def prompt(self, contains):
        until = time.monotonic() + 6
        while time.monotonic() < until:
            self.pump()
            prompts = [e for e in self.events() if e["event"] == "prompt"]
            if len(prompts) > self.prompt_count:
                event = prompts[self.prompt_count]
                self.prompt_count += 1
                assert contains in event["message"], (contains, event["message"], self.transcript())
                self.pump(.08)  # Give the actual renderer time to attach readline and raw mode.
                return event
            if self.process.poll() is not None:
                break
        raise AssertionError("Expected prompt " + contains + "\n" + self.transcript())

    def keys(self, value):
        os.write(self.master, value)
        self.pump(.04)

    def choose(self, contains, value):
        event = self.prompt(contains)
        options = event["options"]
        values = [v["value"] if isinstance(v, dict) else v for v in options]
        assert value in values, (value, values)
        start = values.index(event["initial"]) if event.get("initial") in values else 0
        target = values.index(value)
        for _ in range(abs(target - start)):
            self.keys(b"\x1b[B" if target > start else b"\x1b[A")
        self.keys(b"\r")
        return values

    def text(self, contains, value=None):
        self.prompt(contains)
        if value is not None:
            self.keys(b"\x15" + value.encode())
        self.keys(b"\r")

    def confirm(self, contains, answer):
        self.prompt(contains)
        self.keys(b"y" if answer else b"n")

    def cancel(self, contains):
        self.prompt(contains)
        self.keys(b"\x03")

    def finish(self, expected_code=0):
        until = time.monotonic() + 5
        while time.monotonic() < until and self.process.poll() is None:
            self.pump()
            prompts = [e for e in self.events() if e["event"] == "prompt"]
            if len(prompts) > self.prompt_count:
                event = prompts[self.prompt_count]
                if "Unsaved changes" in event["message"]:
                    self.choose("Unsaved changes", "discard")
                else:
                    raise AssertionError("Unexpected final prompt: " + str(event) + "\n" + self.transcript())
        assert self.process.poll() == expected_code, (self.process.poll(), self.transcript())
        self.pump()
        assert "Cannot read properties" not in self.transcript(), self.transcript()
        assert "ERROR" not in self.transcript(), self.transcript()
        assert "\nundefined" not in self.transcript().replace("\r", ""), self.transcript()

    def transcript(self):
        return ANSI.sub("", self.output.decode(errors="replace"))[-14000:]

    def close(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=3)
        os.close(self.master)
        self.temp.cleanup()


class TerminalJourneys(unittest.TestCase):
    def terminal(self, **kwargs):
        terminal = Terminal(**kwargs)
        self.addCleanup(terminal.close)
        return terminal

    def export_and_close(self, t):
        path = t.dir / "export.json"
        t.choose("Quote editor", "export")
        t.text("New export path", str(path))
        t.choose("Quote editor", "cancel")
        t.finish()
        return json.loads(path.read_text())

    def test_empty_search_reproduces_reported_bug(self):
        t = self.terminal(loaded=False)
        t.text("Search customer", None)
        choices = t.choose("Customer (Kunde)", "empty")
        self.assertIn("7", choices)
        self.assertIn("8", choices)
        t.choose("Quote editor", "cancel")
        t.finish()

    def test_clear_optional_multiline_text_without_chained_forms(self):
        t = self.terminal()
        t.choose("Quote editor", "texts:introduction")
        t.text("Introduction", "")
        exported = self.export_and_close(t)
        self.assertNotIn("introduction", exported["texts"])
        prompts = [e["message"] for e in t.events() if e["event"] == "prompt"]
        self.assertFalse(any("Terms (Bedingungen)" in p or "Review and finish" in p for p in prompts))

    def test_existing_position_value_survives_enter_without_apply(self):
        t = self.terminal()
        t.choose("Quote editor", "position:0")
        t.choose("Position 1", "unitPrice")
        t.text("Unit price", None)
        t.choose("Position 1", "done")
        exported = self.export_and_close(t)
        self.assertEqual(exported["positions"][0]["unitPrice"], "100.00")
        prompts = [e for e in t.events() if e["event"] == "prompt"]
        self.assertFalse(any(any(o.get("value") in ("apply", "edit") for o in p.get("options", [])) for p in prompts if isinstance(p.get("options"), list)))

    def test_missing_values_are_marked_on_rows_and_focused_on_save(self):
        quote = json.loads((ROOT / "examples/quote.example.json").read_text())
        quote["document"] = {}
        quote["tax"] = {}
        quote["positions"] = []
        t = self.terminal(quote=quote)
        t.choose("Quote editor", "save")
        event = t.prompt("Quote editor")
        self.assertEqual(event["initial"], "document:date")
        self.assertTrue(any(o["value"] == "document:contactPersonId" and "! Contact" in ANSI.sub("", o["label"]) for o in event["options"]))
        self.assertIn("Our contact person (Unser Ansprechpartner):", t.transcript())
        self.assertNotRegex(t.transcript(), r"document\.|tax\.|contactPersonId|ruleId")
        t.keys(b"\x03")
        t.finish()
        self.assertFalse(any(e.get("method") == "POST" for e in t.events()))

    def test_new_quote_prefills_number_date_subject_without_writes(self):
        t = self.terminal(loaded=False)
        t.text("Search customer", None)
        t.choose("Customer (Kunde)", "empty")
        exported = self.export_and_close(t)
        self.assertEqual(exported["document"]["number"], "AN-2")
        self.assertEqual(exported["document"]["heading"], "Angebot Nr. AN-2")
        self.assertRegex(exported["document"]["date"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertNotIn("contactPersonId", exported["document"])
        self.assertEqual(exported["tax"], {})
        self.assertFalse(any(e.get("method") == "POST" for e in t.events()))

    def test_missing_imported_number_is_resolved_once_on_save(self):
        quote = json.loads((ROOT / "examples/quote.example.json").read_text())
        del quote["document"]["number"]
        t = self.terminal(quote=quote)
        t.choose("Quote editor", "save")
        t.confirm("Save draft in sevdesk", True)
        t.finish()
        requests = [e for e in t.events() if e["event"] == "request"]
        saves = [e for e in requests if e["path"].endswith("/Factory/saveOrder")]
        self.assertEqual(len(saves), 1)
        self.assertEqual(saves[0]["body"]["order"]["orderNumber"], "AN-2")
        self.assertEqual(saves[0]["body"]["order"]["header"], quote["document"]["heading"])
        self.assertEqual(sum(e["path"].endswith("/getByType") for e in requests), 1)

    def test_number_collision_returns_to_editor_and_refresh_is_explicit(self):
        quote = json.loads((ROOT / "examples/quote.example.json").read_text())
        del quote["document"]["number"]
        t = self.terminal(quote=quote, failure="number-collision")
        t.choose("Quote editor", "save")
        t.choose("Quote editor", "number")
        t.choose("Quote editor", "save")
        t.confirm("Save draft in sevdesk", True)
        t.finish()
        self.assertIn("already exists", t.transcript())
        saves = [e for e in t.events() if e["event"] == "request" and e["path"].endswith("/Factory/saveOrder")]
        self.assertEqual(len(saves), 1)
        self.assertEqual(saves[0]["body"]["order"]["orderNumber"], "AN-3")

    def test_cancel_initial_search_exits_without_more_screens(self):
        t = self.terminal(loaded=False)
        t.cancel("Search customer")
        t.finish()

    def test_cancel_add_position_returns_to_same_add_row(self):
        t = self.terminal()
        t.choose("Quote editor", "add")
        t.cancel("Name or catalogue search")
        event = t.prompt("Quote editor")
        self.assertEqual(event["initial"], "add")
        t.keys(b"\x03")
        t.finish()

    def test_escape_cancels_one_field_without_exiting_editor(self):
        t = self.terminal()
        t.choose("Quote editor", "document:heading")
        t.prompt("Heading")
        t.keys(b"\x15Unaccepted heading\x1b")
        exported = self.export_and_close(t)
        self.assertEqual(exported["document"]["heading"], t.quote["document"]["heading"])

    def test_cancel_later_field_and_position_keeps_accepted_edits(self):
        t = self.terminal()
        t.choose("Quote editor", "position:0")
        t.choose("Position 1", "quantity")
        t.text("Quantity", "4")
        t.choose("Position 1", "unitPrice")
        t.cancel("Unit price")
        t.cancel("Position 1")
        exported = self.export_and_close(t)
        self.assertEqual(exported["positions"][0]["quantity"], "4")
        self.assertEqual(exported["positions"][0]["unitPrice"], "100.00")

    def test_show_inactive_and_refresh_do_not_restart_search(self):
        t = self.terminal()
        t.choose("Quote editor", "customer")
        t.text("Search customer", None)
        active = t.choose("Customer (Kunde)", "inactive")
        self.assertNotIn("9", active)
        inactive = t.choose("Customer (Kunde)", "refresh")
        self.assertIn("9", inactive)
        t.choose("Customer (Kunde)", "back")
        t.choose("Quote editor", "cancel")
        t.finish()

    def test_switch_customer_clears_previous_email_recipients(self):
        quote = json.loads((ROOT / "examples/quote.example.json").read_text())
        quote["delivery"]["cc"] = ["old-copy@example.com"]
        quote["delivery"]["bcc"] = ["old-blind@example.com"]
        t = self.terminal(quote=quote)
        t.choose("Quote editor", "customer")
        t.text("Search customer", "  C-2  ")
        t.choose("Customer (Kunde)", "8")
        t.choose("Recipient address", "108")
        exported = self.export_and_close(t)
        self.assertEqual(exported["customer"], {"id": 8})
        self.assertIn("Beta Example", exported["recipient"]["address"])
        for key in ("to", "cc", "bcc"):
            self.assertNotIn(key, exported["delivery"])

    def test_net_gross_change_requires_explicit_conversion(self):
        t = self.terminal()
        t.choose("Quote editor", "document:priceMode")
        t.choose("Price mode", "gross")
        t.choose("Changing net/gross pricing", "convert")
        exported = self.export_and_close(t)
        self.assertEqual(exported["document"]["priceMode"], "gross")
        self.assertEqual(exported["positions"][0]["unitPrice"], "119.0000")

    def test_invalid_position_name_stays_in_input_until_fixed(self):
        t = self.terminal()
        t.choose("Quote editor", "position:0")
        t.choose("Position 1", "name")
        t.text("Name (Bezeichnung)", "")
        t.text("Name (Bezeichnung)", "Corrected service")
        t.choose("Position 1", "done")
        exported = self.export_and_close(t)
        self.assertEqual(exported["positions"][0]["name"], "Corrected service")

    def test_catalogue_without_price_mode_asks_and_cancel_does_not_change_quote(self):
        quote = json.loads((ROOT / "examples/quote.example.json").read_text())
        del quote["document"]["priceMode"]
        t = self.terminal(quote=quote)
        t.choose("Quote editor", "add")
        t.text("Name or catalogue search", "Example")
        t.choose("Position (Position)", "catalogue")
        t.choose("Choose price mode before copying", "gross")
        t.choose("Product/service (Artikel)", "12")
        t.cancel("Add position")
        exported = self.export_and_close(t)
        self.assertNotIn("priceMode", exported["document"])
        self.assertEqual(len(exported["positions"]), 1)

    def test_save_and_send_are_mocked_and_create_recovery_files(self):
        t = self.terminal()
        t.choose("Quote editor", "send")
        t.choose("Send quote", "done")
        t.confirm("Save and send now", True)
        t.finish()
        requests = [e for e in t.events() if e["event"] == "request"]
        saves = [e for e in requests if e["path"].endswith("/Factory/saveOrder")]
        sends = [e for e in requests if e["path"].endswith("/sendViaEmail")]
        self.assertEqual(len(saves), 1)
        self.assertEqual(len(sends), 1)
        self.assertEqual(sends[0]["body"]["toEmail"], "alpha@example.com")
        recovery = list((t.dir / "state").rglob("*.quote.json"))
        self.assertEqual(len(recovery), 1)
        self.assertEqual(json.loads(recovery[0].read_text())["positions"], t.quote["positions"])
        self.assertEqual(recovery[0].stat().st_mode & 0o777, 0o600)

    def test_send_timeout_does_not_recreate_or_resend(self):
        t = self.terminal(failure="send")
        t.choose("Quote editor", "send")
        t.choose("Send quote", "done")
        t.confirm("Save and send now", True)
        t.finish(expected_code=1)
        requests = [e for e in t.events() if e["event"] == "request"]
        self.assertEqual(sum(e["path"].endswith("/Factory/saveOrder") for e in requests), 1)
        self.assertEqual(sum(e["path"].endswith("/sendViaEmail") for e in requests), 1)
        receipts = [p for p in (t.dir / "state").rglob("*.json") if not p.name.endswith(".quote.json")]
        self.assertEqual(len(receipts), 1)
        receipt = json.loads(receipts[0].read_text())
        self.assertEqual(receipt["state"], "send-unknown")
        self.assertEqual(receipt["orderId"], "42")
        self.assertTrue(Path(receipt["draftFile"]).exists())

    def test_from_empty_customer_selection_to_saved_draft_without_review_menu(self):
        t = self.terminal(loaded=False)
        t.text("Search customer", "Alpha")
        t.choose("Customer (Kunde)", "7")
        t.choose("Recipient address", "107")
        for key, label, value in [("document:number", "Quote number", "AN-TEST"), ("document:date", "Quote date", "2024-03-01"),
                                  ("document:heading", "Heading", "Example new quote"), ("document:currency", "Currency", "EUR"),
                                  ("document:contactPersonId", "Our contact person", "8"), ("tax:ruleId", "Tax rule", "1"),
                                  ("tax:text", "Tax text", "Umsatzsteuer 19%")]:
            t.choose("Quote editor", key)
            t.text(label, value)
        t.choose("Quote editor", "document:priceMode")
        t.choose("Price mode", "net")
        t.choose("Quote editor", "add")
        t.text("Name or catalogue search", "New service")
        t.choose("Position (Position)", "custom")
        for key, label, value in [("quantity", "Quantity", "2"), ("unitId", "Unit ID", "1"),
                                  ("unitPrice", "Unit price", "100"), ("vatRate", "VAT rate", "19")]:
            t.choose("Add position", key)
            t.text(label, value)
        t.choose("Add position", "done")
        t.choose("Quote editor", "save")
        t.confirm("Save draft in sevdesk", True)
        t.finish()
        requests = [e for e in t.events() if e["event"] == "request"]
        saves = [e for e in requests if e["path"].endswith("/Factory/saveOrder")]
        self.assertEqual(len(saves), 1)
        self.assertEqual(saves[0]["body"]["order"]["contact"]["id"], 7)
        self.assertEqual(saves[0]["body"]["order"]["status"], 100)
        self.assertFalse(any(e["path"].endswith("/sendViaEmail") for e in requests))

    def test_selected_row_text_is_brighter_and_section_stems_are_removed(self):
        t = self.terminal()
        t.prompt("Quote editor")

        def dim_before_last_currency():
            raw = t.output.decode(errors="replace")
            index = raw.rfind("Currency (Währung)")
            self.assertGreaterEqual(index, 0)
            dim = False
            for match in re.finditer(r"\x1b\[([\d;]*)m", raw[:index]):
                for code in map(lambda value: int(value or "0"), match[1].split(";")):
                    if code in (0, 22):
                        dim = False
                    elif code == 2:
                        dim = True
            return dim

        self.assertTrue(dim_before_last_currency())
        t.keys(b"\x1b[A")  # Position -> price mode
        t.keys(b"\x1b[A")  # Price mode -> currency
        self.assertFalse(dim_before_last_currency())
        self.assertNotIn("│", t.transcript())
        self.assertNotIn("┃", t.transcript())
        t.keys(b"\x03")
        t.finish()
        self.assertFalse(any(e.get("method") == "POST" for e in t.events()))

    def test_narrow_terminal_keeps_values_attached_to_navigation_rows(self):
        t = self.terminal(rows=24, columns=80)
        t.choose("Quote editor", "document:currency")
        t.text("Currency", "USD")
        event = t.prompt("Quote editor")
        self.assertEqual(event["initial"], "document:currency")
        row = next(o for o in event["options"] if o["value"] == "document:currency")
        self.assertIn("USD", row["label"])
        self.assertLessEqual(len(ANSI.sub("", row["label"])), 74)
        t.keys(b"\x03")
        t.finish()


if __name__ == "__main__":
    unittest.main(verbosity=2)
