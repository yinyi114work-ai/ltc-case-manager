#!/usr/bin/env python3
"""Synchronize MOHW administrative interpretations into a static JS dataset.

This script intentionally uses only Python's standard library so it can run in
GitHub Actions without API keys or paid services.  It fetches the public MOHW
law search result, follows each result page, extracts searchable text and
metadata, merges any hand-curated records already in interpretations.js, and
replaces the output only after a minimum-record safety check succeeds.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import socket
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, parse_qsl, urlencode, urljoin, urlparse, urlunparse
from urllib.request import HTTPCookieProcessor, Request, build_opener
from http.cookiejar import CookieJar
from zoneinfo import ZoneInfo


def prefer_ipv4() -> None:
    """Avoid GitHub runner IPv6 routes that some government sites do not serve."""
    original_getaddrinfo = socket.getaddrinfo

    def getaddrinfo_ipv4_first(*args: object, **kwargs: object) -> list[tuple[object, ...]]:
        results = original_getaddrinfo(*args, **kwargs)
        ipv4 = [item for item in results if item[0] == socket.AF_INET]
        return ipv4 or results

    socket.getaddrinfo = getaddrinfo_ipv4_first  # type: ignore[assignment]


DEFAULT_SEARCH_URL = (
    "https://mohwlaw.mohw.gov.tw/FINT/FINTQRY03.aspx?"
    "starDate=00000000&endDate=99991231&no=&n1=&n2=&kt=&"
    "kw=%E9%95%B7%E6%9C%9F%E7%85%A7%E9%A1%A7&kw2=&kw3=&kw4=&"
    "valid=3&type=etype_"
)
DEFAULT_FALLBACK_SEARCH_URL = "https://www.health.taichung.gov.tw/26198/1614263/1617520/1617525/1617526"
USER_AGENT = (
    "LongcareNotesPublicLawSearch/1.0 "
    "(+https://github.com/yinyi114work-ai/Ltcnotes; public-interest archive)"
)
DETAIL_PAGE_RE = re.compile(r"FINTQRY0[45]\.aspx", re.IGNORECASE)
QUERY_PAGE_RE = re.compile(r"FINTQRY03\.aspx", re.IGNORECASE)
TOTAL_PATTERNS = [
    re.compile(r"共\s*([\d,]+)\s*筆"),
    re.compile(r"(?:共有|總計|總共)\s*[：:]?\s*([\d,]+)\s*筆"),
    re.compile(r"([\d,]+)\s*筆(?:資料|結果|函釋)"),
    re.compile(r"總(?:計|共)\s*([\d,]+)\s*筆"),
    re.compile(r"(?:資料)?總筆數\s*[：:]?\s*([\d,]+)"),
    re.compile(r"(?:查詢結果|資料筆數)\s*[：:]?\s*([\d,]+)\s*筆?"),
]
DATE_PATTERNS = [
    re.compile(r"(?:發文日期|日期|公布日期)\s*[：:]?\s*(?:民國)?\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日"),
    re.compile(r"(?:發文日期|日期|公布日期)\s*[：:]?\s*(\d{2,3})[./-](\d{1,2})[./-](\d{1,2})"),
    re.compile(r"(?:發布日期|最後異動日期|上版日期)\s*[：:]?\s*(\d{4})[./-](\d{1,2})[./-](\d{1,2})"),
]
DOC_PATTERNS = [
    re.compile(r"(?:發文字號|文號)\s*[：:]?\s*([^\n]{1,50}?字\s*第?\s*[A-Za-z0-9-]+\s*號)"),
    re.compile(r"([\u3400-\u9fff]{1,16}字\s*第?\s*[A-Za-z0-9-]+\s*號)"),
]
SUBJECT_PATTERNS = [
    re.compile(r"(?:主旨|案由|標題|函釋標題)\s*[：:]\s*([^\n]+)"),
]
BLOCK_TAGS = {
    "address", "article", "aside", "blockquote", "br", "caption", "dd", "div",
    "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1",
    "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol",
    "p", "pre", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
}
NOISE_LINES = {
    "首頁", "回上一頁", "回上頁", "友善列印", "列印", "關閉", "查詢", "重新查詢",
    "法規查詢", "函釋查詢", "網站導覽", "跳到主要內容區塊", "衛生福利部法規檢索系統",
}


def compact_space(value: object) -> str:
    return re.sub(r"[\t\u3000 ]+", " ", str(value or "")).strip()


def normalize_line(value: object) -> str:
    value = html.unescape(str(value or "")).replace("\xa0", " ")
    value = re.sub(r"[\t\r\f\v\u3000 ]+", " ", value)
    return value.strip()


def unique(values: Iterable[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        key = compact_space(value)
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(key)
    return output


class VisiblePageParser(HTMLParser):
    """Extract visible lines, headings and links without assuming site CSS."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._ignored_depth = 0
        self._anchor_href = ""
        self._anchor_parts: list[str] = []
        self._heading_tag = ""
        self._heading_parts: list[str] = []
        self._title_depth = 0
        self._title_parts: list[str] = []
        self._parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self.headings: list[str] = []
        self.meta_title = ""

    def _break(self) -> None:
        if self._parts and self._parts[-1] != "\n":
            self._parts.append("\n")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attributes = {str(key).lower(): value or "" for key, value in attrs}
        if tag in {"script", "style", "noscript", "svg", "template"}:
            self._ignored_depth += 1
            return
        if self._ignored_depth:
            return
        if tag in BLOCK_TAGS:
            self._break()
        if tag == "a":
            self._anchor_href = attributes.get("href", "")
            self._anchor_parts = []
        if tag in {"h1", "h2", "h3", "h4"}:
            self._heading_tag = tag
            self._heading_parts = []
        if tag == "title":
            self._title_depth += 1
        if tag == "meta" and attributes.get("property", "").lower() in {"og:title", "twitter:title"}:
            self.meta_title = normalize_line(attributes.get("content", ""))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "svg", "template"}:
            if self._ignored_depth:
                self._ignored_depth -= 1
            return
        if self._ignored_depth:
            return
        if tag == "a" and self._anchor_href:
            self.links.append((self._anchor_href, normalize_line("".join(self._anchor_parts))))
            self._anchor_href = ""
            self._anchor_parts = []
        if tag == self._heading_tag:
            heading = normalize_line("".join(self._heading_parts))
            if heading:
                self.headings.append(heading)
            self._heading_tag = ""
            self._heading_parts = []
        if tag == "title" and self._title_depth:
            self._title_depth -= 1
        if tag in BLOCK_TAGS:
            self._break()

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        self._parts.append(data)
        if self._anchor_href:
            self._anchor_parts.append(data)
        if self._heading_tag:
            self._heading_parts.append(data)
        if self._title_depth:
            self._title_parts.append(data)

    @property
    def title(self) -> str:
        return normalize_line("".join(self._title_parts)) or self.meta_title

    @property
    def lines(self) -> list[str]:
        lines = [normalize_line(line) for line in "".join(self._parts).splitlines()]
        output: list[str] = []
        for line in lines:
            if not line or line in NOISE_LINES:
                continue
            if output and output[-1] == line:
                continue
            output.append(line)
        return output


@dataclass
class FetchedPage:
    url: str
    source: str
    parser: VisiblePageParser


class Fetcher:
    def __init__(self, fixture_dir: Path | None, timeout: float, delay: float) -> None:
        self.fixture_dir = fixture_dir
        self.timeout = timeout
        self.delay = delay
        self._opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self._last_fetch = 0.0

    def _fixture_path(self, url: str) -> Path:
        parsed = urlparse(url)
        name = Path(parsed.path).name.lower()
        query = parse_qs(parsed.query)
        if name == "fintqry03.aspx":
            return self.fixture_dir / "search.html"  # type: ignore[operator]
        if name == "fintqry04.aspx" and query.get("RowNo"):
            return self.fixture_dir / f"detail-{query['RowNo'][0]}.html"  # type: ignore[operator]
        if name == "fintqry05.aspx":
            key = query.get("eno", query.get("id", ["unknown"]))[0]
            return self.fixture_dir / f"detail-{key}.html"  # type: ignore[operator]
        raise FileNotFoundError(f"No fixture mapping for {url}")

    @staticmethod
    def _decode(payload: bytes, content_type: str) -> str:
        charset_match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", content_type, re.I)
        candidates = [charset_match.group(1)] if charset_match else []
        head = payload[:4096].decode("ascii", errors="ignore")
        meta_match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", head, re.I)
        if meta_match:
            candidates.append(meta_match.group(1))
        candidates.extend(["utf-8-sig", "utf-8", "cp950", "big5"])
        for encoding in unique(candidates):
            try:
                return payload.decode(encoding)
            except (LookupError, UnicodeDecodeError):
                continue
        return payload.decode("utf-8", errors="replace")

    def get(self, url: str) -> FetchedPage:
        if self.fixture_dir:
            source = self._fixture_path(url).read_text(encoding="utf-8")
            final_url = url
        else:
            elapsed = time.monotonic() - self._last_fetch
            if elapsed < self.delay:
                time.sleep(self.delay - elapsed)
            request = Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.5",
                },
            )
            with self._opener.open(request, timeout=self.timeout) as response:
                payload = response.read()
                final_url = response.geturl()
                source = self._decode(payload, response.headers.get("Content-Type", ""))
            self._last_fetch = time.monotonic()

        parser = VisiblePageParser()
        parser.feed(source)
        parser.close()
        return FetchedPage(final_url, source, parser)


def load_js_value(path: Path, variable: str, default: object) -> object:
    if not path.exists():
        return default
    source = path.read_text(encoding="utf-8")
    match = re.search(rf"(?:window\.)?{re.escape(variable)}\s*=\s*", source)
    if not match:
        return default
    try:
        value, _ = json.JSONDecoder().raw_decode(source[match.end():])
        return value
    except json.JSONDecodeError:
        return default


def load_known_codes(data_path: Path) -> dict[str, str]:
    rows = load_js_value(data_path, "CODE_DATA", [])
    if not isinstance(rows, list):
        return {}
    return {
        re.sub(r"[^a-z0-9]", "", str(item.get("code", "")).lower()): str(item.get("code", ""))
        for item in rows
        if isinstance(item, dict) and item.get("code")
    }


def extract_codes(text: str, known_codes: dict[str, str]) -> list[str]:
    matches = re.findall(
        r"(?<![A-Za-z0-9])([A-Za-z]{2}\s*[-－]?\s*\d{2}(?:[A-Za-z]\d?)?)(?![A-Za-z0-9])",
        text,
    )
    output: list[str] = []
    for match in matches:
        key = re.sub(r"[^a-z0-9]", "", match.lower())
        if key in known_codes:
            output.append(known_codes[key])
    return unique(output)


def looks_like_ltc_interpretation_text(text: str, known_codes: dict[str, str]) -> bool:
    if extract_codes(text, known_codes):
        return True
    return re.search(r"衛生福利部|衛福部|函釋|長期照顧|長照|給付|支付|G碼|代購|喘息|輔具|附件", text, re.I) is not None


def extract_total(text: str) -> int | None:
    for pattern in TOTAL_PATTERNS:
        match = pattern.search(text)
        if match:
            return int(match.group(1).replace(",", ""))
    return None


def same_mohw_host(url: str, base_url: str) -> bool:
    return urlparse(url).netloc.lower() == urlparse(base_url).netloc.lower()


def is_taoyuan_care_url(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return host.endswith("care.tycg.gov.tw") or host.endswith("ws.tycg.gov.tw")


def is_taichung_health_url(url: str) -> bool:
    return urlparse(url).netloc.lower().endswith("health.taichung.gov.tw")


def is_taichung_post_url(url: str) -> bool:
    return is_taichung_health_url(url) and re.fullmatch(r"/\d+/post", urlparse(url).path) is not None


def canonical_url(url: str) -> str:
    parsed = urlparse(url)
    query = urlencode(sorted(parse_qsl(parsed.query, keep_blank_values=True)))
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, "", query, ""))


def enumerate_detail_urls(search_page: FetchedPage, search_url: str, maximum: int, fetcher: Fetcher | None = None) -> list[str]:
    candidates: list[str] = []
    for href, _label in search_page.parser.links:
        absolute = urljoin(search_page.url, html.unescape(href))
        if DETAIL_PAGE_RE.search(urlparse(absolute).path) and same_mohw_host(absolute, search_url):
            candidates.append(absolute)
        if is_taoyuan_care_url(search_url) and is_taoyuan_care_url(absolute):
            label = compact_space(_label)
            if label:
                candidates.append(absolute)
        if is_taichung_health_url(search_url) and is_taichung_post_url(absolute):
            candidates.append(absolute)

    if is_taichung_health_url(search_url) and fetcher:
        page_urls: list[str] = []
        for href, label in search_page.parser.links:
            absolute = urljoin(search_page.url, html.unescape(href))
            if not is_taichung_health_url(absolute):
                continue
            if re.fullmatch(r"\d+|下一頁|最後一頁", compact_space(label)):
                page_urls.append(absolute)
        for page_url in unique(page_urls):
            if canonical_url(page_url) == canonical_url(search_page.url):
                continue
            try:
                page = fetcher.get(page_url)
            except (OSError, HTTPError, URLError, TimeoutError, ValueError) as error:
                print(f"Warning: could not fetch Taichung list page {page_url}: {error}", file=sys.stderr)
                continue
            for href, _label in page.parser.links:
                absolute = urljoin(page.url, html.unescape(href))
                if is_taichung_post_url(absolute):
                    candidates.append(absolute)

    # Some ASP.NET pages place navigation URLs in JavaScript rather than anchors.
    for match in re.findall(r"(?:https?://[^\"'<>\s]+|FINTQRY0[45]\.aspx\?[^\"'<>\s]+)", search_page.source, re.I):
        absolute = urljoin(search_page.url, html.unescape(match).replace("&amp;", "&"))
        if DETAIL_PAGE_RE.search(urlparse(absolute).path) and same_mohw_host(absolute, search_url):
            candidates.append(absolute)

    total = extract_total("\n".join(search_page.parser.lines))
    if total is not None:
        if total < 1:
            return []
        if total > maximum:
            raise RuntimeError(f"Search page reports {total} records, above safety maximum {maximum}")
        if QUERY_PAGE_RE.search(urlparse(search_url).path):
            parsed = urlparse(search_url)
            query_pairs = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key.lower() != "rowno"]
            detail_path = QUERY_PAGE_RE.sub("FINTQRY04.aspx", parsed.path)
            for row_number in range(1, total + 1):
                query = urlencode([*query_pairs, ("RowNo", str(row_number))])
                candidates.append(urlunparse((parsed.scheme, parsed.netloc, detail_path, "", query, "")))

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = canonical_url(candidate)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def roc_date_from_parts(year: str, month: str, day: str) -> str:
    year_number = int(year)
    if year_number >= 1912:
        year_number -= 1911
    return f"{year_number:03d}-{int(month):02d}-{int(day):02d}"


def extract_date(text: str, source_url: str) -> str:
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            return roc_date_from_parts(*match.groups())

    query = parse_qs(urlparse(source_url).query)
    raw = "".join(query.get("edate", []))
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 7:
        return roc_date_from_parts(digits[:3], digits[3:5], digits[5:7])
    if len(digits) == 8 and int(digits[:4]) >= 1912:
        return roc_date_from_parts(str(int(digits[:4]) - 1911), digits[4:6], digits[6:8])
    return ""


def extract_doc_number(text: str, source_url: str) -> str:
    for pattern in DOC_PATTERNS:
        match = pattern.search(text)
        if match:
            return re.sub(r"\s+", "", match.group(1)).replace("第第", "第")

    query = parse_qs(urlparse(source_url).query)
    eno = compact_space("".join(query.get("eno", [])))
    ecode = compact_space("".join(query.get("ecode", [])))
    ecase = compact_space("".join(query.get("ecase", [])))
    if eno and (ecode or ecase):
        prefix = ecode if "字" in ecode else f"{ecode}{ecase}字"
        return f"{prefix}第{eno}號"
    return eno


def extract_subject(text: str, parser: VisiblePageParser, doc_number: str) -> str:
    for pattern in SUBJECT_PATTERNS:
        match = pattern.search(text)
        if match:
            subject = compact_space(match.group(1)).strip("。 ")
            if 3 <= len(subject) <= 240:
                return subject

    lines = text.splitlines()
    for index, line in enumerate(lines[:-1]):
        if re.fullmatch(r"(?:主旨|案由|標題|函釋標題)\s*[：:]?", line):
            subject = compact_space(lines[index + 1]).strip("。 ")
            if 3 <= len(subject) <= 240:
                return subject

    for heading in parser.headings:
        if heading not in NOISE_LINES and not re.search(r"法規檢索|函釋查詢|行政函釋", heading):
            return heading[:240]

    title = re.split(r"[|｜]", parser.title)[0].strip()
    if title and not re.search(r"法規檢索|函釋查詢|行政函釋", title):
        return title[:240]
    return doc_number or "衛生福利部行政函釋"


def build_raw_text(lines: list[str], doc_number: str) -> str:
    cleaned: list[str] = []
    for line in lines:
        if line in NOISE_LINES:
            continue
        if re.fullmatch(r"(?:上一筆|下一筆|第\s*\d+\s*筆|\d+)", line):
            continue
        if cleaned and cleaned[-1] == line:
            continue
        cleaned.append(line)

    start_markers = ("發文日期", "發文字號", "主旨", "說明", "案由")
    starts = [index for index, line in enumerate(cleaned) if line.startswith(start_markers) or (doc_number and doc_number in line)]
    if starts:
        cleaned = cleaned[max(0, min(starts) - 1):]

    footer_markers = ("瀏覽人次", "更新日期", "隱私權", "資訊安全政策", "版權所有")
    for index, line in enumerate(cleaned):
        if index > 3 and line.startswith(footer_markers):
            cleaned = cleaned[:index]
            break
    return "\n".join(cleaned).strip()


def record_key(item: dict[str, object]) -> str:
    doc_number = re.sub(r"[\s：:，,。第號-]", "", str(item.get("docNo", ""))).lower()
    if doc_number:
        return f"doc:{doc_number}"
    source = str(item.get("source", ""))
    return f"url:{canonical_url(source)}" if source else f"id:{item.get('id', '')}"


def record_id(doc_number: str, source_url: str) -> str:
    digits = re.findall(r"\d{7,}", doc_number)
    if digits:
        return digits[-1]
    digest = hashlib.sha256(canonical_url(source_url).encode("utf-8")).hexdigest()[:14]
    return f"mohw-{digest}"


def parse_interpretation(page: FetchedPage, known_codes: dict[str, str]) -> dict[str, object] | None:
    visible_text = "\n".join(page.parser.lines)
    doc_number = extract_doc_number(visible_text, page.url)
    date = extract_date(visible_text, page.url)
    title = extract_subject(visible_text, page.parser, doc_number)
    raw = build_raw_text(page.parser.lines, doc_number)
    codes = extract_codes(f"{title}\n{raw}", known_codes)

    # A valid result must contain real searchable content, not an error or login page.
    if len(raw) < 40 or not (doc_number or date or re.search(r"主旨|說明|函釋", raw)):
        return None

    summary_source = re.sub(r"\s+", " ", title if title and title != doc_number else raw)
    summary = summary_source[:360] + ("…" if len(summary_source) > 360 else "")
    keywords = " ".join(unique([*codes, doc_number, title]))
    if is_taoyuan_care_url(page.url):
        status = "桃園市政府衛生局衛生福利部函釋專區索引"
        agency = "桃園市政府衛生局／衛生福利部函釋轉知"
    elif is_taichung_health_url(page.url):
        status = "臺中市政府衛生局長照特約單位解釋函整理"
        agency = "臺中市政府衛生局／衛生福利部函釋轉知"
    else:
        status = "衛福部法規檢索系統函釋"
        agency = "衛生福利部"

    return {
        "id": record_id(doc_number, page.url),
        "codes": codes,
        "date": date,
        "docNo": doc_number,
        "title": title,
        "summary": summary,
        "raw": raw,
        "source": page.url,
        "status": status,
        "keywords": keywords,
        "agency": agency,
    }


def parse_taoyuan_index_records(page: FetchedPage, known_codes: dict[str, str]) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for href, label in page.parser.links:
        title = compact_space(label)
        if not title:
            continue
        if not looks_like_ltc_interpretation_text(title, known_codes):
            continue
        source_url = urljoin(page.url, html.unescape(href))
        if not is_taoyuan_care_url(source_url):
            continue
        doc_number = extract_doc_number(title, source_url)
        date = extract_date(title, source_url)
        codes = extract_codes(title, known_codes)
        keywords = " ".join(unique([*codes, doc_number, title]))
        records.append({
            "id": record_id(doc_number, source_url),
            "codes": codes,
            "date": date,
            "docNo": doc_number,
            "title": title,
            "summary": title,
            "raw": title,
            "source": source_url,
            "status": "桃園市政府衛生局衛生福利部函釋專區索引",
            "keywords": keywords,
            "agency": "桃園市政府衛生局／衛生福利部函釋轉知",
        })
    return list({record_key(item): item for item in records}.values())


def merge_curated(
    scraped: list[dict[str, object]],
    existing: list[dict[str, object]],
    preserve_missing_auto: bool,
) -> list[dict[str, object]]:
    merged = {record_key(item): dict(item) for item in scraped}
    for curated in existing:
        key = record_key(curated)
        if key not in merged:
            if curated.get("status") == "衛福部法規檢索系統函釋" and not preserve_missing_auto:
                continue
            merged[key] = dict(curated)
            continue
        record = merged[key]
        # Preserve human-written descriptions and search terms while retaining
        # the live MOHW source URL and complete extracted text.
        for field in ("title", "summary", "keywords", "status"):
            if curated.get(field):
                record[field] = curated[field]
        curated_codes = curated.get("codes")
        if isinstance(curated_codes, list):
            record["codes"] = unique([*(record.get("codes") or []), *map(str, curated_codes)])
        if curated.get("source") and curated.get("source") != record.get("source"):
            record["alternateSource"] = curated["source"]

    def date_key(item: dict[str, object]) -> tuple[str, str]:
        return (str(item.get("date", "")), str(item.get("docNo", item.get("id", ""))))

    return sorted(merged.values(), key=date_key, reverse=True)


def write_atomic(path: Path, meta: dict[str, object], records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (
        f"window.INTERPRETATION_META = {json.dumps(meta, ensure_ascii=False, indent=2)};\n\n"
        f"window.INTERPRETATIONS = {json.dumps(records, ensure_ascii=False, indent=2)};\n"
    )
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def synchronize(args: argparse.Namespace) -> tuple[int, int]:
    output_path = args.output.resolve()
    existing_path = args.existing.resolve() if args.existing else output_path
    data_path = args.code_data.resolve()
    fixture_dir = args.fixture_dir.resolve() if args.fixture_dir else None
    fetcher = Fetcher(fixture_dir, args.timeout, args.delay)

    search_page = fetcher.get(args.search_url)
    reported_total = extract_total("\n".join(search_page.parser.lines))
    known_codes = load_known_codes(data_path)
    if not known_codes:
        raise RuntimeError(f"No known long-term-care codes could be loaded from {data_path}")

    scraped_by_key: dict[str, dict[str, object]] = {}
    failures: list[str] = []
    if is_taoyuan_care_url(args.search_url):
        for record in parse_taoyuan_index_records(search_page, known_codes):
            scraped_by_key[record_key(record)] = record
    else:
        detail_urls = enumerate_detail_urls(search_page, args.search_url, args.maximum_records, fetcher)
        if not detail_urls:
            raise RuntimeError("No interpretation result links were found; existing data was not changed")

        for index, url in enumerate(detail_urls, start=1):
            try:
                page = fetcher.get(url)
                record = parse_interpretation(page, known_codes)
                if record:
                    scraped_by_key[record_key(record)] = record
                else:
                    failures.append(f"{index}: page did not contain a valid interpretation ({url})")
            except (OSError, HTTPError, URLError, TimeoutError, ValueError) as error:
                failures.append(f"{index}: {error} ({url})")

    scraped = list(scraped_by_key.values())
    existing_value = load_js_value(existing_path, "INTERPRETATIONS", [])
    existing = [item for item in existing_value if isinstance(item, dict)] if isinstance(existing_value, list) else []
    previous_auto_count = sum(
        item.get("status") == "衛福部法規檢索系統函釋" for item in existing
    )
    safety_floor = args.minimum_records
    if reported_total:
        safety_floor = max(safety_floor, int(reported_total * 0.70))
    if previous_auto_count:
        safety_floor = max(safety_floor, int(previous_auto_count * 0.70))

    if len(scraped) < safety_floor:
        detail = "\n".join(failures[:8])
        raise RuntimeError(
            f"Safety check failed: extracted {len(scraped)} unique records, "
            f"required at least {safety_floor} (configured minimum {args.minimum_records}, "
            f"reported total {reported_total or 'unknown'}, previous automatic records "
            f"{previous_auto_count}). Existing data was not changed."
            + (f"\nFirst failures:\n{detail}" if detail else "")
        )

    records = merge_curated(scraped, existing, preserve_missing_auto=bool(failures))
    synced_at = datetime.now(ZoneInfo("Asia/Taipei")).isoformat(timespec="seconds")
    meta = {
        "source": args.search_url,
        "syncedAt": synced_at,
        "scrapedCount": len(scraped),
        "reportedCount": reported_total,
        "count": len(records),
        "mode": (
            "桃園市政府衛生局衛生福利部函釋專區自動同步"
            if is_taoyuan_care_url(args.search_url)
            else (
                "臺中市政府衛生局長照特約單位解釋函自動同步"
                if is_taichung_health_url(args.search_url)
                else "衛生福利部法規檢索系統自動同步"
            )
        ),
        "failedPages": len(failures),
    }
    write_atomic(output_path, meta, records)

    if failures:
        print(f"Warning: {len(failures)} result page(s) could not be parsed", file=sys.stderr)
        for failure in failures[:8]:
            print(f"  {failure}", file=sys.stderr)
    return len(scraped), len(records)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--search-url", default=DEFAULT_SEARCH_URL)
    parser.add_argument("--fallback-search-url", default=DEFAULT_FALLBACK_SEARCH_URL)
    parser.add_argument("--output", type=Path, default=Path("law/interpretations.js"))
    parser.add_argument("--existing", type=Path, default=None)
    parser.add_argument("--code-data", type=Path, default=Path("law/data.js"))
    parser.add_argument("--fixture-dir", type=Path)
    parser.add_argument("--minimum-records", type=int, default=10)
    parser.add_argument("--maximum-records", type=int, default=1000)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--delay", type=float, default=0.35)
    return parser


def main() -> int:
    prefer_ipv4()
    args = build_parser().parse_args()
    try:
        scraped_count, total_count = synchronize(args)
    except Exception as error:
        if not args.fallback_search_url or args.search_url == args.fallback_search_url:
            print(f"Interpretation synchronization failed: {error}", file=sys.stderr)
            return 1
        print(f"Primary MOHW synchronization failed: {error}", file=sys.stderr)
        print(f"Trying fallback source: {args.fallback_search_url}", file=sys.stderr)
        args.search_url = args.fallback_search_url
        try:
            scraped_count, total_count = synchronize(args)
        except Exception as fallback_error:
            print(f"Fallback interpretation synchronization failed: {fallback_error}", file=sys.stderr)
            return 1
    print(f"MOHW synchronization complete: {scraped_count} scraped, {total_count} total records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
