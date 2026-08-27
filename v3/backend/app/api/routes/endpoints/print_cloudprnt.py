"""Star CloudPRNT endpoints — server-pull transport for the print queue.

No customer/staff auth: each printer authenticates with its per-printer
pairing token in the path (issued via Admin → Stores → printers, stored in
store_configuration['print.printers']). Mounted at /api/print/cloudprnt.

Protocol implemented (Star CloudPRNT, Version HTTP):
1. Poll   — POST (real firmware) or GET on /{token}. Responds
   {"jobReady": bool, "mediaTypes": [...], "jobToken": "..."} — a queued job
   is claimed by echoing its id as jobToken.
2. Job    — GET /{token}?type=<media>&token=<jobToken> (or the explicit
   /{token}/job/{job_id} form) returns the raw document with the job's
   content type. GET is side-effect free per the spec: the printer may
   re-GET the same job until it confirms.
3. ACK    — DELETE /{token}?token=<jobToken>&code=<status> (or POST/DELETE on
   /{token}/job/{job_id} with the code in the body/query). Codes starting
   with "2" mark the job printed; anything else requeues it (attempts+1,
   capped at printing.MAX_ATTEMPTS, then 'failed').

References:
- https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-guide.html
"""

import logging

from fastapi import APIRouter, HTTPException, Request, Response

from app.api.routes.deps import DBDependency
from app.services.printing import (
    MEDIA_TYPES,
    confirm_job,
    find_printer_by_token,
    get_queued_job,
    next_queued_job,
    touch_printer_last_seen,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def _resolve_printer(db, token: str) -> dict:
    printer = await find_printer_by_token(db, token)
    if printer is None or not printer.get("active", True):
        raise HTTPException(status_code=404, detail="Unknown printer token")
    return printer


def _job_token_from_request(request: Request) -> str | None:
    """CloudPRNT carries the job token as ?token= or the X-Star-Token header."""
    return request.query_params.get("token") or request.headers.get("x-star-token")


async def _poll(db, token: str) -> dict:
    await _resolve_printer(db, token)
    await touch_printer_last_seen(db, token)
    job = await next_queued_job(db, token)
    await db.commit()
    response = {"jobReady": job is not None, "mediaTypes": MEDIA_TYPES}
    if job is not None:
        # Claimed in flight: the printer will GET this token, then DELETE to
        # confirm. The job stays 'queued' so a lost ACK re-offers it.
        response["jobToken"] = str(job.id)
    return response


async def _serve_job(db, token: str, job_id: int) -> Response:
    job = await get_queued_job(db, token, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such queued job")
    return Response(content=job.payload, media_type=job.content_type)


async def _confirm(db, token: str, job_id: int, code: str | None) -> Response:
    job = await confirm_job(db, token, job_id, code)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job")
    await db.commit()
    return Response(status_code=200)


@router.get("/{token}")
async def cloudprnt_get(token: str, request: Request, db: DBDependency):
    """GET poll (simple clients) / job fetch (?type=) / GET-style ACK (?delete=)."""
    params = request.query_params
    job_token = _job_token_from_request(request)
    if "delete" in params or "code" in params:
        if not job_token:
            raise HTTPException(status_code=400, detail="Missing job token")
        return await _confirm(db, token, int(job_token), params.get("code"))
    if "type" in params:
        if not job_token:
            raise HTTPException(status_code=400, detail="Missing job token")
        return await _serve_job(db, token, int(job_token))
    return await _poll(db, token)


@router.post("/{token}")
async def cloudprnt_poll(token: str, db: DBDependency):
    """CloudPRNT server poll (printer POSTs its status JSON; body ignored)."""
    return await _poll(db, token)


@router.delete("/{token}")
async def cloudprnt_confirm(token: str, request: Request, db: DBDependency):
    """CloudPRNT job confirmation: ?token=<jobToken>&code=<status code>."""
    job_token = _job_token_from_request(request)
    if not job_token:
        raise HTTPException(status_code=400, detail="Missing job token")
    return await _confirm(db, token, int(job_token), request.query_params.get("code"))


@router.get("/{token}/job/{job_id}")
async def cloudprnt_job_content(token: str, job_id: int, db: DBDependency):
    """Explicit job-content endpoint (equivalent to GET /{token}?type=...&token=...)."""
    return await _serve_job(db, token, job_id)


@router.api_route("/{token}/job/{job_id}", methods=["POST", "DELETE"])
async def cloudprnt_job_status(token: str, job_id: int, request: Request, db: DBDependency):
    """Status callback: code from ?code= query or a JSON body {code|status}."""
    code = request.query_params.get("code")
    if not code:
        try:
            body = await request.json()
            if isinstance(body, dict):
                code = body.get("code") or body.get("status")
        except Exception:
            code = None
    return await _confirm(db, token, job_id, code)
