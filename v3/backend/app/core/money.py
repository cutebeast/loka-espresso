"""Centralised money helpers for decimal-safe accounting.

All monetary calculations should use :class:`decimal.Decimal` internally and
round through :func:`money_round` using the admin-configurable precision and
rounding mode stored in ``platform_config``.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_DOWN, ROUND_HALF_DOWN, ROUND_HALF_EVEN, ROUND_HALF_UP, ROUND_UP

# Mapping between human-friendly config values and Decimal rounding constants.
ROUNDING_MODES: dict[str, str] = {
    "ROUND_HALF_UP": ROUND_HALF_UP,
    "ROUND_HALF_DOWN": ROUND_HALF_DOWN,
    "ROUND_HALF_EVEN": ROUND_HALF_EVEN,
    "ROUND_UP": ROUND_UP,
    "ROUND_DOWN": ROUND_DOWN,
}

DEFAULT_PRECISION = 2
DEFAULT_ROUNDING = ROUND_HALF_UP


def to_decimal(value) -> Decimal:
    """Coerce a value to Decimal without introducing binary-float artifacts.

    ``float`` values are converted via ``str()`` so that ``1.1`` becomes
    ``Decimal('1.1')`` rather than ``Decimal('1.1000000000000000888...')``.
    """
    if isinstance(value, Decimal):
        return value
    if value is None:
        return Decimal("0")
    if isinstance(value, float):
        return Decimal(str(value))
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return Decimal("0")


def money_round(
    value,
    decimal_places: int = DEFAULT_PRECISION,
    rounding_mode: str | None = None,
) -> Decimal:
    """Round a monetary value to the configured precision.

    Args:
        value: Numeric value to round.
        decimal_places: Number of decimal places to keep (default 2).
        rounding_mode: One of the ROUND_* strings; defaults to ROUND_HALF_UP.

    Returns:
        A quantized Decimal.
    """
    d = to_decimal(value)
    if decimal_places < 0:
        return d
    mode = ROUNDING_MODES.get(rounding_mode, DEFAULT_ROUNDING) if rounding_mode else DEFAULT_ROUNDING
    quantize_exp = Decimal(1) / (Decimal(10) ** decimal_places)
    return d.quantize(quantize_exp, rounding=mode)
