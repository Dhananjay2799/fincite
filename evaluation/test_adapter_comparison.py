import importlib.util
import unittest
from copy import deepcopy
from pathlib import Path

spec = importlib.util.spec_from_file_location("compare_adapter", Path(__file__).with_name("compare-adapter.py"))
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)


class EvidenceBindingTests(unittest.TestCase):
    def setUp(self):
        self.unit = {"source_id": "cfpb-47", "start_char": 0, "end_char": 25,
                     "text": "Keep the full condition."}
        self.unit["end_char"] = len(self.unit["text"])
        self.generated = {"status": "development_generation_complete_ungraded", "results": [
            {"question_id": "dev-001", "question": "What does the passage say?", "generation_performed": True,
             "packed_units": [self.unit], "request_error": None}]}
        self.original = {"results": [{"question_id": "dev-001", "question": "What does the passage say?",
                                     "api_response": {"sources": [{"id": "cfpb-47", "quote": self.unit["text"]}]}}]}
        self.rankings = {"status": "offline_development_ranking_complete_ungraded", "results": [
            {"question_id": "dev-001", "question": "What does the passage say?", "ranked_units": [self.unit]}]}

    def test_source_and_question_changes_fail_before_model_loading(self):
        for change in ["text", "source_id", "start_char"]:
            generated = deepcopy(self.generated)
            generated["results"][0]["packed_units"][0][change] = {"text": "Invented", "source_id": "cfpb-999", "start_char": 1}[change]
            with self.assertRaises(AssertionError):
                comparison.cases_from_records(generated, self.original, self.rankings)
        generated = deepcopy(self.generated)
        generated["results"][0]["question"] = "Changed question"
        with self.assertRaises(AssertionError):
            comparison.cases_from_records(generated, self.original, self.rankings)

    def test_prior_gate_does_not_answer_for_the_model(self):
        self.generated["results"][0].update(generation_performed=False, packed_units=[])
        cases = comparison.cases_from_records(self.generated, self.original, self.rankings)
        self.assertEqual(cases[0]["evidence"], [self.unit])
        self.assertEqual(cases[0]["evidence_origin"], "top_three_saved_ranked_units_no_gate")

    def test_both_models_receive_identical_evidence_and_no_reference_answers(self):
        cases = comparison.cases_from_records(self.generated, self.original, self.rankings)
        self.generated["results"][0]["reference_claims"] = ["A hidden reference answer"]
        messages = comparison.messages_for(cases[0], "Follow evidence")
        self.assertIn("[cfpb-47]\nKeep the full condition.", messages[1]["content"])
        self.assertNotIn("hidden reference", str(messages))

    def test_missing_or_duplicate_records_and_empty_evidence_are_rejected(self):
        generated = deepcopy(self.generated)
        generated["results"] *= 2
        with self.assertRaises(AssertionError):
            comparison.cases_from_records(generated, self.original, self.rankings)
        self.generated["results"][0]["packed_units"] = []
        with self.assertRaises(AssertionError):
            comparison.cases_from_records(self.generated, self.original, self.rankings)


if __name__ == "__main__":
    unittest.main()
