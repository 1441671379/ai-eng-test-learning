"""Select a local backend without importing its inference stack in API-only mode."""
import os


def local_llm_enabled() -> bool:
    return os.environ.get("ENGLISH_EXTERNAL_LLM_ONLY") != "1"


class DisabledLocalEngine:
    model_id = "disabled"
    model_loaded = False
    local_enabled = False

    def get_status(self):
        return {"coachReady": False, "coachModel": self.model_id,
                "coachLoadError": "Local LLM is disabled in this runtime.",
                "localLlmEnabled": False}

    def warmup(self, **_kwargs):
        raise RuntimeError("Local LLM is disabled. Configure an external API in model settings.")

    def generate_turn(self, _payload):
        self.warmup()


def create_local_engine():
    if not local_llm_enabled():
        return DisabledLocalEngine()
    from coach_llm import GemmaCoachEngine
    return GemmaCoachEngine()
