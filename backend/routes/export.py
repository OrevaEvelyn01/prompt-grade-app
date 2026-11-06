import csv
import io
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from models import ExperimentSession, GeneratedOutput, EvaluationScore

router = APIRouter()

TECHNIQUE_LABELS = {
    "zero_shot": "Zero-shot",
    "few_shot": "Few-shot",
    "zero_shot_cot": "Zero-shot CoT",
    "few_shot_cot": "Few-shot CoT",
    "self_consistency": "Self-Consistency",
    "tree_of_thought": "Tree-of-Thought",
    "step_back": "Step-back Prompting",
    "react": "ReAct",
}

DOMAIN_LABELS = {
    "math": "Math",
    "logic": "Logic",
    "coding": "Coding",
    "conceptual": "Conceptual",
}


def get_session_data(session_id: int, db: Session):
    session = db.query(ExperimentSession).filter(
        ExperimentSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    outputs = db.query(GeneratedOutput).filter(
        GeneratedOutput.session_id == session_id
    ).all()

    return session, outputs


# ── CSV Export ─────────────────────────────────────────────────────────────────

@router.get("/export/csv/{session_id}")
def export_csv(session_id: int, db: Session = Depends(get_db)):
    session, outputs = get_session_data(session_id, db)
    technique_prompts = json.loads(session.technique_prompts or "{}") if session.technique_prompts else {}
    base_question = technique_prompts.get("zero_shot") or session.task_question or ""

    output_stream = io.StringIO()
    writer = csv.writer(output_stream)

    # Metadata header
    writer.writerow(["PROMPT ENGINEERING EVALUATION REPORT"])
    writer.writerow(["Session Name", session.session_name])
    writer.writerow(["Base Question", base_question])
    writer.writerow(["Techniques", session.techniques.replace(",", " | ")])
    writer.writerow(["Domains", session.domains.replace(",", " | ")])
    writer.writerow(["Runs Per Prompt", session.runs])
    writer.writerow(["Timestamp", session.timestamp])
    writer.writerow([])

    # Column headers
    writer.writerow([
        "Technique",
        "Domain",
        "Run",
        "Modified",
        "Accuracy",
        "Relevance",
        "Coherence",
        "Consistency",
        "Average Score",
        "Justification",
        "Prompt",
        "Response",
    ])

    # Data rows
    for o in outputs:
        scores = o.scores
        if scores:
            avg = round(
                (scores.accuracy + scores.relevance + scores.coherence + scores.consistency) / 4,
                2,
            )
            writer.writerow([
                TECHNIQUE_LABELS.get(o.technique, o.technique),
                DOMAIN_LABELS.get(o.domain, o.domain),
                o.run_number,
                "With Modifier" if o.is_modified == "yes" else "Without Modifier",
                scores.accuracy,
                scores.relevance,
                scores.coherence,
                scores.consistency,
                avg,
                scores.justification,
                o.prompt,
                o.response,
            ])
        else:
            writer.writerow([
                TECHNIQUE_LABELS.get(o.technique, o.technique),
                DOMAIN_LABELS.get(o.domain, o.domain),
                o.run_number,
                "With Modifier" if o.is_modified == "yes" else "Without Modifier",
                "Not graded",
                "Not graded",
                "Not graded",
                "Not graded",
                "Not graded",
                "",
                o.prompt,
                o.response,
            ])

    graded_outputs = [o for o in outputs if o.scores]
    technique_groups = {}
    domain_groups = {}

    for o in graded_outputs:
        technique_key = (o.technique, o.is_modified)
        technique_groups.setdefault(technique_key, []).append(o.scores)
        domain_groups.setdefault(o.domain, []).append(o.scores)

    if technique_groups:
        writer.writerow([])
        writer.writerow(["Technique Summary"])
        writer.writerow(["Technique", "Modified", "Accuracy", "Relevance", "Coherence", "Consistency", "Overall"])
        best_technique = None
        best_tech_score = -1
        best_technique_with_mod = None
        best_technique_with_mod_score = -1
        best_technique_without_mod = None
        best_technique_without_mod_score = -1
        for (technique, is_modified), scores_list in technique_groups.items():
            acc = round(sum(s.accuracy for s in scores_list) / len(scores_list), 2)
            rel = round(sum(s.relevance for s in scores_list) / len(scores_list), 2)
            coh = round(sum(s.coherence for s in scores_list) / len(scores_list), 2)
            con = round(sum(s.consistency for s in scores_list) / len(scores_list), 2)
            overall = round((acc + rel + coh + con) / 4, 2)
            writer.writerow([
                TECHNIQUE_LABELS.get(technique, technique),
                "Yes" if is_modified == "yes" else "No",
                acc,
                rel,
                coh,
                con,
                overall,
            ])
            if overall > best_tech_score:
                best_tech_score = overall
                best_technique = (TECHNIQUE_LABELS.get(technique, technique), "Yes" if is_modified == "yes" else "No", overall)
            if is_modified == "yes" and overall > best_technique_with_mod_score:
                best_technique_with_mod_score = overall
                best_technique_with_mod = (TECHNIQUE_LABELS.get(technique, technique), overall)
            if is_modified != "yes" and overall > best_technique_without_mod_score:
                best_technique_without_mod_score = overall
                best_technique_without_mod = (TECHNIQUE_LABELS.get(technique, technique), overall)
        if best_technique:
            writer.writerow([])
            writer.writerow(["Best technique", best_technique[0], best_technique[1], best_technique[2]])
        if best_technique_with_mod:
            writer.writerow(["Best technique with modifier", best_technique_with_mod[0], best_technique_with_mod[1]])
        if best_technique_without_mod:
            writer.writerow(["Best technique without modifier", best_technique_without_mod[0], best_technique_without_mod[1]])

    if domain_groups:
        writer.writerow([])
        writer.writerow(["Domain Summary"])
        writer.writerow(["Domain", "Accuracy", "Relevance", "Coherence", "Consistency", "Overall"])
        best_domain = None
        best_domain_score = -1
        for domain, scores_list in domain_groups.items():
            acc = round(sum(s.accuracy for s in scores_list) / len(scores_list), 2)
            rel = round(sum(s.relevance for s in scores_list) / len(scores_list), 2)
            coh = round(sum(s.coherence for s in scores_list) / len(scores_list), 2)
            con = round(sum(s.consistency for s in scores_list) / len(scores_list), 2)
            overall = round((acc + rel + coh + con) / 4, 2)
            writer.writerow([
                DOMAIN_LABELS.get(domain, domain),
                acc,
                rel,
                coh,
                con,
                overall,
            ])
            if overall > best_domain_score:
                best_domain_score = overall
                best_domain = (DOMAIN_LABELS.get(domain, domain), overall)
        if best_domain:
            writer.writerow([])
            writer.writerow(["Best domain", best_domain[0], best_domain[1]])

    output_stream.seek(0)

    return StreamingResponse(
        iter([output_stream.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=session_{session_id}_report.csv"
        },
    )


# ── PDF Export ─────────────────────────────────────────────────────────────────

@router.get("/export/pdf/{session_id}")
def export_pdf(session_id: int, db: Session = Depends(get_db)):
    session, outputs = get_session_data(session_id, db)

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.enums import TA_LEFT, TA_CENTER
        from reportlab.graphics.shapes import Drawing, String
        from reportlab.graphics.charts.barcharts import VerticalBarChart
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="ReportLab not installed. Run: pip install reportlab"
        )

    def make_bar_chart(title, labels, values, width=16*cm, height=8*cm):
        drawing = Drawing(width, height + 20)
        chart = VerticalBarChart()
        chart.x = 50
        chart.y = 20
        chart.height = height
        chart.width = width - 80
        chart.data = [values]
        chart.strokeColor = colors.HexColor("#1a2a42")
        chart.valueAxis.valueMin = 0
        chart.valueAxis.valueMax = max(max(values, default=0), 10)
        chart.valueAxis.valueStep = max(1, int(max(values, default=0) / 5))
        chart.valueAxis.strokeColor = colors.HexColor("#0f172a")
        chart.categoryAxis.categoryNames = labels
        chart.categoryAxis.labels.boxAnchor = 'ne'
        chart.categoryAxis.labels.angle = 45
        chart.categoryAxis.labels.dy = -2
        chart.bars[0].fillColor = colors.HexColor("#00d4ff")

        drawing.add(chart)
        drawing.add(String(width / 2, height + 10, title, fontSize=10, fillColor=colors.HexColor("#00d4ff"), textAnchor='middle'))
        return drawing

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    story = []

    # Title style
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=colors.HexColor("#00d4ff"),
        spaceAfter=12,
        alignment=TA_CENTER,
    )
    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontSize=13,
        textColor=colors.HexColor("#00d4ff"),
        spaceAfter=8,
        spaceBefore=16,
    )
    normal_style = ParagraphStyle(
        "Normal",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#333333"),
        spaceAfter=4,
    )

    # Title
    technique_prompts = json.loads(session.technique_prompts or "{}") if session.technique_prompts else {}
    base_question = technique_prompts.get("zero_shot") or session.task_question or ""

    story.append(Paragraph("Prompt Engineering Evaluation Report", title_style))
    story.append(Spacer(1, 0.3*cm))

    # Metadata table
    meta_data = [
        ["Session Name", session.session_name],
        ["Base Question", base_question],
        ["Techniques", session.techniques.replace(",", " | ")],
        ["Domains", session.domains.replace(",", " | ")],
        ["Runs Per Prompt", str(session.runs)],
        ["Timestamp", str(session.timestamp)],
    ]
    meta_table = Table(meta_data, colWidths=[4*cm, 13*cm])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f0f8ff")),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0099bb")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.5*cm))

    graded_outputs = [o for o in outputs if o.scores]

    # Charts
    technique_groups = {}
    domain_groups = {}
    for o in graded_outputs:
        technique_groups.setdefault((o.technique, o.is_modified), []).append(o.scores)
        domain_groups.setdefault(o.domain, []).append(o.scores)

    technique_labels = [
        f"{TECHNIQUE_LABELS.get(k[0], k[0])} {'(With Modifier)' if k[1] == 'yes' else '(Without Modifier)'}"
        for k in technique_groups.keys()
    ]
    technique_values = [
        round(sum(getattr(s, 'accuracy') + getattr(s, 'relevance') + getattr(s, 'coherence') + getattr(s, 'consistency') for s in group) / (4 * len(group)), 2)
        for group in technique_groups.values()
    ]
    domain_labels = [DOMAIN_LABELS.get(k, k) for k in domain_groups.keys()]
    domain_values = [
        round(sum(getattr(s, 'accuracy') + getattr(s, 'relevance') + getattr(s, 'coherence') + getattr(s, 'consistency') for s in group) / (4 * len(group)), 2)
        for group in domain_groups.values()
    ]

    if technique_labels:
        story.append(Paragraph("Average Scores by Technique", heading_style))
        story.append(make_bar_chart("Technique Scores (With/Without Modifier)", technique_labels, technique_values))
        story.append(Spacer(1, 0.5*cm))

    if domain_labels:
        story.append(Paragraph("Average Scores by Domain", heading_style))
        story.append(make_bar_chart("Domain Scores", domain_labels, domain_values))
        story.append(Spacer(1, 0.5*cm))

    if technique_values:
        best_tech = max(zip(technique_labels, technique_values), key=lambda x: x[1])
        story.append(Paragraph(
            f"Best technique: {best_tech[0]} ({best_tech[1]}/10 average)",
            normal_style
        ))
        modified_techs = [(label, value) for label, value in zip(technique_labels, technique_values) if '(With Modifier)' in label]
        unmodified_techs = [(label, value) for label, value in zip(technique_labels, technique_values) if '(Without Modifier)' in label]
        if modified_techs:
            best_mod = max(modified_techs, key=lambda x: x[1])
            story.append(Paragraph(
                f"Best technique with modifier: {best_mod[0]} ({best_mod[1]}/10 average)",
                normal_style
            ))
        if unmodified_techs:
            best_no_mod = max(unmodified_techs, key=lambda x: x[1])
            story.append(Paragraph(
                f"Best technique without modifier: {best_no_mod[0]} ({best_no_mod[1]}/10 average)",
                normal_style
            ))
    if domain_values:
        best_domain = max(zip(domain_labels, domain_values), key=lambda x: x[1])
        story.append(Paragraph(
            f"Best domain: {best_domain[0]} ({best_domain[1]}/10 average)",
            normal_style
        ))
    if technique_values or domain_values:
        story.append(Spacer(1, 0.5*cm))

    # Results table
    story.append(Paragraph("Evaluation Results", heading_style))

    table_data = [[
        "Technique", "Domain", "Run", "Modified",
        "Acc", "Rel", "Coh", "Con", "Avg"
    ]]

    graded_outputs = [o for o in outputs if o.scores]

    for o in graded_outputs:
        scores = o.scores
        avg = round(
            (scores.accuracy + scores.relevance + scores.coherence + scores.consistency) / 4,
            1,
        )
        table_data.append([
            TECHNIQUE_LABELS.get(o.technique, o.technique),
            DOMAIN_LABELS.get(o.domain, o.domain),
            str(o.run_number),
            "✓" if o.is_modified == "yes" else "✗",
            str(scores.accuracy),
            str(scores.relevance),
            str(scores.coherence),
            str(scores.consistency),
            str(avg),
        ])

    if len(table_data) > 1:
        results_table = Table(
            table_data,
            colWidths=[3.5*cm, 2.5*cm, 1*cm, 2*cm, 1.2*cm, 1.2*cm, 1.2*cm, 1.2*cm, 1.2*cm]
        )
        results_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#00d4ff")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("PADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9f9f9")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(results_table)
    else:
        story.append(Paragraph("No graded outputs found.", normal_style))

    # Summary averages per technique
    story.append(Paragraph("Summary — Average Scores Per Technique", heading_style))

    technique_groups = {}
    for o in graded_outputs:
        key = (o.technique, o.is_modified)
        if key not in technique_groups:
            technique_groups[key] = []
        technique_groups[key].append(o.scores)

    summary_data = [["Technique", "Modified", "Accuracy", "Relevance", "Coherence", "Consistency", "Overall"]]
    for (technique, is_modified), score_list in technique_groups.items():
        def avg_metric(metric):
            return round(sum(getattr(s, metric) for s in score_list) / len(score_list), 2)
        acc = avg_metric("accuracy")
        rel = avg_metric("relevance")
        coh = avg_metric("coherence")
        con = avg_metric("consistency")
        overall = round((acc + rel + coh + con) / 4, 2)
        summary_data.append([
            TECHNIQUE_LABELS.get(technique, technique),
            "Yes" if is_modified == "yes" else "No",
            str(acc), str(rel), str(coh), str(con), str(overall),
        ])

    if len(summary_data) > 1:
        summary_table = Table(
            summary_data,
            colWidths=[3.5*cm, 2*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2*cm]
        )
        summary_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#00d4ff")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("PADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9f9f9")]),
        ]))
        story.append(summary_table)

        if technique_labels and domain_labels:
            story.append(Spacer(1, 0.5*cm))
            best_tech = max(zip(technique_labels, technique_values), key=lambda x: x[1])
            best_domain = max(zip(domain_labels, domain_values), key=lambda x: x[1])
            footer_data = [
                ["Top technique", best_tech[0], f"{best_tech[1]}/10"],
                ["Top domain", best_domain[0], f"{best_domain[1]}/10"],
            ]
            footer_table = Table(footer_data, colWidths=[4*cm, 6*cm, 3*cm])
            footer_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fbff")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(Spacer(1, 0.5*cm))
            story.append(Paragraph("Top summary", heading_style))
            story.append(footer_table)

    doc.build(story)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=session_{session_id}_report.pdf"
        },
    ) 