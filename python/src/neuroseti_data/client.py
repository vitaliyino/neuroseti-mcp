"""Zero-dependency Python client for Neuroseti.ru Open Data API (RF)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable


class NeurosetiDataError(RuntimeError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"Neuroseti API HTTP {status} ({code}): {message}")
        self.status = status
        self.code = code
        self.message = message


class NeurosetiDataClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = "https://api.neuroseti.ru/v1/data",
        timeout: int = 20,
        opener: Callable[..., Any] | None = None,
    ):
        self.api_key = (api_key or os.environ.get("NEUROSETI_API_KEY", "")).strip()
        if not self.api_key:
            raise ValueError("Pass api_key='nsr_...' or set NEUROSETI_API_KEY environment variable.")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._opener = opener or urllib.request.urlopen

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        qs = ""
        if params:
            clean = {
                k: str(v).lower() if isinstance(v, bool) else str(v)
                for k, v in params.items()
                if v is not None and v != ""
            }
            if clean:
                qs = "?" + urllib.parse.urlencode(clean)
        url = f"{self.base_url}{path}{qs}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "neuroseti-data-python/0.5.0",
                "Accept": "application/json",
            },
        )
        try:
            with self._opener(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                err = json.loads(body).get("error", {})
                raise NeurosetiDataError(exc.code, err.get("code", "http_error"), err.get("message", body)) from exc
            except json.JSONDecodeError:
                raise NeurosetiDataError(exc.code, "http_error", body[:240]) from exc

    def list_models(self, category: str | None = None, q: str | None = None) -> dict[str, Any]:
        return self._get("/models", {"category": category, "q": q})

    def search_tg_posts(self, q: str, days: int = 30, exclude_ads: bool = True, limit: int = 20) -> dict[str, Any]:
        return self._get("/tg/search", {"q": q, "days": days, "exclude_ads": exclude_ads, "limit": limit})

    def get_company_by_inn(self, inn: str) -> dict[str, Any]:
        return self._get(f"/ru/company/{urllib.parse.quote(inn.strip())}")

    def get_cbr_rates(self, date: str | None = None) -> dict[str, Any]:
        return self._get("/ru/cbr/rates", {"date": date})

    def calc_penalty(self, amount: float, date_from: str, date_to: str, mode: str = "art395") -> dict[str, Any]:
        return self._get("/ru/finance/penalty", {"amount": amount, "from": date_from, "to": date_to, "mode": mode})

    def lookup_bic(self, bic: str) -> dict[str, Any]:
        return self._get(f"/ru/cbr/bic/{urllib.parse.quote(bic.strip())}")

    def add_workdays(self, date: str, days: int) -> dict[str, Any]:
        return self._get("/ru/calendar/add-workdays", {"date": date, "days": days})

    def search_okved(self, q: str) -> dict[str, Any]:
        return self._get("/ru/okved/search", {"q": q})

    def search_drugs(self, q: str | None = None, mnn: str | None = None, znvlp: bool | None = None) -> dict[str, Any]:
        return self._get("/med/drugs/search", {"q": q, "mnn": mnn, "znvlp": znvlp})

    def search_icd10(self, q: str) -> dict[str, Any]:
        return self._get("/med/icd10/search", {"q": q})

    def search_med_licenses(self, inn: str | None = None, q: str | None = None, region: str | None = None) -> dict[str, Any]:
        return self._get("/med/licenses", {"inn": inn, "q": q, "region": region})

    def search_trademarks(self, q: str | None = None, inn: str | None = None) -> dict[str, Any]:
        return self._get("/ip/trademarks/search", {"q": q, "inn": inn})

    def check_markirovka(self, tnved: str | None = None, q: str | None = None) -> dict[str, Any]:
        return self._get("/ecom/markirovka/check", {"tnved": tnved, "q": q})

    def search_tnved(self, q: str) -> dict[str, Any]:
        return self._get("/ecom/tnved/search", {"q": q})

    def check_contractor(self, inn: str) -> dict[str, Any]:
        return self._get(f"/construction/contractor/{urllib.parse.quote(inn.strip())}")

    def calc_mortgage(self, price: float, down_payment: float = 0, years: int = 20, rate: float | None = None) -> dict[str, Any]:
        return self._get("/real-estate/mortgage-calc", {"price": price, "down_payment": down_payment, "years": years, "rate": rate})

    def get_market_salaries(self, role: str | None = None) -> dict[str, Any]:
        return self._get("/market/salaries", {"role": role})

    def get_freelance_vs_api(self, task: str | None = None) -> dict[str, Any]:
        return self._get("/market/freelance-vs-api", {"task": task})

    def check_counterparty_360(self, inn: str) -> dict[str, Any]:
        return self._get(f"/ru/counterparty/{urllib.parse.quote(inn.strip())}")

    def get_data_quota(self) -> dict[str, Any]:
        return self._get("/quota")
