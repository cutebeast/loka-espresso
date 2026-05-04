"""PWA-facing endpoints for Information Cards and Version Management.

- GET /content/information — list active cards for PWA home
- GET /content/version — get current PWA version for update checks
"""
import json
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, or_
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import now_utc, ensure_utc
from app.models.content import InformationCard
from app.models.notification import NotificationBroadcast
from app.schemas.store import StoreOut

router = APIRouter(prefix="/content", tags=["PWA Content"])


class InformationCardOut(BaseModel):
    """Information card data for PWA."""
    id: int
    title: str
    slug: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    content_type: Optional[str] = None
    icon: Optional[str] = None
    image_url: Optional[str] = None
    gallery_urls: Optional[List[str]] = None
    action_url: Optional[str] = None
    action_type: Optional[str] = None
    action_label: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/information", response_model=List[InformationCardOut])
async def list_active_cards(
    content_type: Optional[str] = None,
    include_system: bool = False,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    """List all active information cards for PWA (public, no auth required).
    
    Query params:
    - content_type: Filter by type ('promotion', 'system', etc.)
    - include_system: If true, include system content (T&C, Privacy)
    - limit: Maximum number of cards to return (default 10)
    
    Cards are filtered by:
    - is_active = True
    - Within date range (start_date <= now <= end_date)
    - Sorted by position, then created_at
    """
    now = now_utc()
    
    query = select(InformationCard).where(InformationCard.is_active == True)
    
    # Filter by content_type
    if content_type:
        query = query.where(InformationCard.content_type == content_type)
    elif not include_system:
        # By default, exclude system content (T&C, Privacy Policy)
        query = query.where(InformationCard.content_type != 'system')
    
    query = query.order_by(InformationCard.position, InformationCard.created_at.desc())
    query = query.limit(limit)
    
    result = await db.execute(query)
    cards = result.scalars().all()
    
    # Filter by date range in Python (handle null dates)
    out = []
    for card in cards:
        if card.start_date and ensure_utc(card.start_date) > now:
            continue
        if card.end_date and ensure_utc(card.end_date) < now:
            continue
        out.append(card)
    
    return out


@router.get("/information/{slug}", response_model=InformationCardOut)
async def get_card_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single information card by slug (public, no auth required).

    Used for QR code deep-linking to specific articles.
    """
    result = await db.execute(
        select(InformationCard)
        .where(InformationCard.slug == slug, InformationCard.is_active == True)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Article not found")
    return card


class SystemContentOut(BaseModel):
    """System content like T&C and Privacy Policy."""
    id: int
    title: str
    long_description: Optional[str] = None
    sections: Optional[list] = None
    content_type: str = "system"
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/legal/{content_key}", response_model=SystemContentOut)
async def get_legal_content(
    content_key: str,  # 'terms', 'privacy', or 'about'
    db: AsyncSession = Depends(get_db),
):
    """Get system content by key. Supports 'terms', 'privacy', 'about', or any slug."""
    # Map known keys to title patterns, otherwise treat as slug
    key_map = {
        "terms": "Terms & Conditions",
        "privacy": "Privacy Policy",
        "about": "About Loka Espresso",
    }
    title_pattern = key_map.get(content_key, content_key)
    
    result = await db.execute(
        select(InformationCard)
        .where(
            InformationCard.content_type == "system",
            InformationCard.is_active == True,
            or_(
                InformationCard.title.ilike(f"%{title_pattern}%"),
                InformationCard.slug == content_key,
            ),
        )
    )
    card = result.scalar_one_or_none()
    
    if not card:
        raise HTTPException(status_code=404, detail=f"{content_key} not found")
    
    return SystemContentOut(
        id=card.id,
        title=card.title,
        long_description=card.long_description,
        sections=card.sections,
        content_type=card.content_type,
        updated_at=card.updated_at,
    )


class PWAVersionInfo(BaseModel):
    """PWA version info for update checking."""
    version: str
    build_date: str
    cache_name: str
    requires_update: bool = False


@router.get("/version", response_model=PWAVersionInfo)
async def get_pwa_version(
    client_version: Optional[str] = None,
):
    """Get current PWA version. Client should send its version, 
    server returns whether update is required.
    
    Query param:
    - client_version: The version the PWA currently has
    
    Returns:
    - version: Current server version
    - build_date: When this version was built
    - cache_name: Service worker cache name
    - requires_update: True if client needs to refresh
    """
    from app.core.config import get_settings
    settings = get_settings()
    manifest_path = os.path.join(settings.CUSTOMER_APP_DIR, "public", "manifest.json")
    
    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        
        server_version = manifest.get('version', '1.0.0')
        build_date = manifest.get('build_date', datetime.now(timezone.utc).isoformat())
        
        # Check if update required
        requires_update = False
        if client_version and client_version != server_version:
            requires_update = True
        
        return PWAVersionInfo(
            version=server_version,
            build_date=build_date,
            cache_name=f"loka-pwa-v{server_version}",
            requires_update=requires_update
        )
    except Exception as e:
        # Fallback if manifest can't be read
        return PWAVersionInfo(
            version="1.0.0",
            build_date=datetime.now(timezone.utc).isoformat(),
            cache_name="loka-pwa-v1.0.0",
            requires_update=False
        )


class NotificationOut(BaseModel):
    """Notification for PWA."""
    id: int
    title: str
    body: str
    created_at: str
    is_read: bool = False


@router.get("/notifications")
async def get_pwa_notifications(
    last_check: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get new notifications since last check.
    
    Query param:
    - last_check: ISO datetime of last check (optional)
    
    Returns list of new notifications for the user.
    """
    query = select(NotificationBroadcast).where(
        NotificationBroadcast.is_archived == False,
        NotificationBroadcast.status == "sent"
    )
    
    if last_check:
        query = query.where(NotificationBroadcast.sent_at > last_check)
    
    # Get last 10 notifications
    query = query.order_by(desc(NotificationBroadcast.sent_at)).limit(10)
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "body": n.body,
                "created_at": n.sent_at.isoformat() if n.sent_at else n.created_at.isoformat(),
                "is_read": False  # PWA tracks this locally
            }
            for n in notifications
        ],
        "total": len(notifications),
        "server_time": datetime.now(timezone.utc).isoformat()
    }

@router.get("/stores", response_model=list[StoreOut])
async def list_stores_public(db: AsyncSession = Depends(get_db)):
    """Public endpoint: list all active stores."""
    from app.models.store import Store
    from app.schemas.store import StoreOut
    result = await db.execute(select(Store).where(Store.is_active == True).order_by(Store.name))
    stores = result.scalars().all()
    return [StoreOut.model_validate(s) for s in stores]


@router.get("/location")
async def get_location(request: Request):
    """Return user's approximate location based on IP using local GeoLite2 DB if available, else fallback to ip-api."""
    try:
        import maxminddb
        reader = maxminddb.open_database('/app/data/GeoLite2-City.mmdb')
        client_ip = request.client.host if request.client else '127.0.0.1'
        if client_ip in ('127.0.0.1', '::1', 'localhost') or client_ip.startswith('172.'):
            forwarded = request.headers.get('X-Forwarded-For', '')
            if forwarded:
                client_ip = forwarded.split(',')[0].strip()
        record = reader.get(client_ip)
        if record and 'location' in record:
            loc = record['location']
            lat = loc.get('latitude')
            lng = loc.get('longitude')
            if lat and lng:
                return {"lat": float(lat), "lng": float(lng), "source": "maxmind"}
    except Exception as e:
        print(f"[location] MaxMind failed: {e}")

    try:
        import urllib.request
        import json as json_mod
        ip = request.client.host if request.client else ''
        url = f'https://ip-api.com/json/{ip}?fields=status,lat,lon' if ip else 'https://ip-api.com/json/?fields=status,lat,lon'
        req = urllib.request.Request(url, headers={'User-Agent': 'LokaPWA/1.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json_mod.loads(resp.read())
            if data.get('status') == 'success':
                return {"lat": data['lat'], "lng": data['lon'], "source": "ip-api"}
    except Exception:
        pass

    return {"lat": 3.139, "lng": 101.687, "source": "default"}
