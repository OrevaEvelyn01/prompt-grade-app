from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime


class CreateSessionRequest(BaseModel):
    session_name: str
    techniques: List[str]
    domains: List[str]
    modifiers: Optional[List[str]] = []
    modifier_texts: Optional[Dict[str, str]] = {}
    technique_prompts: Optional[Dict[str, str]] = {}
    task_question: Optional[str] = None
    runs: int


class EvaluationScoreSchema(BaseModel):
    accuracy: Optional[float]
    relevance: Optional[float]
    coherence: Optional[float]
    consistency: Optional[float]
    justification: Optional[str]

    class Config:
        from_attributes = True


class OutputSchema(BaseModel):
    id: int
    session_id: int
    technique: str
    domain: str
    run_number: int
    is_modified: Optional[str]
    prompt: str
    response: Optional[str]
    scores: Optional[EvaluationScoreSchema]

    class Config:
        from_attributes = True


class SessionSchema(BaseModel):
    id: int
    session_name: str
    techniques: str
    domains: str
    modifiers: Optional[str]
    modifier_texts: Optional[str]
    technique_prompts: Optional[str]
    runs: int
    timestamp: datetime
    total_outputs: Optional[int] = 0
    avg_score: Optional[float] = None

    class Config:
        from_attributes = True


class SessionDetailSchema(BaseModel):
    session: SessionSchema
    outputs: List[OutputSchema]