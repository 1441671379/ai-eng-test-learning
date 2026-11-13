"""Application-owned, non-streaming Chat Completions transport.

No imports from a TTS engine or external capability checkout. Credentials and
provider response bodies are never included in errors or logs.
"""
from __future__ import annotations
import asyncio
import json
import logging
import math
from urllib.parse import urlsplit
import httpx

MAX_BYTES = 8 * 1024 * 1024


class ExternalModelError(Exception):
    def __init__(self, code: str, message: str, http_status: int | None = None):
        self.code, self.http_status = code, http_status
        super().__init__(message)


class IncompleteModelOutput(ValueError):
    """A truncated or empty answer that a task may retry with a larger budget."""
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__('模型输出达到长度限制，未能返回完整内容。请重试。' if reason == 'length'
                         else '模型未返回有效的正文内容。请重试。')


def completion_url(base_url: str) -> str:
    try:
        parts = urlsplit(base_url)
        valid = (parts.scheme == 'https' or (parts.scheme == 'http' and parts.hostname in {'localhost', '127.0.0.1', '::1'}))
        valid = valid and bool(parts.hostname) and not (parts.username or parts.password or parts.query or parts.fragment)
        valid = valid and not any(char.isspace() for char in base_url)
        parts.port
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise ExternalModelError('invalid_config', 'Configure a valid HTTPS Base URL or a loopback HTTP endpoint.')
    base_url = base_url.rstrip('/')
    return base_url if base_url.endswith('/chat/completions') else base_url + '/chat/completions'


def status_error(status: int) -> ExternalModelError:
    if status in (401, 403):
        code, message = 'unauthorized', 'API key was rejected. Check your credentials.'
    elif status == 402:
        code, message = 'insufficient_quota', 'The model API account has insufficient balance or quota.'
    elif status == 404:
        code, message = 'not_found', 'API endpoint or model was not found. Check Base URL and model name.'
    elif status == 429:
        code, message = 'rate_limited', 'API rate limit reached. Please retry later.'
    elif status in (408, 504):
        code, message = 'deadline_exceeded', 'Model request timed out. Please retry.'
    elif 300 <= status < 400:
        code, message = 'invalid_config', 'The model API redirected the request. Configure its final Base URL.'
    else:
        code, message = 'unavailable', 'Model request failed. Check the model settings and API connection.'
    return ExternalModelError(code, message, status)


async def generate_chat_text(*, base_url: str, model: str, api_key: str, messages: list[dict[str, str]],
                             max_tokens: int, temperature: float) -> str:
    endpoint = completion_url(base_url)
    if not isinstance(api_key, str) or not api_key or any(ord(char) < 33 or ord(char) > 126 for char in api_key):
        raise ExternalModelError('invalid_config', 'The saved API key is invalid. Update it in model settings.')
    if not isinstance(model, str) or not model.strip() or len(model) > 200:
        raise ExternalModelError('invalid_config', 'Enter a valid model name in model settings.')
    if type(max_tokens) is not int or max_tokens <= 0 or not isinstance(temperature, (int, float)) or not math.isfinite(temperature) or not 0 <= temperature <= 2:
        raise ValueError('Invalid model generation options.')
    if not isinstance(messages, list) or not messages or any(not isinstance(item, dict) or item.get('role') not in {'system', 'user', 'assistant'} or not isinstance(item.get('content'), str) for item in messages):
        raise ValueError('Invalid model conversation messages.')
    payload = {'model': model, 'messages': [{'role': item['role'], 'content': item['content']} for item in messages],
               'max_tokens': max_tokens, 'temperature': temperature, 'stream': False}
    if urlsplit(endpoint).hostname == 'api.deepseek.com':
        # These tasks request final text, not reasoning continuation. DeepSeek's
        # default thinking mode shares the small task budget with the answer.
        # Scope this extension to the official API; other providers may reject it.
        payload['thinking'] = {'type': 'disabled'}
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    if len(body) > MAX_BYTES:
        raise ValueError('The model request is too large.')
    try:
        async with asyncio.timeout(95):
            async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=10), trust_env=False, follow_redirects=False) as client:
                async with client.stream('POST', endpoint, content=body,
                    headers={'Authorization': 'Bearer ' + api_key, 'Content-Type': 'application/json', 'Accept': 'application/json'}) as response:
                    if not 200 <= response.status_code < 300:
                        raise status_error(response.status_code)
                    chunks, total = [], 0
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > MAX_BYTES:
                            raise ExternalModelError('invalid_output', 'The model response exceeds the supported size limit.')
                        chunks.append(chunk)
        value = json.loads(b''.join(chunks))
    except (TimeoutError, httpx.TimeoutException):
        raise ExternalModelError('deadline_exceeded', 'Model request timed out. Please retry.') from None
    except httpx.HTTPError:
        raise ExternalModelError('unavailable', 'Cannot connect to the model API. Check Base URL and network connection.') from None
    except (ValueError, UnicodeError):
        raise ExternalModelError('invalid_output', 'The model API returned invalid JSON.') from None
    if not isinstance(value, dict) or not isinstance(value.get('choices'), list) or not value['choices']:
        raise ExternalModelError('invalid_output', 'The model API returned no completion choices.')
    choice = value['choices'][0]
    if not isinstance(choice, dict) or not isinstance(choice.get('message'), dict):
        raise ExternalModelError('invalid_output', 'The model API returned an invalid completion message.')
    if choice.get('finish_reason') == 'length':
        logging.getLogger(__name__).warning('Model output truncated max_tokens=%s', max_tokens)
        raise IncompleteModelOutput('length')
    if choice.get('finish_reason') != 'stop' or choice['message'].get('tool_calls') or choice['message'].get('refusal'):
        raise ValueError('模型未能完成正文生成。请检查模型是否支持文本生成。')
    content = choice['message'].get('content')
    if isinstance(content, list):
        content = ''.join(part['text'] for part in content if isinstance(part, dict) and part.get('type') == 'text' and isinstance(part.get('text'), str))
    if not isinstance(content, str) or not content.strip():
        raise IncompleteModelOutput('empty')
    return content
