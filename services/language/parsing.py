"""
Output parsing for Qwen coach turns.

Expected formats:
  Target:  CoachMessage: <text>\nLearnerReply: <text>
  Freedom: CoachMessage: <text>

If Qwen drops the label, the raw text is used directly (first-occurrence wins,
multi-turn bleed ignored via early-stop).
"""
from __future__ import annotations

import json
import re
from typing import Any


# ---------------------------------------------------------------------------
# Cleaning
# ---------------------------------------------------------------------------

def clean_model_output(content: str) -> str:
    cleaned = re.sub(r"<think>.*?</think>", " ", str(content), flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"<\|[^|]+?\|>", " ", cleaned)
    cleaned = re.sub(r"</?think>", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\r\n?", "\n", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


def strip_role_prefix(value: str) -> str:
    """
    Remove 'Coach:', 'Learner:', 'CoachMessage:', 'LearnerReply:' prefixes
    that Qwen sometimes embeds inside the field value itself.
    """
    normalized = str(value or "").strip()
    normalized = re.sub(
        r"^(?:coach\s*message|coach|assistant|learner\s*reply|learner|user\s*reply|user|human|suggested\s*reply)\s*[:–-]\s*",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    return normalized.strip()


# ---------------------------------------------------------------------------
# Sanitization
# ---------------------------------------------------------------------------

def sanitize_sentence(value: Any, fallback: str) -> str:
    normalized = re.sub(r"\s+", " ", str(value or "")).strip()
    return normalized or fallback


def sanitize_coach_message(value: Any, fallback: str) -> str:
    normalized = sanitize_sentence(value, fallback)
    normalized = strip_role_prefix(normalized)
    return normalized or fallback


# ---------------------------------------------------------------------------
# Labeled parser — first occurrence wins, stops early
# ---------------------------------------------------------------------------

_LABELS = r"coachmessage|coach\s*message|coach|assistant|learnerreply|learner\s*reply|learner|userreply|user\s*reply|user|humanreply|human\s*reply|human|suggestedreply|suggested\s*reply"
_COACH_KEYS = {"coachmessage", "coach", "assistant"}
_REPLY_KEYS = {"learnerreply", "userreply", "suggestedreply", "learner", "user", "human", "humanreply"}
_LABEL_PATTERN = re.compile(
    r"(?ims)(?<!\S)(?:\*\*)?"
    r"(" + _LABELS + r")"
    r"(?:\*\*)?\s*[:：=-]\s*(?:\*\*)?\s*"
    r"(.+?)"
    r"(?=(?:\s+(?:\*\*)?(?:" + _LABELS + r")(?:\*\*)?\s*[:：=-])|\Z)",
)


def _parse_labeled(content: str) -> dict[str, str]:
    parsed: dict[str, str] = {}

    for match in _LABEL_PATTERN.finditer(content):
        raw_key = re.sub(r"\s+", "", match.group(1).strip().lower())
        value = match.group(2).strip().strip('"')

        if raw_key in _COACH_KEYS and "coachMessage" not in parsed:
            parsed["coachMessage"] = strip_role_prefix(value)
        elif raw_key in _REPLY_KEYS and "learnerReply" not in parsed:
            parsed["learnerReply"] = strip_role_prefix(value)

        if "coachMessage" in parsed and "learnerReply" in parsed:
            break

    return parsed


# ---------------------------------------------------------------------------
# Plain-text fallback
# Qwen sometimes omits the label prefix but the content is correct.
# ---------------------------------------------------------------------------

def _parse_plain_text(content: str, mode: str) -> dict[str, str]:
    # Strip any line that looks like a prompt echo
    lines = [
        line.strip()
        for line in content.split("\n")
        if line.strip() and not re.search(
            r"^\s*(?:topic|conversation so far|the person just said|open the conversation|respond to)",
            line,
            flags=re.IGNORECASE,
        )
    ]

    if not lines:
        return {}

    result: dict[str, str] = {"coachMessage": strip_role_prefix(lines[0])}

    if mode == "target" and len(lines) >= 2:
        result["learnerReply"] = strip_role_prefix(lines[1])

    return result


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def normalize_turn(raw: dict[str, str], mode: str) -> dict[str, str]:
    coach_message = sanitize_coach_message(raw.get("coachMessage"), "")
    if not coach_message:
        raise RuntimeError("Coach output is missing CoachMessage.")

    if mode == "freedom":
        learner_reply = ""
    else:
        learner_reply = sanitize_sentence(raw.get("learnerReply") or "", "")
        if not learner_reply:
            raise RuntimeError("Coach output is missing LearnerReply in target mode.")
        if learner_reply[-1:] not in ".!?":
            learner_reply = f"{learner_reply}."

    return {
        "coachMessage": coach_message,
        "learnerReply": learner_reply,
    }


# ---------------------------------------------------------------------------
# Top-level parser
# ---------------------------------------------------------------------------

import logging as _logging
_parse_logger = _logging.getLogger("english.coach_engine.parsing")

COACH_GENERATION_ATTEMPTS = 3


def repair_turn_messages(messages, decoded, error, mode):
    """Retry with the original context and an explicit, mode-specific contract."""
    required = (
        "Return exactly TWO lines, with BOTH non-empty labels CoachMessage: and LearnerReply:. "
        "LearnerReply must be a short first-person answer to the NEW CoachMessage."
        if mode == "target" else "Return exactly ONE line labeled CoachMessage:."
    )
    return messages + [
        {"role": "assistant", "content": decoded[:6000]},
        {"role": "user", "content":
         f"The previous response failed validation: {error}. Regenerate this turn using the original topic and conversation. "
         + required + " Do not repeat the previous coach question or invent extra conversation turns. No commentary or code fences."},
    ]


def parse_generated_turn(decoded, mode, history, coach_message=""):
    if not coach_message:
        return parse_turn_response(decoded, mode, history)
    cleaned = clean_model_output(decoded)
    cleaned = re.sub(r"^```(?:text|json)?\s*|\s*```$", "", cleaned, flags=re.I).strip()
    if cleaned.startswith("{"):
        try:
            value = json.loads(cleaned)
            reply = next((item for key, item in value.items() if re.sub(r"[\s_]", "", key).lower() in _REPLY_KEYS), "") if isinstance(value, dict) else ""
        except ValueError:
            raise RuntimeError("The learner reply is incomplete; return just one learner sentence.") from None
    else:
        raw = _parse_labeled(cleaned)
        if raw.get("coachMessage") and not raw.get("learnerReply"):
            raise RuntimeError("Write the learner answer, not another coach question.")
        reply = raw.get("learnerReply") or strip_role_prefix(cleaned)
    from validation import looks_like_prompt_echo, normalize_for_match
    if (not isinstance(reply, str) or not re.search(r"[A-Za-z]{2}", reply)
            or len(reply.split()) > 65 or looks_like_prompt_echo(reply)
            or normalize_for_match(reply) == normalize_for_match(coach_message)):
        raise RuntimeError("Return a short English learner answer to the supplied question.")
    return normalize_turn({"coachMessage": coach_message, "learnerReply": reply}, mode)


def recover_turn_generation(messages, decoded, error, mode, history, payload, coach_message=""):
    """Preserve a valid question and fill only its missing target, within the shared attempt budget."""
    if mode == "target":
        if not coach_message:
            try:
                coach_message = parse_turn_response(decoded, "freedom", history)["coachMessage"]
            except RuntimeError:
                pass
        if coach_message:
            from prompts import build_learner_reply_messages
            return coach_message, build_learner_reply_messages(payload, coach_message)
    return "", repair_turn_messages(messages, decoded, error, mode)


def parse_turn_response(
    decoded: str,
    mode: str,
    history: list[dict[str, Any]],
) -> dict[str, str]:
    from validation import should_reject_coach_message

    cleaned = clean_model_output(decoded)
    _parse_logger.debug("parse_turn_response cleaned:\n%s", cleaned)

    raw = {}
    unfenced = re.sub(r"^```(?:json|text)?\s*|\s*```$", "", cleaned, flags=re.I).strip()
    if unfenced.startswith("{"):
        try:
            value = json.loads(unfenced)
            if isinstance(value, dict):
                for key, item in value.items():
                    normalized_key = re.sub(r"[\s_]", "", key).lower()
                    if normalized_key in _COACH_KEYS | _REPLY_KEYS and isinstance(item, str):
                        raw["coachMessage" if normalized_key in _COACH_KEYS else "learnerReply"] = item
        except (ValueError, TypeError):
            raise RuntimeError("Coach output contains incomplete JSON; regenerate the required labeled lines.") from None
    else:
        raw = _parse_labeled(unfenced)

    if raw.get("learnerReply") and not raw.get("coachMessage"):
        raise RuntimeError("Coach output is missing CoachMessage.")

    if not raw.get("coachMessage"):
        _parse_logger.warning(
            "No labeled CoachMessage (mode=%s), trying plain-text recovery. Output: %s",
            mode,
            cleaned[:200],
        )
        raw = _parse_plain_text(unfenced, mode)

    if not raw.get("coachMessage"):
        raise RuntimeError(
            f"Coach output could not be parsed. Raw: {cleaned[:300]}"
        )

    turn = normalize_turn(raw, mode)

    if should_reject_coach_message(turn["coachMessage"], history):
        raise RuntimeError(
            f"Coach output rejected — echoed or repeated. "
            f"coachMessage: {turn['coachMessage'][:120]}"
        )

    _parse_logger.info("Turn parsed mode=%s coach=%s", mode, turn["coachMessage"][:80])
    return turn
