"""Keep the offline workflow's contracts aligned with the enforcing CLI."""
import importlib.util
import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "shh_contract_source", ROOT / "skills/strike-her-heart/scripts/task.py")
TASK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TASK)


class StateContractParityTests(unittest.TestCase):
    def test_offline_workflow_uses_the_same_contracts_as_task_validation(self):
        html = (ROOT / "skills/strike-her-heart/assets/workflow.html").read_text()
        match = re.search(r"/\*__SHH_CONTRACTS_START__\*/(.*?)/\*__SHH_CONTRACTS_END__\*/", html, re.S)
        self.assertIsNotNone(match, "Offline workflow needs a canonical contract payload")
        self.assertEqual(json.loads(match.group(1)), TASK.STATE_CONTRACTS)


if __name__ == "__main__":
    unittest.main()
