import json
import time
from pprint import pprint

from services.api_client import (
    get_pending_brand_requests,
    claim_brand_request,
    update_brand_request,
)

from services.security_scan import scan_logo_urls

from services.openai_validator import (
    run_trained_ai_validation,
    run_non_trained_ai_validation,
    final_decision,
)


def build_notes(security_result, trained_result, non_trained_text, decision):
    return json.dumps({
        "security": {
            "passed": security_result.get("passed"),
            "light": security_result.get("light"),
            "dark": security_result.get("dark"),
        },
        "trained_ai": trained_result,
        "non_trained_ai": non_trained_text,
        "final_decision": decision,
    }, indent=2)


def map_decision_to_status(decision):
    if decision == "VERIFIED":
        return {
            "identity_status": "verified",
            "final_status": "verified",
        }

    if decision == "REJECTED":
        return {
            "identity_status": "rejected",
            "final_status": "rejected",
        }

    return {
        "identity_status": "under_review",
        "final_status": "review",
    }


def run_worker():
    print("BrandBased Processor Started")

    while True:
        try:
            response = get_pending_brand_requests()
            items = response.get("items", [])

            print(f"\nPending Requests: {len(items)}")

            if not items:
                time.sleep(10)
                continue

            item = items[0]
            request_id = item["id"]

            print("\nCLAIMING REQUEST")
            print(request_id)

            claim_brand_request(request_id)

            print("\nRUNNING SVG SECURITY SCAN")

            security_result = scan_logo_urls(
                item["logo_light_url"],
                item["logo_dark_url"]
            )

            if not security_result["passed"]:
                update_brand_request(request_id, {
                    "identity_status": "flagged",
                    "identity_progress": 100,
                    "identity_verification_notes": json.dumps(security_result, indent=2),
                    "final_status": "rejected_security"
                })

                print("\nSECURITY VALIDATION FAILED")
                time.sleep(10)
                continue

            update_brand_request(request_id, {
                "identity_status": "processing",
                "identity_progress": 35,
                "identity_verification_notes": "SVG security validation passed.",
                "final_status": "processing"
            })

            print("\nRUNNING TRAINED AI VALIDATION")

            trained_result = run_trained_ai_validation(
                brand_name=item["brand_name"],
                domain=item["website_url"],
                logo_url=item["logo_light_url"],
            )

            pprint(trained_result)

            update_brand_request(request_id, {
                "identity_status": "processing",
                "identity_progress": 65,
                "identity_verification_notes": json.dumps({
                    "trained_ai": trained_result
                }, indent=2),
                "final_status": "processing"
            })

            print("\nRUNNING NON-TRAINED AI VALIDATION")

            non_trained_text = run_non_trained_ai_validation(
                brand_name=item["brand_name"],
                domain=item["website_url"],
                logo_url=item["logo_light_url"],
            )

            print(non_trained_text)

            decision = final_decision(
                trained_result=trained_result,
                non_trained_text=non_trained_text,
            )

            mapped = map_decision_to_status(decision)

            notes = build_notes(
                security_result=security_result,
                trained_result=trained_result,
                non_trained_text=non_trained_text,
                decision=decision,
            )

            update_brand_request(request_id, {
                "identity_status": mapped["identity_status"],
                "identity_progress": 100,
                "identity_verification_notes": notes,
                "final_status": mapped["final_status"]
            })

            print("\nFINAL DECISION")
            print(decision)

        except Exception as e:
            print("\nWORKER ERROR")
            print(str(e))

        time.sleep(10)


if __name__ == "__main__":
    run_worker()