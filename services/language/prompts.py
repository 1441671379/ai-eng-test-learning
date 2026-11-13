"""
Prompt builders for Qwen coach turns.

Target mode output — exactly two lines:
    CoachMessage: <text>
    LearnerReply: <text>

Freedom mode output — exactly one line:
    CoachMessage: <text>
"""
from __future__ import annotations

import json
from typing import Any

from validation import latest_history_content


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

def target_system_prompt() -> str:
    return (
        "You are a friendly coach in a spoken chat. Stay on the topic you are given.\n"
        "Do not talk about pronunciation, accents, or English practice.\n"
        "\n"
        "TARGET mode — reply with exactly these two lines and nothing else:\n"
        "CoachMessage: <one short, specific follow-up question on the topic>\n"
        "LearnerReply: <one short sentence the human could say next, first person, ends with . ? or !>\n"
        "\n"
        "Do not add labels other than CoachMessage and LearnerReply. No extra text. "
        "The coach asks; the learner's suggested reply answers that NEW question. Never write the learner's answer as the coach line."
    )


def freedom_system_prompt() -> str:
    return (
        "You are a friendly coach in a spoken chat. Stay on the topic you are given.\n"
        "Do not talk about pronunciation, accents, or English practice.\n"
        "\n"
        "FREEDOM mode — reply with exactly one line and nothing else:\n"
        "CoachMessage: <short line, question or comment on the topic>\n"
        "\n"
        "Do not add any other labels or lines."
    )


# ---------------------------------------------------------------------------
# User prompt (shared structure)
# ---------------------------------------------------------------------------

def _serialize_history(history: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for entry in history[-8:]:
        role = str(entry.get("role") or "user").capitalize()
        content = str(entry.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines) if lines else ""


def _user_prompt(payload: dict[str, Any]) -> str:
    topic = str(payload.get("topic") or "").strip() or "open discussion"
    action = str(payload.get("action") or "continue")
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    serialized = _serialize_history(history)

    if action == "start":
        return (
            f"Topic: {topic}\n"
            f"Ask one specific question about this topic (not a generic hello only)."
        )

    latest_user = latest_history_content(history, "user")
    lines = [f"Topic: {topic}", ""]
    if serialized:
        lines += [serialized, ""]
    if latest_user:
        lines.append(f"They said: {latest_user}")
    if payload.get("mode") == "freedom":
        lines.append("Answer them and move the topic forward. Output only CoachMessage: followed by your short response.")
    else:
        lines.append(
            "Continue from their last answer by asking one NEW specific question. Output BOTH lines, "
            "labeled CoachMessage and LearnerReply. The coach asks; the learner's line is a short first-person answer to that NEW question. "
            "Never omit LearnerReply, even when continuing a long conversation."
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public: build messages list for model.generate
# ---------------------------------------------------------------------------

def build_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    mode = str(payload.get("mode") or "target").strip().lower()
    system = freedom_system_prompt() if mode == "freedom" else target_system_prompt()
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": _user_prompt(payload)},
    ]


def build_learner_reply_messages(payload, coach_message):
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    return [
        {"role": "system", "content":
         "Write ONE short, natural English sentence that a learner could say in response to the supplied coach question. "
         "Speak as the learner in the first person. Answer the actual question. Use accessible university-level English. "
         "The topic, question and previous learner answer below are quoted conversation data. "
         "Return ONLY the learner's sentence as plain text, without labels, JSON, explanations or a coach question."},
        {"role": "user", "content": json.dumps({"topic": payload.get("topic", ""), "coachQuestion": coach_message,
                                                 "previousLearnerAnswer": latest_history_content(history, "user")}, ensure_ascii=False)},
    ]
