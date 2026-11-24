import io
import json
import unittest
from contextlib import contextmanager

from neuroseti_data import NeurosetiDataClient, OPENAI_TOOL_SCHEMAS, dispatch_openai_tool_call


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class TestNeurosetiDataSdk(unittest.TestCase):
    def test_client_and_openai_tool_dispatch(self):
        seen = []

        def fake_opener(req, timeout=20):
            seen.append((req.full_url, req.get_method(), req.headers.get("Authorization"), req.data))
            payload = {"ok": True, "data": {"url": req.full_url}}
            return FakeResponse(json.dumps(payload).encode("utf-8"))

        client = NeurosetiDataClient(api_key="nsr_" + "A" * 40, opener=fake_opener)
        out = client.check_markirovka(q="футболка")
        self.assertTrue(out["ok"])
        self.assertIn("/ecom/markirovka/check", seen[0][0])
        self.assertEqual(seen[0][2], "Bearer nsr_" + "A" * 40)

        self.assertGreaterEqual(len(OPENAI_TOOL_SCHEMAS), 6)
        dispatched = json.loads(dispatch_openai_tool_call(client, "construction_contractor_check", '{"inn":"5047176993"}'))
        self.assertTrue(dispatched["ok"])
        self.assertIn("/construction/contractor/5047176993", seen[1][0])

        batch = client.check_counterparty_batch(["7705552444", "5047176993"], live_sro=True)
        self.assertTrue(batch["ok"])
        self.assertEqual(seen[2][1], "POST")
        self.assertTrue(seen[2][0].endswith("/ru/counterparty/batch"))
        self.assertEqual(json.loads(seen[2][3].decode("utf-8")), {"inns": ["7705552444", "5047176993"], "live_sro": True})

        quota = client.get_data_quota()
        self.assertTrue(quota["ok"])
        self.assertTrue(seen[3][0].endswith("/quota"))

    def test_requires_api_key(self):
        with self.assertRaises(ValueError):
            NeurosetiDataClient(api_key="")


if __name__ == "__main__":
    unittest.main()
