"""
Backward-compatible re-exports — client logic lives in identity_engine + identity_validation.
"""

from services.identity_engine import final_decision, map_non_trained
from services.identity_validation import (
    run_non_trained_ai_validation,
    run_trained_ai_validation,
)

__all__ = [
    "run_trained_ai_validation",
    "run_non_trained_ai_validation",
    "final_decision",
    "map_non_trained",
]
