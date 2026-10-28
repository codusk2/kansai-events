import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('events_build', ROOT / 'build_v2.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildRecovery(unittest.TestCase):
    def test_clean_directory_rebuild(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)
            for name in ['events.json', 'template.html']:
                shutil.copyfile(ROOT / name, target / name)
            shutil.copytree(ROOT / 'assets', target / 'assets')
            self.assertEqual(build.build(target / 'events.json', target / 'template.html', target / 'index.html'), 23)
            self.assertEqual((target / 'index.html').read_bytes(), (ROOT / 'index.html').read_bytes())

    def test_editable_name_and_date_do_not_change_identity(self):
        original = json.loads((ROOT / 'events.json').read_text())[0]
        changed = {**original, '活动名': '修改名称', '日期': '11/30', '开始日期': '2026-11-30', '结束日': '2026-12-01'}
        self.assertEqual(build.normalize(changed, 1, ROOT)['id'], original['id'])
        self.assertEqual(build.normalize(changed, 1, ROOT)['开始日'], '2026-11-30')
        changed.pop('id')
        with self.assertRaises(ValueError):
            build.normalize(changed, 1, ROOT)

    def test_duplicate_identity_rejected(self):
        original = json.loads((ROOT / 'events.json').read_text())[0]
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'events.json'
            # Empty posters keep this case focused on identity, independent of assets.
            source.write_text(json.dumps([{**original, '海报路径': ''}] * 2))
            with self.assertRaisesRegex(ValueError, 'id'):
                build.build(source, ROOT / 'template.html', Path(folder) / 'out.html')


if __name__ == '__main__':
    unittest.main()
