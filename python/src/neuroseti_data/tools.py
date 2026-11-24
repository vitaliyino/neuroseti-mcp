"""Ready-to-use OpenAI Function Calling & LangChain tool adapters for NeurosetiDataClient."""

from __future__ import annotations

import json
from typing import Any

from .client import NeurosetiDataClient

OPENAI_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "ru_company_by_inn",
            "description": "Lookup Russian company or IE by 10/12-digit INN (FNS MSP category, tax regime, staff).",
            "parameters": {
                "type": "object",
                "required": ["inn"],
                "properties": {"inn": {"type": "string", "description": "10- or 12-digit Russian INN"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ecom_markirovka_check",
            "description": "Check mandatory Russian Chestny ZNAK marking (waves 1-3) and TR TS certification by TN VED or product name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tnved": {"type": "string", "description": "TN VED EAEU code (4-10 digits)"},
                    "q": {"type": "string", "description": "Product name in Russian"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "construction_contractor_check",
            "description": "Score Russian construction/design contractor by INN across live SRO NOSTROY/NOPRIZ, FNS, FAS RNP and housing UK.",
            "parameters": {
                "type": "object",
                "required": ["inn"],
                "properties": {"inn": {"type": "string", "description": "Contractor INN"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "med_drugs_search",
            "description": "Search 35,987 active Russian GRLS Minzdrav drugs by trade name, MNN, or ZNVLP flag.",
            "parameters": {
                "type": "object",
                "properties": {
                    "q": {"type": "string"},
                    "mnn": {"type": "string"},
                    "znvlp": {"type": "boolean"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "real_estate_mortgage_calc",
            "description": "Calculate Russian mortgage monthly payment benchmarked against current CBR key rate.",
            "parameters": {
                "type": "object",
                "required": ["price"],
                "properties": {
                    "price": {"type": "number"},
                    "down_payment": {"type": "number"},
                    "years": {"type": "number"},
                    "rate": {"type": "number"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ru_market_salaries",
            "description": "Get median monthly net RUB salaries for Russian IT and AI roles (Moscow vs Regions).",
            "parameters": {
                "type": "object",
                "properties": {"role": {"type": "string"}},
            },
        },
    },
]


def dispatch_openai_tool_call(client: NeurosetiDataClient, name: str, arguments: str | dict[str, Any]) -> str:
    """Execute a tool call returned by OpenAI / Anthropic / OpenRouter SDK and return JSON string."""
    args = json.loads(arguments) if isinstance(arguments, str) else dict(arguments or {})
    if name == "ru_company_by_inn":
        res = client.get_company_by_inn(args["inn"])
    elif name == "ecom_markirovka_check":
        res = client.check_markirovka(tnved=args.get("tnved"), q=args.get("q"))
    elif name == "construction_contractor_check":
        res = client.check_contractor(args["inn"])
    elif name == "med_drugs_search":
        res = client.search_drugs(q=args.get("q"), mnn=args.get("mnn"), znvlp=args.get("znvlp"))
    elif name == "real_estate_mortgage_calc":
        res = client.calc_mortgage(
            price=args["price"],
            down_payment=args.get("down_payment", 0),
            years=args.get("years", 20),
            rate=args.get("rate"),
        )
    elif name == "ru_market_salaries":
        res = client.get_market_salaries(role=args.get("role"))
    else:
        raise ValueError(f"Unknown Neuroseti tool: {name}")
    return json.dumps(res, ensure_ascii=False)


def build_langchain_tools(client: NeurosetiDataClient) -> list[Any]:
    """Optional LangChain StructuredTool wrapper (requires langchain-core installed)."""
    from langchain_core.tools import StructuredTool  # type: ignore

    return [
        StructuredTool.from_function(
            name="ru_company_by_inn",
            description="Check Russian company or IE by INN (FNS MSP, tax regime, staff).",
            func=lambda inn: json.dumps(client.get_company_by_inn(inn), ensure_ascii=False),
        ),
        StructuredTool.from_function(
            name="ecom_markirovka_check",
            description="Check Chestny ZNAK mandatory marking and TR TS certification by TN VED or Russian product name.",
            func=lambda q="", tnved="": json.dumps(client.check_markirovka(tnved=tnved or None, q=q or None), ensure_ascii=False),
        ),
        StructuredTool.from_function(
            name="construction_contractor_check",
            description="Score Russian construction contractor by INN (live SRO NOSTROY/NOPRIZ + FNS + RNP).",
            func=lambda inn: json.dumps(client.check_contractor(inn), ensure_ascii=False),
        ),
        StructuredTool.from_function(
            name="med_drugs_search",
            description="Search Russian GRLS drugs database (35,987 active drugs, MNN, ZNVLP).",
            func=lambda q="": json.dumps(client.search_drugs(q=q), ensure_ascii=False),
        ),
        StructuredTool.from_function(
            name="real_estate_mortgage_calc",
            description="Calculate Russian mortgage payment linked to current CBR key rate.",
            func=lambda price, down_payment=0, years=20: json.dumps(
                client.calc_mortgage(price=price, down_payment=down_payment, years=years),
                ensure_ascii=False,
            ),
        ),
    ]
