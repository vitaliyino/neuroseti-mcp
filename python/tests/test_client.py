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
            seen.append((req.full_url, req.headers.get("Authorization")))
            payload = {"ok": True, "data": {"url": req.full_url}}
            return FakeResponse(json.dumps(payload).encode("utf-8"))

        client = NeurosetiDataClient(api_key="nsr_" + "A" * 40, opener=fake_opener)
        out = client.check_markirovka(q="футболка")
        self.assertTrue(out["ok"])
        self.assertIn("/ecom/markirovka/check", seen[0][0])
        self.assertEqual(seen[0][1], "Bearer nsr_" + "A" * 40)

        self.assertGreaterEqual(len(OPENAI_TOOL_SCHEMAS), 6)
        dispatched = json.loads(dispatch_openai_tool_call(client, "construction_contractor_check", '{"inn":"5047176993"}'))
        self.assertTrue(dispatched["ok"])
        self.assertIn("/construction/contractor/5047176993", seen[1][0])

    def test_requires_api_key(self):
        with self.assertRaises(ValueError):
            NeurosetiDataClient(api_key="")


if __name__ == "__main__":
    unittest.main()
