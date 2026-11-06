import os
import time
from google import genai
from dotenv import load_dotenv

load_dotenv()

# Load all available API keys
API_KEYS = [
    os.environ.get("GEMINI_API_KEY_1"),
    os.environ.get("GEMINI_API_KEY_2"),
    os.environ.get("GEMINI_API_KEY_3"),
    os.environ.get("GEMINI_API_KEY_4"),
    os.environ.get("GEMINI_API_KEY_5"),
    os.environ.get("GEMINI_API_KEY_6"),
    os.environ.get("GEMINI_API_KEY_7"),
    os.environ.get("GEMINI_API_KEY_8"),
]

# Filter out any empty/None keys
API_KEYS = [k for k in API_KEYS if k]

current_key_index = 0


def get_client():
    return genai.Client(api_key=API_KEYS[current_key_index])


def is_quota_error(error_str: str, exc: Exception) -> bool:
    if not error_str:
        return False

    norm = error_str.lower()
    quota_markers = [
        "429",
        "rate_limit",
        "resource_exhausted",
        "quota",
        "quota_exceeded",
        "quota exhausted",
        "exhausted",
        "resource exhausted",
    ]
    if any(marker in norm for marker in quota_markers):
        return True

    if hasattr(exc, "status_code") and exc.status_code == 429:
        return True
    if hasattr(exc, "code") and str(exc.code).lower() in {"429", "resource_exhausted", "quota_exceeded"}:
        return True

    return False


def generate_with_rotation(prompt: str, model: str = "models/gemini-2.5-flash-lite") -> str:
    global current_key_index

    if not API_KEYS:
        raise Exception("No Gemini API keys configured. Set GEMINI_API_KEY_1 through GEMINI_API_KEY_5.")

    for attempt in range(len(API_KEYS)):
        try:
            client = get_client()
            response = client.models.generate_content(
                model=model,
                contents=prompt
            )
            return response.text

        except Exception as e:
            error_str = str(e)

            if is_quota_error(error_str, e):
                print(f"Key {current_key_index + 1} quota exhausted, switching to next key...")
                current_key_index = (current_key_index + 1) % len(API_KEYS)
                time.sleep(2)
                continue
            raise e

    raise Exception("All API keys have exhausted their quota for today.")