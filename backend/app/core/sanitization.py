"""
Input sanitization utilities for XSS prevention.
"""
import bleach
from typing import Optional

# Allowed tags for rich text (if needed in future)
ALLOWED_TAGS = []
ALLOWED_ATTRIBUTES = {}
ALLOWED_STYLES = []


def sanitize_string(value: Optional[str], strip: bool = True) -> Optional[str]:
    """
    Sanitize a string input to prevent XSS attacks.
    Removes all HTML tags by default.
    
    Args:
        value: Input string to sanitize
        strip: If True, strips disallowed tags. If False, escapes them.
    
    Returns:
        Sanitized string or None if input was None
    """
    if value is None:
        return None
    
    # Clean the input
    cleaned = bleach.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=strip
    )
    
    return cleaned


def sanitize_text_field(value: Optional[str], max_length: int = 5000) -> Optional[str]:
    """
    Sanitize a text field with length limit.
    Use for feedback comments, survey answers, etc.
    """
    if value is None:
        return None
    
    # First sanitize
    cleaned = sanitize_string(value)
    
    # Then truncate if needed
    if cleaned and len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    
    return cleaned


def sanitize_json_fields(data: dict, fields_to_sanitize: list[str]) -> dict:
    """
    Sanitize specific fields in a dictionary.
    
    Args:
        data: Dictionary containing data
        fields_to_sanitize: List of field names to sanitize
    
    Returns:
        Dictionary with sanitized fields
    """
    result = data.copy()
    for field in fields_to_sanitize:
        if field in result and isinstance(result[field], str):
            result[field] = sanitize_string(result[field])
    return result
