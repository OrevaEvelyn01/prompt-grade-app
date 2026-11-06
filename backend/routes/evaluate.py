import json
import os
import re
import time
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import GeneratedOutput, EvaluationScore, ExperimentSession
from dotenv import load_dotenv
from gemini_client import generate_with_rotation

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


def compute_bertscore_relevance(question: str, response: str) -> float:
    from bert_score import score as bscore
    _, _, F1 = bscore([response], [question], lang="en",
                      rescale_with_baseline=True, verbose=False)
    raw = max(-1.0, min(1.0, float(F1[0])))
    return round(((raw + 1) / 2) * 9 + 1, 2)


def compute_bertscore_consistency(responses: list) -> float:
    from bert_score import score as bscore
    from itertools import combinations
    pairs = list(combinations(responses, 2))
    if not pairs:
        return 10.0
    refs  = [p[0] for p in pairs]
    cands = [p[1] for p in pairs]
    _, _, F1 = bscore(cands, refs, lang="en",
                      rescale_with_baseline=True, verbose=False)
    avg = max(-1.0, min(1.0, float(F1.mean())))
    return round(((avg + 1) / 2) * 9 + 1, 2)


def build_group_evaluation_prompt(task_question: str, technique: str,
                                   domain: str, outputs: list,
                                   is_modified: str) -> str:
    modifier_label = "WITH modifier" if is_modified == "yes" else "WITHOUT modifier"
    run_texts = "\n\n".join(
        f"--- Run {o.run_number} ---\n{o.response or ''}"
        for o in sorted(outputs, key=lambda x: x.run_number)
    )
    n = len(outputs)

    return f"""You are a strict academic evaluator assessing AI-generated responses.

Prompting Technique: {technique.replace("_", " ")} ({modifier_label})
Domain: {domain}
Task Question: {task_question}

Responses to evaluate:
{run_texts}

MANDATORY EVALUATION PROCESS — DO NOT SKIP

For EACH run, do TWO things in order:

STEP 1 — LIST ERRORS FIRST (before any score):
  Accuracy problems: factual errors, wrong calculations, incorrect conclusions,
  missing required elements, incomplete answers.
  Coherence problems: unclear reasoning, missing steps, contradictions,
  disorganised structure, conclusions that do not follow from the reasoning.
  Write "None" only if there are genuinely zero errors.

STEP 2 — ASSIGN SCORES BASED ON ERRORS FOUND:
  - 0 problems found    → score 10
  - 1 minor problem     → score 8 or 9
  - 2 problems          → score 7
  - 3 or more problems  → score 6 or below
  - Major error (wrong final answer, completely off-topic) → score 5 or below
  If you listed problems in Step 1, the score CANNOT be 10. This is mandatory.
  Runs with more problems must score lower than runs with fewer problems.

Consistency is one score for the whole group:
  - All runs same answer and approach → 10
  - Minor wording differences only → 8 or 9
  - One run differs noticeably → 7
  - Runs give different answers or approaches → 5 or below

RESPOND IN VALID JSON ONLY. No markdown, no preamble, no text outside the JSON.

{{
  "outputs": [
    {{
      "run_number": <int>,
      "problems_found": "<bullet list of every problem found, or None>",
      "accuracy": <int 1-10>,
      "coherence": <int 1-10>,
      "justification": "<1-2 sentences citing specific problems that caused deductions>"
    }}
  ],
  "consistency": <int 1-10>,
  "consistency_justification": "<1-2 sentences explaining how the runs compare>"
}}"""


@router.post("/grade-session")
def grade_session(payload: dict, db: Session = Depends(get_db)):
    session_id = payload.get("session_id")

    session = db.query(ExperimentSession).filter(
        ExperimentSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    outputs = db.query(GeneratedOutput).filter(
        GeneratedOutput.session_id == session_id
    ).all()

    techniques     = session.techniques.split(",")
    domains        = session.domains.split(",")
    modifiers      = session.modifiers.split(",") if session.modifiers else []
    modifier_texts = json.loads(session.modifier_texts) if session.modifier_texts else {}
    runs           = session.runs
    has_modifiers  = bool(modifiers and any(
        modifier_texts.get(m, "").strip() for m in modifiers
    ))
    expected_outputs = (
        len(techniques) * len(domains) * runs * (2 if has_modifiers else 1)
    )

    if len(outputs) < expected_outputs:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Generation still in progress "
                f"({len(outputs)}/{expected_outputs} outputs). "
                f"Wait until all outputs are created before grading."
            ),
        )

    groups: dict = {}
    for output in outputs:
        key = (output.technique, output.domain, output.is_modified)
        groups.setdefault(key, []).append(output)

    graded = []
    errors = []

    for (technique, domain, is_modified), group_outputs in groups.items():

        if all(o.scores for o in group_outputs):
            logger.info(f"Skipping already graded group: {technique} / {domain} / {is_modified}")
            continue

        for o in group_outputs:
            if o.scores:
                db.delete(o.scores)
        db.commit()

        try:
            sorted_outputs = sorted(group_outputs, key=lambda o: o.run_number)
            responses      = [o.response or "" for o in sorted_outputs]

            # LLM call for accuracy + coherence
            logger.info(f"Grading: {technique} / {domain} / {is_modified}")
            time.sleep(3)
            prompt     = build_group_evaluation_prompt(
                session.task_question, technique, domain,
                sorted_outputs, is_modified or "no"
            )
            result_raw = generate_with_rotation(prompt).strip()
            result_raw = re.sub(r"^```[a-z]*\n?", "", result_raw)
            result_raw = re.sub(r"\n?```$", "", result_raw).strip()

            # Gemini sometimes puts raw backslashes in JSON strings
            # (e.g. in math notation like \$ or \n inside text)
            # which causes json.loads to fail. This cleans them up.
            result_raw = re.sub(r'(?<!\\)\\(?!["\\/bfnrtu])', r'\\\\', result_raw)

            parsed           = json.loads(result_raw)
            run_scores       = parsed.get("outputs", [])
            consistency_just = parsed.get("consistency_justification", "")

            # BERTScore for relevance and consistency
            logger.info(f"Computing BERTScore relevance for {technique} / {domain}")
            relevance_scores = [
                compute_bertscore_relevance(session.task_question, r)
                for r in responses
            ]

            logger.info(f"Computing BERTScore consistency for {technique} / {domain}")
            consistency_val = compute_bertscore_consistency(responses)

            logger.info(f"BERTScore done — relevance: {relevance_scores}, consistency: {consistency_val}")

            for i, output in enumerate(sorted_outputs):
                run_data = next(
                    (r for r in run_scores
                     if int(r.get("run_number", -1)) == output.run_number),
                    None,
                )
                if not run_data:
                    logger.warning(f"No score data for run {output.run_number}")
                    continue

                accuracy_val  = max(1.0, min(10.0, float(run_data.get("accuracy",  5.0))))
                coherence_val = max(1.0, min(10.0, float(run_data.get("coherence", 5.0))))

                evaluation = EvaluationScore(
                    output_id     = output.id,
                    accuracy      = accuracy_val,
                    relevance     = relevance_scores[i],
                    coherence     = coherence_val,
                    consistency   = consistency_val,
                    justification = (
                        f"Problems found: {run_data.get('problems_found', 'N/A')} | "
                        f"{run_data.get('justification', '')} | "
                        f"Relevance (BERTScore F1): {relevance_scores[i]}/10 | "
                        f"Consistency (pairwise BERTScore): {consistency_val}/10"
                    ),
                )
                db.add(evaluation)
                graded.append(output.id)
                logger.info(f"Saved scores for output {output.id} — acc:{accuracy_val} rel:{relevance_scores[i]} coh:{coherence_val} con:{consistency_val}")

            db.commit()

        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error for {technique}/{domain}/{is_modified}: {e}")
            logger.error(f"Raw response was: {result_raw[:500]}")
            errors.append({"technique": technique, "domain": domain,
                           "modified": is_modified, "error": f"JSON error: {e}"})
        except Exception as e:
            logger.error(f"Error grading {technique}/{domain}/{is_modified}: {e}")
            errors.append({"technique": technique, "domain": domain,
                           "modified": is_modified, "error": str(e)})
            continue

    return {
        "message":      "Grading complete",
        "total_graded": len(graded),
        "errors":       errors,
    }