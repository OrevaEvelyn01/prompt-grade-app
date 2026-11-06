import json
import os
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db
from models import ExperimentSession, GeneratedOutput
from dotenv import load_dotenv
from gemini_client import generate_with_rotation
import time

load_dotenv()

router = APIRouter()


def build_modifier_prefix(modifier_texts: dict, selected_modifiers: list) -> str:
    parts = []
    for mod_id in selected_modifiers:
        text = modifier_texts.get(mod_id, "").strip()
        if text:
            parts.append(text)
    return " ".join(parts)


def _is_error_response(response: str) -> bool:
    if not response:
        return True

    normalized = response.strip().lower()
    return (
        normalized.startswith("generation error:")
        or "rate_limit" in normalized
        or "resource_exhausted" in normalized
        or "quota" in normalized
        or "quota_exceeded" in normalized
    )


def _build_expected_prompts(
    techniques: list,
    domains: list,
    modifiers: list,
    modifier_texts: dict,
    technique_prompts: dict,
    runs: int,
) -> list:
    expected = []

    for technique in techniques:
        base_prompt = technique_prompts.get(technique, "").strip()
        if not base_prompt:
            continue

        for domain in domains:
            for run_number in range(1, runs + 1):
                expected.append((technique, domain, run_number, "no", base_prompt))

    if modifiers and any(modifier_texts.get(m, "").strip() for m in modifiers):
        modifier_prefix = build_modifier_prefix(modifier_texts, modifiers)

        for technique in techniques:
            base_prompt = technique_prompts.get(technique, "").strip()
            if not base_prompt:
                continue

            for domain in domains:
                prompt = f"{modifier_prefix}\n\n{base_prompt}"
                for run_number in range(1, runs + 1):
                    expected.append((technique, domain, run_number, "yes", prompt))

    return expected


def _generate_responses_task(session_id: int):
    from database import SessionLocal
    db = SessionLocal()
    try:
        session = db.query(ExperimentSession).filter(
            ExperimentSession.id == session_id
        ).first()

        if not session:
            return

        techniques = session.techniques.split(",")
        domains = session.domains.split(",")
        modifiers = session.modifiers.split(",") if session.modifiers else []
        modifier_texts = json.loads(session.modifier_texts) if session.modifier_texts else {}
        technique_prompts = json.loads(session.technique_prompts) if session.technique_prompts else {}
        runs = session.runs

        existing_outputs = db.query(GeneratedOutput).filter(
            GeneratedOutput.session_id == session_id
        ).all()

        # FIX: normalize None -> "no" so key lookups never miss due to NULL in DB
        existing_map = {
            (o.technique, o.domain, o.run_number, o.is_modified or "no"): o
            for o in existing_outputs
        }

        expected_prompts = _build_expected_prompts(
            techniques,
            domains,
            modifiers,
            modifier_texts,
            technique_prompts,
            runs,
        )

        total = len(expected_prompts)
        completed = 0
        skipped = 0
        print(f"[Generation] Session {session_id}: {total} outputs to generate", flush=True)

        for technique, domain, run_number, is_modified, prompt in expected_prompts:
            key = (technique, domain, run_number, is_modified)
            existing = existing_map.get(key)

            if existing and existing.response and not _is_error_response(existing.response):
                skipped += 1
                print(f"[Generation] Skipping {technique}/{domain}/run{run_number}/modified={is_modified} (already done)", flush=True)
                continue

            print(f"[Generation] Generating {technique}/{domain}/run{run_number}/modified={is_modified} ...", flush=True)
            try:
                time.sleep(0.5)
                response_text = generate_with_rotation(prompt)
                completed += 1
                print(f"[Generation] ✓ Done {completed}/{total - skipped} — {technique}/{domain}/run{run_number}", flush=True)
            except Exception as e:
                response_text = f"Generation error: {str(e)}"
                print(f"[Generation] ✗ Error {technique}/{domain}/run{run_number}: {str(e)}", flush=True)

            if existing:
                existing.prompt = prompt
                existing.response = response_text
            else:
                output = GeneratedOutput(
                    session_id=session_id,
                    technique=technique,
                    domain=domain,
                    run_number=run_number,
                    is_modified=is_modified,
                    prompt=prompt,
                    response=response_text,
                )
                db.add(output)

            db.commit()

        print(f"[Generation] Session {session_id} complete: {completed} generated, {skipped} skipped", flush=True)
    finally:
        db.close()


@router.post("/generate-responses")
def generate_responses(payload: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    session_id = payload.get("session_id")
    session = db.query(ExperimentSession).filter(
        ExperimentSession.id == session_id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    background_tasks.add_task(_generate_responses_task, session_id)

    return {
        "message": "Generation started in background",
        "session_id": session_id
    }


@router.post("/regenerate-output")
def regenerate_output(payload: dict, db: Session = Depends(get_db)):
    output_id = payload.get("output_id")
    if not output_id:
        raise HTTPException(status_code=400, detail="output_id is required")

    output = db.query(GeneratedOutput).filter(GeneratedOutput.id == output_id).first()
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")

    prompt = output.prompt
    if not prompt:
        raise HTTPException(status_code=400, detail="Output prompt is missing")

    try:
        time.sleep(0.5)
        response_text = generate_with_rotation(prompt)
    except Exception as e:
        response_text = f"Generation error: {str(e)}"

    if output.scores:
        db.delete(output.scores)

    output.response = response_text
    db.commit()

    return {
        "message": "Output regeneration completed",
        "output_id": output_id,
    }