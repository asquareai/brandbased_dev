import json
import time
import traceback
from pprint import pprint

from services.api_client import (
    get_pending_brand_requests,
    claim_brand_request,
    update_brand_request,
)

from services.security_scan import scan_logo_urls

from services.identity_validation import (
    run_identity_validation,
    map_decision_to_status,
)


def build_notes(security_result, validation_result):
    return json.dumps(
        {
            "security": {
                "passed": security_result.get("passed"),
                "light": security_result.get("light"),
                "dark": security_result.get("dark"),
            },
            "trained_ai": validation_result.get("trained_ai"),
            "non_trained_ai": validation_result.get("non_trained_ai"),
            "non_trained_ai_mapped": validation_result.get("non_trained_ai_mapped"),
            "final_decision": validation_result.get("final_decision"),
        },
        indent=2,
    )


def mark_worker_failure(request_id: str, error: Exception) -> None:
    try:
        update_brand_request(
            request_id,
            {
                "identity_status": "under_review",
                "identity_progress": 100,
                "identity_verification_notes": json.dumps(
                    {
                        "worker_error": str(error),
                        "traceback": traceback.format_exc(),
                    },
                    indent=2,
                ),
                "final_status": "review",
            },
        )
    except Exception as update_error:
        print("\nFAILED TO RECORD WORKER ERROR ON REQUEST")
        print(str(update_error))


def run_worker():
    print("BrandBased Processor Started (client Brand Verify AI engine)")

    while True:
        request_id = None

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
                item["logo_dark_url"],
            )

            if not security_result["passed"]:
                update_brand_request(
                    request_id,
                    {
                        "identity_status": "flagged",
                        "identity_progress": 100,
                        "identity_verification_notes": json.dumps(
                            security_result, indent=2
                        ),
                        "final_status": "rejected_security",
                    },
                )

                print("\nSECURITY VALIDATION FAILED")
                time.sleep(10)
                continue

            update_brand_request(
                request_id,
                {
                    "identity_status": "processing",
                    "identity_progress": 25,
                    "identity_verification_notes": "SVG security validation passed.",
                    "final_status": "processing",
                },
            )

            print("\nRUNNING CLIENT IDENTITY ENGINE (trained + non-trained AI)")

            light_svg = security_result.get("light_svg")

            def on_stage(stage_name: str, progress: int):
                notes_by_stage = {
                    "trained_ai": "Running trained AI validation…",
                    "non_trained_ai": "Running non-trained AI validation…",
                    "decision": "Finalizing verification decision…",
                }
                update_brand_request(
                    request_id,
                    {
                        "identity_status": "processing",
                        "identity_progress": progress,
                        "identity_verification_notes": notes_by_stage.get(
                            stage_name,
                            "AI verification in progress…",
                        ),
                        "final_status": "processing",
                    },
                )

            validation_result = run_identity_validation(
                brand_name=item["brand_name"],
                domain=item["website_url"],
                logo_url=item["logo_light_url"],
                logo_svg_text=light_svg,
                on_stage=on_stage,
            )

            pprint(validation_result)

            decision = validation_result["final_decision"]
            mapped = map_decision_to_status(decision)

            notes = build_notes(security_result, validation_result)

            update_brand_request(
                request_id,
                {
                    "identity_status": mapped["identity_status"],
                    "identity_progress": 100,
                    "identity_verification_notes": notes,
                    "final_status": mapped["final_status"],
                },
            )

            print("\nFINAL DECISION")
            print(decision)

        except Exception as e:
            print("\nWORKER ERROR")
            print(str(e))
            traceback.print_exc()
            if request_id:
                mark_worker_failure(request_id, e)

        time.sleep(10)


if __name__ == "__main__":
    run_worker()
