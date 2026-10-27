"""Validate reference provenance and frozen dataset structure, not model performance."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]/'evals'
FIELDS = ('content','function','limits','navigation')


class DatasetProvenanceTests(unittest.TestCase):
    def test_reference_facts_have_exact_source_quotes_and_unique_ids(self):
        manifest=json.loads((ROOT/'dataset.json').read_text())
        cases=set()
        for entry in manifest['cases']:
            self.assertNotIn(entry['id'],cases)
            cases.add(entry['id'])
            gold=json.loads((ROOT/entry['gold']).read_text())
            self.assertEqual(gold['caseId'],entry['id'])
            sources={kind:(ROOT/entry[kind]).read_text() for kind in ('page','prd')}
            targets=set();facts=set()
            for control in gold['controls']:
                self.assertNotIn(control['target'],targets)
                targets.add(control['target'])
                self.assertEqual(set(control['fields']),set(FIELDS))
                for field in FIELDS:
                    answer=control['fields'][field]
                    self.assertTrue(answer['answer'].strip())
                    self.assertTrue(answer['requiredFacts'])
                    for fact in answer['requiredFacts']:
                        self.assertNotIn(fact['id'],facts)
                        facts.add(fact['id'])
                        self.assertTrue(fact['text'].strip())
                        self.assertTrue(fact['evidence'])
                        for evidence in fact['evidence']:
                            self.assertIn(evidence['source'],sources)
                            self.assertTrue(evidence['locator'].strip())
                            self.assertTrue(evidence['quote'].strip())
                            self.assertIn(evidence['quote'],sources[evidence['source']],f"{entry['id']} {fact['id']}")
            self.assertEqual(len(targets),4)
            self.assertTrue(gold['forbiddenClaims'])


if __name__=='__main__':
    unittest.main()
