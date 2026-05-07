"""
多 Provider 配置管理 — 按模型名路由到对应的 provider (base_url + api_key)
"""
import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent.parent / "config" / "providers.json"

_config: Optional[dict] = None
_model_index: dict[str, str] = {}  # model_name -> provider_name


def _load_config() -> dict:
    global _config, _model_index
    if _config is not None:
        return _config

    if not _CONFIG_PATH.exists():
        logger.warning(f"providers.json not found at {_CONFIG_PATH}, using fallback")
        _config = {"providers": {}, "default_provider": None}
        return _config

    try:
        _config = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to load providers.json: {e}")
        _config = {"providers": {}, "default_provider": None}
        return _config

    for provider_name, provider_cfg in _config.get("providers", {}).items():
        for model in provider_cfg.get("models", []):
            _model_index[model] = provider_name

    logger.info(
        f"Loaded {len(_config.get('providers', {}))} providers, "
        f"{len(_model_index)} models from providers.json"
    )
    return _config


def _get_api_key(env_var: str) -> Optional[str]:
    from app.core.config import settings
    key = getattr(settings, env_var, None)
    if key:
        return key
    return os.environ.get(env_var)


def resolve_model(model: str) -> tuple[str, str, str]:
    """
    按模型名查找对应 provider，返回 (base_url, api_key, model_name)。
    找不到时 fallback 到 default_provider。
    """
    config = _load_config()
    providers = config.get("providers", {})

    # 精确匹配
    provider_name = _model_index.get(model)
    if provider_name:
        provider = providers[provider_name]
        api_key = _get_api_key(provider["api_key_env"])
        if api_key:
            return provider["base_url"], api_key, model

    # Fallback: default provider
    default_name = config.get("default_provider")
    if default_name and default_name in providers:
        provider = providers[default_name]
        api_key = _get_api_key(provider["api_key_env"])
        if api_key:
            return provider["base_url"], api_key, model

    return "", "", model


def list_available_models() -> list[dict]:
    """返回所有已配置 API key 的可用模型列表"""
    config = _load_config()
    providers = config.get("providers", {})
    result = []

    for provider_name, provider_cfg in providers.items():
        api_key = _get_api_key(provider_cfg["api_key_env"])
        if not api_key:
            continue
        for model_id in provider_cfg.get("models", []):
            result.append({
                "id": model_id,
                "provider": provider_name,
                "name": _format_model_name(model_id),
            })

    return result


def _format_model_name(model_id: str) -> str:
    """将 model_id 转为可读的显示名称"""
    name_map = {
        "deepseek-v4-flash": "DeepSeek V4 Flash",
        "deepseek-v4-pro": "DeepSeek V4 Pro",
        "qwen-plus": "Qwen Plus",
        "qwen-max": "Qwen Max",
        "qwen3-235b-a22b": "Qwen3 235B",
        "qwen-turbo": "Qwen Turbo",
        "glm-4-flash": "GLM-4 Flash",
        "glm-4-air": "GLM-4 Air",
        "glm-4.7": "GLM-4.7",
        "glm-5.1": "GLM-5.1",
        "glm-4-plus": "GLM-4 Plus",
    }
    return name_map.get(model_id, model_id)
