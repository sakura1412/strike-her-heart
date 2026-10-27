"""The candidate packet must contain inputs, never the held-out scoring material."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prepare_eval", ROOT/"scripts/prepare_eval.py")
prepare_eval = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare_eval)


class InputPacketTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.dataset = self.root/"dataset"
        self.dataset.mkdir()
        case = self.dataset/"cases/basic"
        case.mkdir(parents=True)
        (case/"page.html").write_text('<button id="save">Save</button>')
        (case/"prd.md").write_text('# Requirements\nLocal preview only.')
        (case/"expected.json").write_text('{"secret":"GOLD_ANSWER_SENTINEL"}')
        self.manifest = self.dataset/"dataset.json"
        self.data = {"schemaVersion":1,"id":"test-dataset","cases":[{
            "id":"basic","title":"Basic", "page":"cases/basic/page.html",
            "prd":"cases/basic/prd.md","gold":"cases/basic/expected.json"}]}
        self.save()

    def save(self):
        self.manifest.write_text(json.dumps(self.data))

    def tearDown(self):
        self.temporary.cleanup()

    def test_only_allowlisted_inputs_and_protocol_are_copied(self):
        output = self.root/"candidate"
        result = prepare_eval.prepare(self.manifest, output)
        files = {str(p.relative_to(output)) for p in output.rglob('*') if p.is_file()}
        self.assertEqual(files, {'basic/page.html','basic/prd.md','inputs.json','PROMPT.md'})
        self.assertFalse(result['expectedAnswersIncluded'])
        self.assertEqual(set(result['inputHashes']), files)
        for file in files:
            self.assertNotIn('GOLD_ANSWER_SENTINEL',(output/file).read_text())
        self.assertNotIn('gold',(output/'inputs.json').read_text())

    def test_existing_run_is_not_overwritten(self):
        output=self.root/'candidate'
        prepare_eval.prepare(self.manifest, output)
        (output/'predictions.json').write_text('preserve my run')
        with self.assertRaises(ValueError):
            prepare_eval.prepare(self.manifest, output)
        self.assertEqual((output/'predictions.json').read_text(),'preserve my run')

    def test_traversal_or_duplicate_case_is_rejected_before_copy(self):
        self.data['cases'][0]['id']='../outside'
        self.save()
        with self.assertRaises(ValueError):
            prepare_eval.prepare(self.manifest,self.root/'candidate')
        self.assertFalse((self.root/'candidate').exists())
        self.data['cases'][0]['id']='basic'
        self.data['cases'].append(self.data['cases'][0].copy())
        self.save()
        with self.assertRaises(ValueError):
            prepare_eval.prepare(self.manifest,self.root/'candidate')

    def test_source_escape_and_output_symlinks_are_refused(self):
        outside=self.root/'outside.md'
        outside.write_text('not an input')
        self.data['cases'][0]['prd']='../outside.md'
        self.save()
        with self.assertRaises(ValueError):
            prepare_eval.prepare(self.manifest,self.root/'candidate')
        target=self.root/'link'
        target.symlink_to(self.dataset, target_is_directory=True)
        with self.assertRaises(ValueError):
            prepare_eval.prepare(self.manifest,target/'candidate')


if __name__=='__main__':
    unittest.main()
