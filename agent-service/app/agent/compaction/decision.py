def should_compact(last_input_tokens: int, threshold: int, enabled: bool) -> bool:
    if not enabled:
        return False
    return last_input_tokens > threshold
