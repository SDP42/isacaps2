"""In-process pub/sub that relays pipeline progress and Tribunal testimony to SSE subscribers.

The pipeline runs in a worker thread; subscribers are asyncio queues. Events are also buffered per case so a
client that connects late replays everything it missed. The ``OPS`` channel is the app-wide operations feed
(audit actions, cases starting, verdicts) behind the command centre; it keeps only the most recent events.
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
from collections import defaultdict
from typing import Any

OPS = "__ops__"
OPS_KEEP = 300


class EventBus:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._history: dict[str, list[dict]] = defaultdict(list)
        self._subs: dict[str, list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = defaultdict(list)

    def publish(self, case_id: str, event: str, data: dict[str, Any]) -> None:
        item = {"event": event, "data": data, "ts": time.time()}
        with self._lock:
            self._history[case_id].append(item)
            if case_id == OPS and len(self._history[OPS]) > OPS_KEEP:
                del self._history[OPS][:-OPS_KEEP]
            subs = list(self._subs[case_id])
        for loop, q in subs:
            loop.call_soon_threadsafe(q.put_nowait, item)

    def subscribe(self, case_id: str) -> tuple[asyncio.Queue, list[dict]]:
        q: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        with self._lock:
            self._subs[case_id].append((loop, q))
            backlog = list(self._history[case_id])
        return q, backlog

    def unsubscribe(self, case_id: str, q: asyncio.Queue) -> None:
        with self._lock:
            self._subs[case_id] = [(lp, s) for lp, s in self._subs[case_id] if s is not q]

    def forget_cases(self) -> None:
        """Drop buffered case events (case ids are reused after a demo reset); the ops feed stays."""
        with self._lock:
            for k in [k for k in self._history if k != OPS]:
                del self._history[k]

    def history(self, case_id: str) -> list[dict]:
        with self._lock:
            return list(self._history[case_id])


bus = EventBus()


def ops(kind: str, case_id: str | None = None, actor: str = "system", **data: Any) -> None:
    """Publish one event to the app-wide operations feed."""
    bus.publish(OPS, "ops", {"kind": kind, "case_id": case_id, "actor": actor, **data})


def sse_format(item: dict) -> str:
    return f"event: {item['event']}\ndata: {json.dumps(item['data'], default=str)}\n\n"
