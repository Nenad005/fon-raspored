import importlib.util
import re
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("downloader", Path(__file__).resolve().parents[1] / "scripts/download-schedule.py")
downloader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloader)


class DownloadScheduleTest(unittest.TestCase):
    def test_current_and_legacy_links_exclude_english_and_require_all_years(self):
        links = []
        for year, word in enumerate(downloader.YEAR_WORDS, 1):
            links.extend([
                f'<a href="https://example.com/{year}godina.docx">schedule</a>',
                f'<a href="https://example.com/{year}godinaENG.docx">English</a>',
                f'<a href="https://example.com/Grupe-za-nastavu-{word}-godina.docx">groups</a>',
            ])
        found = downloader.discover("".join(links))
        self.assertEqual(len(found), 4)
        self.assertTrue(all("ENG" not in item[1] for item in found))
        legacy = re.sub(r"/(\d)godina\.docx", r"/\1zimski2026.docx", "".join(links))
        self.assertEqual(len(downloader.discover(legacy)), 4)
        with self.assertRaises(ValueError):
            downloader.discover("".join(links[:-3]))

    def test_room_order_only_preserves_identity_but_different_rooms_do_not(self):
        previous = {"year2": {"Example": {"V": [{"dan": "Ponedeljak", "od": "08:00", "do": "09:00", "sala": "09/08"}]}}}
        events = [{"predmet": "Example", "tip": "V", "dan": "Ponedeljak", "od": "08:00", "do": "09:00", "sala": "08/09"}]
        self.assertEqual(downloader.preserve_room_order(events, previous), 1)
        self.assertEqual(events[0]["sala"], "09/08")
        events[0]["sala"] = "08/10"
        self.assertEqual(downloader.preserve_room_order(events, previous), 0)

    def test_allocation_transliteration_is_compatible_with_existing_boundaries(self):
        self.assertEqual(downloader.boundary("Ljubić", "А"), "Љубић")
        self.assertEqual(downloader.boundary("ABVGDĐEŽZIJKLMNOPRSŠTĆUFHCČ", "А"), downloader.CYRILLIC)
        self.assertEqual(downloader.boundary("svi", "А"), "А")

    def test_unknown_lesson_format_and_weekend_lessons_fail_instead_of_silent_loss(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "schedule.docx"
            for day, time in [("Ponedeljak", "08:00-09:00"), ("Ponedeljak", "invalid"), ("Subota", "08:00-09:00")]:
                xml = f'<w:document xmlns:w="{downloader.NS[1:-1]}"><w:body><w:p><w:r><w:t>{day}</w:t></w:r></w:p><w:p><w:r><w:t>Example</w:t><w:tab/><w:t>V</w:t><w:tab/><w:t>A1</w:t><w:tab/><w:t>{time}</w:t><w:tab/><w:t>101</w:t></w:r></w:p></w:body></w:document>'
                with zipfile.ZipFile(path, "w") as archive:
                    archive.writestr("word/document.xml", xml)
                if day == "Ponedeljak" and time != "invalid":
                    self.assertEqual(len(downloader.parse_schedule(path, 1)), 1)
                else:
                    with self.assertRaises(ValueError):
                        downloader.parse_schedule(path, 1)


if __name__ == "__main__":
    unittest.main()
