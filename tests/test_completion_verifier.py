"""Independent checks use fictional snapshots; no real page is claimed as tested."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

BASE = Path(__file__).resolve().parents[1] / 'skills/strike-her-heart/scripts'
def load(name):
    spec=importlib.util.spec_from_file_location(name,BASE/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
claims=load('evidence_contract'); verifier=load('completion_verifier')

class IndependentCompletionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        (self.root/'source.txt').write_text('Fictional PRD statement')
        source={'type':'DOCUMENT_SUPPORTED','locator':'§1','version':'1','quote':'statement','path':'source.txt','sha256':hashlib.sha256((self.root/'source.txt').read_bytes()).hexdigest()}
        identity={key:'a'*64 for key in ('page_id','state_id','element_id','selector_fingerprint','content_hash')};identity.update(mapping_confidence=1,match_status='matched')
        fields={key:'Fictional '+key for key in claims.FIELDS}
        records={key:[{'text':value,'textSha256':claims.sha(value),'type':'DOCUMENT_SUPPORTED','kind':'specification','scope':'specification','derivation':'explicit','controlFingerprint':'a'*64,'sourceRefs':['S1']}] for key,value in fields.items()}
        self.item={'id':'shh-one','displayId':'A-001','fields':fields,'identity':identity,'evidenceMeta':{},'claimRecords':records,'claimSources':{'S1':source},'fieldStates':{},'manualFields':['function']}
        self.page={'id':'P-001','stateKey':'default','url':'https://example.invalid/','status':'verified','bindings':[{'runtimeId':'shh-one','displayId':'A-001'}]}
        self.task={'pages':[self.page]}
        self.before={'pageId':'P-001','stateKey':'default','url':self.page['url'],'sessionId':'before','controls':[copy.deepcopy(self.item)],'persisted':[copy.deepcopy(self.item)],'storageAvailable':True,'dirtyIds':[]}
        self.after=copy.deepcopy(self.before);self.after['sessionId']='after'
        self.bundle={'pages':[{'pageId':'P-001','before':'before.json','after':'after.json'}],'report':{'pages':1,'verifiedPages':1,'controls':1}}
    def run_check(self):
        (self.root/'before.json').write_text(json.dumps(self.before));(self.root/'after.json').write_text(json.dumps(self.after))
        return verifier.verify(self.root,self.task,self.bundle,claims)
    def test_valid_records_and_source_are_checked(self):
        self.assertEqual(self.run_check(),[])
    def test_failure_to_save_blocks_even_if_report_claims_success(self):
        self.after['storageAvailable']=False
        self.assertTrue(any('save' in problem for problem in self.run_check()))
    def test_changed_manual_text_and_report_mismatch_block(self):
        self.after['persisted'][0]['fields']['function']='Lost manual edit'
        self.bundle['report']['controls']=999
        issues=self.run_check();self.assertTrue(any('preserve' in item for item in issues));self.assertTrue(any('报告数量' in item for item in issues))
    def test_permission_claim_cannot_be_proved_by_button_dom(self):
        c=self.after['controls'][0]['claimRecords']['limits'][0];c.update(type='DOM_OBSERVED',kind='permission',scope='observed')
        self.after['persisted']=copy.deepcopy(self.after['controls'])
        self.before['controls']=copy.deepcopy(self.after['controls']);self.before['persisted']=copy.deepcopy(self.before['controls'])
        self.assertTrue(any('unsupported' in item for item in self.run_check()))
    def test_changed_source_and_conflict_block(self):
        (self.root/'source.txt').write_text('Changed')
        self.after['controls'][0]['fieldStates']['function']='conflict';self.after['persisted']=copy.deepcopy(self.after['controls'])
        issues=self.run_check();self.assertTrue(any('source artifact' in item for item in issues));self.assertTrue(any('conflict' in item for item in issues))
    def test_malformed_bundle_and_document_quote_fail_closed(self):
        self.assertTrue(verifier.verify(self.root,self.task,{'pages':None},claims))
        self.after['controls'][0]['claimSources']['S1']['quote']=42
        self.after['persisted']=copy.deepcopy(self.after['controls'])
        self.before['controls']=copy.deepcopy(self.after['controls']);self.before['persisted']=copy.deepcopy(self.before['controls'])
        self.assertTrue(any('document' in item or 'source artifact' in item for item in self.run_check()))
    def test_a_wrong_display_number_does_not_pass_on_runtime_id_alone(self):
        self.after['controls'][0]['displayId']='A-999'
        self.after['persisted']=copy.deepcopy(self.after['controls'])
        self.assertTrue(any('display number' in item for item in self.run_check()))
    def test_task_records_are_not_accepted_as_source_evidence(self):
        (self.root/'task.json').write_text('Fictional PRD statement')
        for side in (self.before,self.after):
            source=side['controls'][0]['claimSources']['S1'];source['path']='task.json'
            side['persisted']=copy.deepcopy(side['controls'])
        self.assertTrue(any('source artifact' in item for item in self.run_check()))

if __name__=='__main__':unittest.main()
