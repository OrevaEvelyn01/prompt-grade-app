import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import ExperimentSession, GeneratedOutput, EvaluationScore
from schemas import CreateSessionRequest

router = APIRouter()


@router.post("/create-session")
def create_session(payload: CreateSessionRequest, db: Session = Depends(get_db)):
    technique_prompts = payload.technique_prompts or {}
    task_question = payload.task_question or technique_prompts.get("zero_shot", "")

    session = ExperimentSession(
        session_name=payload.session_name,
        task_question=task_question,
        techniques=",".join(payload.techniques),
        domains=",".join(payload.domains),
        modifiers=",".join(payload.modifiers) if payload.modifiers else "",
        modifier_texts=json.dumps(payload.modifier_texts) if payload.modifier_texts else "{}",
        technique_prompts=json.dumps(technique_prompts) if technique_prompts else "{}",
        runs=payload.runs,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.id}


@router.get("/sessions")
def get_sessions(db: Session = Depends(get_db)):
    sessions = (
        db.query(
            ExperimentSession,
            func.count(GeneratedOutput.id).label("total_outputs"),
            func.avg(
                (
                    EvaluationScore.accuracy
                    + EvaluationScore.relevance
                    + EvaluationScore.coherence
                    + EvaluationScore.consistency
                ) / 4.0
            ).label("avg_score"),
        )
        .outerjoin(GeneratedOutput, GeneratedOutput.session_id == ExperimentSession.id)
        .outerjoin(EvaluationScore, EvaluationScore.output_id == GeneratedOutput.id)
        .group_by(ExperimentSession.id)
        .order_by(ExperimentSession.timestamp.desc())
        .all()
    )

    result = []
    for s, total_outputs, avg_score in sessions:
        result.append({
            "id": s.id,
            "session_name": s.session_name,
            "techniques": s.techniques.split(","),
            "domains": s.domains.split(","),
            "modifiers": s.modifiers.split(",") if s.modifiers else [],
            "runs": s.runs,
            "timestamp": s.timestamp,
            "total_outputs": total_outputs,
            "avg_score": round(avg_score, 2) if avg_score is not None else None,
        })
    return result


@router.get("/session/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(ExperimentSession).filter(ExperimentSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    outputs = db.query(GeneratedOutput).filter(GeneratedOutput.session_id == session_id).all()

    graded = [o for o in outputs if o.scores]
    avg_score = None

    if graded:
        total = sum(
            (o.scores.accuracy + o.scores.relevance + o.scores.coherence + o.scores.consistency) / 4
            for o in graded
        )
        avg_score = round(total / len(graded), 2)

    # ✅ MUST be inside function (same indentation as outputs, not inside if graded)
    expected_outputs = (
        len(session.techniques.split(",")) *
        len(session.domains.split(",")) *
        session.runs *
        (2 if session.modifiers and session.modifiers.strip() else 1)
    )

    return {
        "status": {
            "expected": expected_outputs,
            "current": len(outputs),
            "complete": len(outputs) >= expected_outputs
        },
        "session": {
            "id": session.id,
            "session_name": session.session_name,
            "techniques": session.techniques.split(","),
            "domains": session.domains.split(","),
            "modifiers": session.modifiers.split(",") if session.modifiers else [],
            "modifier_texts": json.loads(session.modifier_texts) if session.modifier_texts else {},
            "technique_prompts": json.loads(session.technique_prompts) if session.technique_prompts else {},
            "runs": session.runs,
            "timestamp": session.timestamp,
            "total_outputs": len(outputs),
            "avg_score": avg_score,
        },
        "outputs": [
            {
                "id": o.id,
                "session_id": o.session_id,
                "technique": o.technique,
                "domain": o.domain,
                "run_number": o.run_number,
                "is_modified": o.is_modified,
                "prompt": o.prompt,
                "response": o.response,
                "scores": {
                    "accuracy": o.scores.accuracy,
                    "relevance": o.scores.relevance,
                    "coherence": o.scores.coherence,
                    "consistency": o.scores.consistency,
                    "justification": o.scores.justification,
                } if o.scores else None,
            }
            for o in outputs
        ],
    }