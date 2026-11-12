"""Minimal Supabase REST + Storage client for the ai-service (httpx, no SDK).

Uses a dedicated server credential (service role / secret key) that never
leaves the server side. Only the calls the job runner needs.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx


class SupabaseError(Exception):
    def __init__(self, code: str, status: int | None = None):
        super().__init__(f"{code} ({status})" if status else code)
        self.code = code
        self.status = status


class SupabaseAdmin:
    def __init__(self, url: str, key: str, *, transport: httpx.BaseTransport | None = None, timeout: float = 60.0):
        if not url or not key:
            raise SupabaseError("SUPABASE_NOT_CONFIGURED")
        headers = {"apikey": key}
        # Legacy JWT keys also go in Authorization; new `sb_secret_...` keys go in `apikey` only.
        if not key.startswith("sb_"):
            headers["authorization"] = f"Bearer {key}"
        self.http = httpx.Client(base_url=url.rstrip("/"), headers=headers, timeout=timeout, transport=transport)

    # ------------------------------------------------------------------ rows
    def select_one(self, table: str, filters: dict[str, str], columns: str = "*") -> dict[str, Any] | None:
        params = {"select": columns, **{k: f"eq.{v}" for k, v in filters.items()}}
        r = self.http.get(f"/rest/v1/{table}", params=params)
        self._check(r, "SELECT_FAILED")
        rows = r.json()
        return rows[0] if rows else None

    def update(self, table: str, filters: dict[str, str], values: dict[str, Any]) -> list[dict[str, Any]]:
        """PATCH rows matching all filters (`eq.` unless the value already has an operator)."""
        params = {
            k: (v if "." in v and v.split(".", 1)[0] in {"eq", "in", "neq", "is"} else f"eq.{v}") for k, v in filters.items()
        }
        r = self.http.patch(f"/rest/v1/{table}", params=params, json=values, headers={"prefer": "return=representation"})
        self._check(r, "UPDATE_FAILED")
        return r.json()

    def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        r = self.http.post(f"/rest/v1/{table}", json=row, headers={"prefer": "return=representation"})
        self._check(r, "INSERT_FAILED")
        return r.json()[0]

    # ------------------------------------------------------------------ storage
    def download(self, bucket: str, key: str) -> bytes:
        r = self.http.get(f"/storage/v1/object/{bucket}/{quote(key)}")
        if r.status_code in (400, 404):
            raise SupabaseError("OBJECT_NOT_FOUND", r.status_code)
        self._check(r, "DOWNLOAD_FAILED")
        return r.content

    def upload(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        r = self.http.post(
            f"/storage/v1/object/{bucket}/{quote(key)}",
            content=data,
            headers={"content-type": content_type, "x-upsert": "false", "cache-control": "3600"},
        )
        self._check(r, "UPLOAD_FAILED")

    def remove(self, bucket: str, keys: list[str]) -> None:
        if keys:
            r = self.http.request("DELETE", f"/storage/v1/object/{bucket}", json={"prefixes": keys})
            self._check(r, "REMOVE_FAILED")

    @staticmethod
    def _check(r: httpx.Response, code: str) -> None:
        if r.status_code >= 300:
            raise SupabaseError(code, r.status_code)
