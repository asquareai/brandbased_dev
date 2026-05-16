from dataclasses import dataclass, asdict
from typing import Any, Dict


@dataclass
class VerificationResult:
    status: str
    score: int
    summary: str
    details: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)