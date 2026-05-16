import os
from dotenv import load_dotenv

load_dotenv()


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

LARAVEL_API_BASE = os.getenv(
    "LARAVEL_API_BASE",
    "http://127.0.0.1:8000/api"
)

INTERNAL_API_TOKEN = os.getenv(
    "INTERNAL_API_TOKEN",
    ""
)

PROCESSOR_NAME = os.getenv(
    "PROCESSOR_NAME",
    "brandbased-processor-1"
)