"""ORM tables. Mirrors the schema in docs/ARCHITECTURE.md."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    domain: Mapped[str] = mapped_column(String(120))
    policy_json: Mapped[dict] = mapped_column(JSON, default=dict)


class Persona(Base):
    """Demo login identities. Selecting a persona issues a JWT with its role."""

    __tablename__ = "personas"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # employee | analyst | admin | family
    title: Mapped[str] = mapped_column(String(120))
    blurb: Mapped[str] = mapped_column(Text)
    accent: Mapped[str] = mapped_column(String(20), default="cyan")


class Person(Base):
    __tablename__ = "people"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    circle: Mapped[str] = mapped_column(String(20), default="org")  # org | family | external
    name: Mapped[str] = mapped_column(String(120), index=True)
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    role: Mapped[str] = mapped_column(String(120))
    department: Mapped[str] = mapped_column(String(80), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    reports_to: Mapped[int | None] = mapped_column(ForeignKey("people.id"), nullable=True)
    approval_limit_inr: Mapped[int] = mapped_column(Integer, default=0)
    usual_channels: Mapped[list] = mapped_column(JSON, default=list)
    usual_hours: Mapped[list] = mapped_column(JSON, default=lambda: [9, 19])
    code_word_set: Mapped[bool] = mapped_column(Boolean, default=False)
    voiceprint: Mapped[list | None] = mapped_column(JSON, nullable=True)
    style_profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    impersonation_count: Mapped[int] = mapped_column(Integer, default=0)


class Beneficiary(Base):
    __tablename__ = "beneficiaries"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(160))
    identifier: Mapped[str] = mapped_column(String(160), index=True)  # UPI id / account / IBAN
    kind: Mapped[str] = mapped_column(String(20))  # upi | account | iban
    trust_level: Mapped[str] = mapped_column(String(20), default="trusted")  # trusted | new | flagged
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    linked_person_id: Mapped[int | None] = mapped_column(ForeignKey("people.id"), nullable=True)


class RequestLog(Base):
    """Synthetic 12-month history of internal requests; trains the anomaly model and feeds the dashboard."""

    __tablename__ = "request_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("people.id"))
    channel: Mapped[str] = mapped_column(String(30))
    action: Mapped[str] = mapped_column(String(30))
    amount_inr: Mapped[int] = mapped_column(Integer, default=0)
    hour: Mapped[int] = mapped_column(Integer)
    beneficiary_age_days: Mapped[int] = mapped_column(Integer, default=365)
    is_attack: Mapped[bool] = mapped_column(Boolean, default=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    title: Mapped[str] = mapped_column(String(240))
    submitted_by: Mapped[str] = mapped_column(String(40))
    claimed_person_id: Mapped[int | None] = mapped_column(ForeignKey("people.id"), nullable=True)
    claimed_sender: Mapped[str] = mapped_column(String(160), default="")
    channel: Mapped[str] = mapped_column(String(30), default="unknown")
    sender_contact: Mapped[str] = mapped_column(String(160), default="")
    message_text: Mapped[str] = mapped_column(Text, default="")
    scenario: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|running|complete|failed
    stage: Mapped[str] = mapped_column(String(40), default="intake")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    outcome: Mapped[str | None] = mapped_column(String(30), nullable=True)  # verified_genuine|confirmed_fraud|...

    artifacts: Mapped[list[Artifact]] = relationship(back_populates="case", cascade="all, delete-orphan")
    findings: Mapped[list[Finding]] = relationship(back_populates="case", cascade="all, delete-orphan")
    verdict: Mapped[Verdict | None] = relationship(back_populates="case", uselist=False, cascade="all, delete-orphan")
    messages: Mapped[list[TribunalMessage]] = relationship(
        back_populates="case", cascade="all, delete-orphan", order_by="TribunalMessage.seq"
    )
    verifications: Mapped[list[Verification]] = relationship(back_populates="case", cascade="all, delete-orphan")


class Artifact(Base):
    __tablename__ = "artifacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    kind: Mapped[str] = mapped_column(String(10))  # audio|video|image|text
    filename: Mapped[str] = mapped_column(String(240))
    mime: Mapped[str] = mapped_column(String(80))
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(300))
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    meta_json: Mapped[dict] = mapped_column(JSON, default=dict)
    case: Mapped[Case] = relationship(back_populates="artifacts")


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    witness: Mapped[str] = mapped_column(String(20))  # voice|face|words|identity|provenance
    artifact_id: Mapped[int | None] = mapped_column(ForeignKey("artifacts.id"), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    status: Mapped[str] = mapped_column(String(20), default="ok")  # ok|not_applicable|insufficient|error
    summary: Mapped[str] = mapped_column(Text, default="")
    evidence_json: Mapped[list] = mapped_column(JSON, default=list)
    details_json: Mapped[dict] = mapped_column(JSON, default=dict)
    model_version: Mapped[str] = mapped_column(String(60), default="")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    case: Mapped[Case] = relationship(back_populates="findings")


class Verdict(Base):
    __tablename__ = "verdicts"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), unique=True)
    risk: Mapped[float] = mapped_column(Float)
    band: Mapped[str] = mapped_column(String(20))  # LOW|MEDIUM|HIGH|INCONCLUSIVE
    tags: Mapped[list] = mapped_column(JSON, default=list)
    interval: Mapped[list] = mapped_column(JSON, default=list)
    dims_json: Mapped[dict] = mapped_column(JSON, default=dict)
    contributions_json: Mapped[dict] = mapped_column(JSON, default=dict)
    reasons_json: Mapped[list] = mapped_column(JSON, default=list)
    rule_fired: Mapped[str | None] = mapped_column(String(60), nullable=True)
    requested_action: Mapped[str] = mapped_column(String(30), default="none")
    sensitivity: Mapped[float] = mapped_column(Float, default=0.0)
    summary: Mapped[str] = mapped_column(Text, default="")
    verification_plan: Mapped[list] = mapped_column(JSON, default=list)
    model_version: Mapped[str] = mapped_column(String(60))
    policy_version: Mapped[str] = mapped_column(String(60))
    case: Mapped[Case] = relationship(back_populates="verdict")


class TribunalMessage(Base):
    __tablename__ = "tribunal_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    seq: Mapped[int] = mapped_column(Integer)
    agent: Mapped[str] = mapped_column(String(30))
    stance: Mapped[str] = mapped_column(String(20), default="neutral")  # incriminating|exculpatory|neutral|ruling
    content: Mapped[str] = mapped_column(Text)
    supporting: Mapped[list] = mapped_column(JSON, default=list)
    contradicting: Mapped[list] = mapped_column(JSON, default=list)
    evidence_refs: Mapped[list] = mapped_column(JSON, default=list)
    responds_to: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    case: Mapped[Case] = relationship(back_populates="messages")


class Verification(Base):
    __tablename__ = "verifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    step: Mapped[str] = mapped_column(String(60))
    outcome: Mapped[str] = mapped_column(String(30))  # done|failed|skipped
    note: Mapped[str] = mapped_column(Text, default="")
    actor: Mapped[str] = mapped_column(String(40))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    case: Mapped[Case] = relationship(back_populates="verifications")


class AuditEntry(Base):
    """Hash-chained, append-only log. Each row commits to the previous row's hash."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(60))
    payload_hash: Mapped[str] = mapped_column(String(64))
    prev_hash: Mapped[str] = mapped_column(String(64))
    this_hash: Mapped[str] = mapped_column(String(64))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ResponseRun(Base):
    """The Cure Console's state for one case: which response actions are done, connector references, and the
    "already paid" details that start the golden-hour clock. One row per case, created on first open."""

    __tablename__ = "response_runs"
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), primary_key=True)
    state_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
