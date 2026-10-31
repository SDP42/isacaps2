"""CERT-In style incident report (PDF) with evidence hashes and the audit-chain head."""
from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor("#0b1020")
CYAN = colors.HexColor("#0891b2")
BAND = {"HIGH": colors.HexColor("#e11d48"), "MEDIUM": colors.HexColor("#d97706"), "LOW": colors.HexColor("#059669"),
        "INCONCLUSIVE": colors.HexColor("#64748b")}


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build(case: dict, audit_head: str = "") -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=16 * mm, title=f"MIRAGE incident report {case['id']}")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=18, textColor=INK, alignment=0)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, textColor=CYAN,
                        spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13, textColor=INK)
    small = ParagraphStyle("s", parent=body, fontSize=7.6, leading=10, textColor=colors.HexColor("#475569"))
    v = case["verdict"]
    story = [
        Paragraph("TLP:AMBER &nbsp;·&nbsp; MIRAGE INCIDENT REPORT", small),
        Paragraph(f"{case['id']} — {_esc(case['title'])}", h1),
        Paragraph(f"Generated {datetime.now(timezone.utc):%d %b %Y %H:%M UTC} · Model {v['model_version']} · "
                  f"Policy {v['policy_version']}", small),
        Spacer(1, 6),
    ]
    band_tbl = Table([[Paragraph(f"<b>{v['band']}</b>", ParagraphStyle("x", parent=body, textColor=colors.white,
                                                                          fontSize=13)),
                       Paragraph(f"<b>{v['risk']:.0f}/100</b> &nbsp; interval {v['interval'][0]:.0f}–{v['interval'][1]:.0f}"
                                 f"<br/>{_esc(v['summary'])}", body)]], colWidths=[34 * mm, 140 * mm])
    band_tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), BAND.get(v["band"], INK)),
                                  ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOX", (0, 0), (-1, -1), 0.5, INK),
                                  ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story += [band_tbl, Paragraph("1. Incident overview", h2)]
    ov = [["Claimed sender", case["claimed_sender"] or "—"], ["Channel", case["channel"]],
          ["Sender contact", case.get("sender_contact") or "—"], ["Received", (case.get("received_at") or "")[:19]],
          ["Requested action", (v["requested_action"] or "none").replace("_", " ")],
          ["Policy rule", (v["rule_fired"] or "—").replace("_", " ")]]
    story.append(_kv(ov, body))
    story.append(Paragraph("2. Reasons", h2))
    for r in v["reasons"]:
        cite = " ".join(f"[{i}]" for i in r.get("evidence_ids", []))
        story.append(Paragraph(f"• {_esc(r['text'])} {cite}", body))
    story.append(Paragraph("3. Witness findings", h2))
    rows = [["Witness", "Score", "Conf.", "Summary"]]
    for f in case["findings"]:
        rows.append([f["witness"], "—" if f["score"] is None else f"{f['score']:.2f}", f"{f['confidence']:.2f}",
                     Paragraph(_esc(f["summary"]), small)])
    story.append(_grid(rows, [26 * mm, 16 * mm, 14 * mm, 118 * mm]))
    story.append(Paragraph("4. Evidence", h2))
    rows = [["ID", "Witness", "Indicator", "Detail"]]
    for e in case["evidence"][:30]:
        rows.append([e["id"], e["witness"], e["label"] + (" (mitigating)" if e.get("exculpatory") else ""),
                     Paragraph(_esc(e.get("detail", "")), small)])
    story.append(_grid(rows, [12 * mm, 22 * mm, 40 * mm, 100 * mm]))
    story.append(Paragraph("5. Tribunal record", h2))
    for m in case["tribunal"]:
        story.append(Paragraph(f"<b>{m['agent'].title()}</b> ({m['stance']}): {_esc(m['content'])}", body))
    story.append(Paragraph("6. Recommended response", h2))
    for s in v["verification_plan"]:
        story.append(Paragraph(f"{'☑' if s.get('done') else '☐'} <b>{_esc(s['title'])}</b> — {_esc(s['why'])}", body))
    story.append(Paragraph("7. Chain of custody", h2))
    rows = [["Artifact", "Type", "Bytes", "SHA-256"]]
    for a in case["artifacts"]:
        rows.append([Paragraph(_esc(a["filename"]), small), a["kind"], f"{a['size_bytes']:,}", Paragraph(a["sha256"], small)])
    story.append(_grid(rows, [44 * mm, 16 * mm, 18 * mm, 96 * mm]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"Audit chain head: {audit_head}", small))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Limitations: detector scores are evidence, not proof. Verification through an independent, "
                           "pre-trusted channel is the control. Report cyber fraud to 1930 or cybercrime.gov.in and "
                           "incidents to CERT-In (incident@cert-in.org.in).", small))
    doc.build(story)
    return buf.getvalue()


def _kv(rows, style):
    t = Table([[Paragraph(f"<b>{k}</b>", style), Paragraph(_esc(str(v)), style)] for k, v in rows],
              colWidths=[40 * mm, 134 * mm])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


def _grid(rows, widths):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 7.8),
                           ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t
