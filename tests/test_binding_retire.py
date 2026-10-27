"""Retire a disappeared control only with an actual recorded observation."""
import unittest
import test_task as fixture

class BindingRetirementTests(unittest.TestCase):
    setUp=fixture.TaskManifestTests.setUp
    manifest=fixture.TaskManifestTests.manifest
    run_cli=fixture.TaskManifestTests.run_cli
    initialize=fixture.TaskManifestTests.initialize
    add_page=fixture.TaskManifestTests.add_page
    capability=fixture.TaskManifestTests.capability
    bind=fixture.TaskManifestTests.bind
    present=fixture.TaskManifestTests.present
    check=fixture.TaskManifestTests.check
    verify=fixture.TaskManifestTests.verify
    verified_page=fixture.TaskManifestTests.verified_page
    def test_retire_invalidates_page_and_requires_proof_for_reuse(self):
        page=self.verified_page();before=(self.directory/'task.json').read_bytes()
        self.run_cli('unbind','--page-id',page,'--display-id','A-001','--reason','Removed from actual page',ok=False)
        self.assertEqual(before,(self.directory/'task.json').read_bytes())
        result=self.run_cli('unbind','--page-id',page,'--display-id','A-001','--reason','Removed from fixture','--actual','--note','Synthetic observed removal','--evidence','evidence/runtime.txt')
        self.assertEqual(result['pages'][0]['status'],'discovered')
        self.assertEqual(len(result['pages'][0]['retiredBindings']),1)
        self.assertEqual(result['pages'][0]['bindings'],[])
        self.run_cli('bind','--page-id',page,'--display-id','A-001','--runtime-id','shh-fixture','--actual','--note','Synthetic observed mapping','--evidence','evidence/runtime.txt',ok=False)
        self.bind(page,'shh-fixture','A-001','--replace')
        self.assertEqual(self.manifest()['pages'][0]['bindings'][0]['displayId'],'A-001')
if __name__=='__main__':unittest.main()
