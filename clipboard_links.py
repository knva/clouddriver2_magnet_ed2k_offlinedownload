from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Iterable
from urllib.parse import parse_qs, unquote, urlsplit


TRAILING_PUNCTUATION = ".,;:!?，。；：！？、)]}）】》"
MAGNET_RE = re.compile(r"magnet:\?[^\s<>'\"`]+", re.IGNORECASE)
ED2K_FILE_RE = re.compile(r"ed2k://\|file\|.*?\|/", re.IGNORECASE)
ED2K_GENERIC_RE = re.compile(r"ed2k://[^\s<>'\"`]+", re.IGNORECASE)


@dataclass(frozen=True)
class ClipboardLink:
    url: str
    kind: str
    name: str


def _strip_trailing_punctuation(url: str) -> str:
    return url.rstrip(TRAILING_PUNCTUATION)


def _display_name_for_magnet(url: str) -> str:
    query = urlsplit(url).query
    dn_values = parse_qs(query).get("dn", [])
    if dn_values and dn_values[0].strip():
        return dn_values[0].strip()
    return "磁力链接任务"


def _display_name_for_ed2k(url: str) -> str:
    parts = url.split("|")
    if len(parts) >= 3 and parts[2].strip():
        return unquote(parts[2].strip())
    return "ed2k链接任务"


def _candidate_links(text: str) -> Iterable[ClipboardLink]:
    for match in MAGNET_RE.finditer(text):
        url = _strip_trailing_punctuation(match.group(0))
        yield ClipboardLink(url=url, kind="magnet", name=_display_name_for_magnet(url))

    consumed_spans = []
    for match in ED2K_FILE_RE.finditer(text):
        consumed_spans.append(match.span())
        url = _strip_trailing_punctuation(match.group(0))
        yield ClipboardLink(url=url, kind="ed2k", name=_display_name_for_ed2k(url))

    for match in ED2K_GENERIC_RE.finditer(text):
        start, end = match.span()
        if any(start >= span_start and end <= span_end for span_start, span_end in consumed_spans):
            continue
        url = _strip_trailing_punctuation(match.group(0))
        yield ClipboardLink(url=url, kind="ed2k", name=_display_name_for_ed2k(url))


def extract_links(text: str) -> list[ClipboardLink]:
    seen: set[str] = set()
    links: list[ClipboardLink] = []
    for link in _candidate_links(text or ""):
        if not link.url or link.url in seen:
            continue
        seen.add(link.url)
        links.append(link)
    return links


def normalize_base_directory(directory: str) -> str:
    normalized = (directory or "").strip().replace("\\", "/")
    normalized = re.sub(r"/+", "/", normalized).strip("/")
    if not normalized:
        return ""
    return f"/{normalized}"


def build_target_directory(base_directory: str, target_date: date | None = None) -> str:
    target_date = target_date or date.today()
    date_folder = target_date.strftime("%Y%m%d")
    base = normalize_base_directory(base_directory)
    if not base:
        return f"/{date_folder}"
    return f"{base}/{date_folder}"
