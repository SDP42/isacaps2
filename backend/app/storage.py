"""Evidence storage: magic-byte sniffing, SHA-256 custody hashes, content-addressed files."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from .config import settings

# (prefix bytes, offset, kind, mime)
_SIGNATURES: list[tuple[bytes, int, str, str]] = [
    (b"RIFF", 0, "audio", "audio/wav"),  # refined below: RIFF....WAVE vs AVI
    (b"ID3", 0, "audio", "audio/mpeg"),
    (b"\xff\xfb", 0, "audio", "audio/mpeg"),
    (b"\xff\xf3", 0, "audio", "audio/mpeg"),
    (b"OggS", 0, "audio", "audio/ogg"),
    (b"fLaC", 0, "audio", "audio/flac"),
    (b"\x1aE\xdf\xa3", 0, "video", "video/webm"),
    (b"\x89PNG", 0, "image", "image/png"),
    (b"\xff\xd8\xff", 0, "image", "image/jpeg"),
    (b"GIF8", 0, "image", "image/gif"),
]
_BLOCKED = [b"MZ", b"\x7fELF", b"\xca\xfe\xba\xbe", b"PK\x03\x04"]
TEXT_EXT = {".txt", ".eml", ".md", ".csv", ".json"}


class RejectedUpload(ValueError):
    pass


@dataclass
class StoredFile:
    kind: str
    mime: str
    sha256: str
    size: int
    key: str
    path: Path


def sniff(head: bytes, filename: str) -> tuple[str, str]:
    if any(head.startswith(b) for b in _BLOCKED):
        raise RejectedUpload(f"{filename}: executables and archives are not accepted as evidence.")
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"M4A ", b"M4B "):
            return "audio", "audio/mp4"
        return "video", "video/mp4"
    if head.startswith(b"RIFF"):
        if head[8:12] == b"WAVE":
            return "audio", "audio/wav"
        if head[8:12] == b"WEBP":
            return "image", "image/webp"
        if head[8:12] == b"AVI ":
            return "video", "video/x-msvideo"
    if head.startswith(b"\x1aE\xdf\xa3") and Path(filename).suffix.lower() in (".weba", ".opus", ".oga"):
        return "audio", "audio/webm"  # browser voice recordings are audio-only WebM
    for sig, off, kind, mime in _SIGNATURES:
        if head[off : off + len(sig)] == sig and sig != b"RIFF":
            return kind, mime
    if Path(filename).suffix.lower() in TEXT_EXT:
        try:
            head.decode("utf-8")
            return "text", "text/plain"
        except UnicodeDecodeError:
            pass
    try:
        head.decode("utf-8")
        return "text", "text/plain"
    except UnicodeDecodeError as exc:
        raise RejectedUpload(f"{filename}: unrecognised file type. Use audio, video, image or text.") from exc


def store(data: bytes, filename: str) -> StoredFile:
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise RejectedUpload(f"{filename}: larger than {settings.max_upload_mb} MB.")
    if not data:
        raise RejectedUpload(f"{filename}: the file is empty.")
    kind, mime = sniff(data[:64], filename)
    digest = hashlib.sha256(data).hexdigest()
    suffix = Path(filename).suffix.lower()[:8] or ".bin"
    key = f"{digest[:2]}/{digest}{suffix}"
    path = settings.storage_dir / key
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(data)
    return StoredFile(kind=kind, mime=mime, sha256=digest, size=len(data), key=key, path=path)


def path_for(key: str) -> Path:
    p = (settings.storage_dir / key).resolve()
    if settings.storage_dir.resolve() not in p.parents:
        raise RejectedUpload("Invalid storage key.")
    return p
