"""HttpOnly cookie helpers for customer and staff auth.

These helpers are used by auth endpoints to set/clear cookies and by
dependencies to read tokens from cookies when present. They allow a gradual
migration from header-based auth to cookie-based auth.
"""

from fastapi import Request, Response

ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"
STAFF_ACCESS_COOKIE_NAME = "staff_token"  # keep legacy name for staff portal
STAFF_REFRESH_COOKIE_NAME = "staff_refresh_token"
ADMIN_ACCESS_COOKIE_NAME = "admin_token"
ADMIN_REFRESH_COOKIE_NAME = "admin_refresh_token"

# Max-age values (seconds)
ACCESS_MAX_AGE = 60 * 480  # 8 hours — matches jwt_expire_minutes
REFRESH_MAX_AGE = 60 * 60 * 24 * 7  # 7 days (admin)
CUSTOMER_REFRESH_MAX_AGE = 60 * 60 * 24 * 90  # 90 days — app-like PWA sessions
STAFF_REFRESH_MAX_AGE = 60 * 60 * 24 * 30  # 30 days — staff stay signed in across rosters


def _is_secure() -> bool:
    """Cookies are marked Secure outside local development.

    The portals run behind HTTPS in production/dev domains; localhost dev
    uses http so Secure must be False there.
    """
    from app.core.config import get_settings

    settings = get_settings()
    return settings.is_production or (not settings.is_development)


def _set_cookie(
    response: Response,
    name: str,
    value: str,
    max_age: int,
    path: str = "/",
) -> None:
    response.set_cookie(
        key=name,
        value=value,
        httponly=True,
        secure=_is_secure(),
        samesite="lax",
        max_age=max_age,
        path=path,
    )


def set_customer_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
) -> None:
    _set_cookie(response, ACCESS_COOKIE_NAME, access_token, ACCESS_MAX_AGE, "/")
    # Refresh cookie is scoped to the auth root (not just /refresh) so the
    # logout endpoint also receives it and can blacklist it server-side.
    _set_cookie(response, REFRESH_COOKIE_NAME, refresh_token, CUSTOMER_REFRESH_MAX_AGE, "/api/auth")


def set_staff_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
) -> None:
    _set_cookie(response, STAFF_ACCESS_COOKIE_NAME, access_token, ACCESS_MAX_AGE, "/")
    if refresh_token:
        _set_cookie(response, STAFF_REFRESH_COOKIE_NAME, refresh_token, STAFF_REFRESH_MAX_AGE, "/api/staff/auth")


def clear_customer_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/auth")
    # Legacy path (pre round-34) — clear both during the transition.
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/auth/refresh")


def clear_staff_auth_cookies(response: Response) -> None:
    response.delete_cookie(STAFF_ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(STAFF_REFRESH_COOKIE_NAME, path="/api/staff/auth")
    response.delete_cookie(STAFF_REFRESH_COOKIE_NAME, path="/api/staff/auth/refresh")


def set_admin_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
) -> None:
    _set_cookie(response, ADMIN_ACCESS_COOKIE_NAME, access_token, ACCESS_MAX_AGE, "/")
    if refresh_token:
        _set_cookie(response, ADMIN_REFRESH_COOKIE_NAME, refresh_token, REFRESH_MAX_AGE, "/api/admin/auth")


def clear_admin_auth_cookies(response: Response) -> None:
    response.delete_cookie(ADMIN_ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(ADMIN_REFRESH_COOKIE_NAME, path="/api/admin/auth")
    response.delete_cookie(ADMIN_REFRESH_COOKIE_NAME, path="/api/admin/auth/refresh")


def get_token_from_cookie(request: Request, name: str) -> str | None:
    return request.cookies.get(name)


def get_customer_access_token(request: Request) -> str | None:
    return get_token_from_cookie(request, ACCESS_COOKIE_NAME)


def get_customer_refresh_token(request: Request) -> str | None:
    return get_token_from_cookie(request, REFRESH_COOKIE_NAME)


def get_staff_access_token(request: Request) -> str | None:
    return get_token_from_cookie(request, STAFF_ACCESS_COOKIE_NAME)


def get_staff_refresh_token(request: Request) -> str | None:
    return get_token_from_cookie(request, STAFF_REFRESH_COOKIE_NAME)


def get_admin_access_token(request: Request) -> str | None:
    return get_token_from_cookie(request, ADMIN_ACCESS_COOKIE_NAME)


def get_admin_refresh_token(request: Request) -> str | None:
    return get_token_from_cookie(request, ADMIN_REFRESH_COOKIE_NAME)
