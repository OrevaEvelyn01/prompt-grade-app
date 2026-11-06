from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class ExperimentSession(Base):
    __tablename__ = "experiment_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_name = Column(String, nullable=False)
    task_question = Column(Text, nullable=True)
    techniques = Column(String, nullable=False)
    domains = Column(String, nullable=False)
    modifiers = Column(String, nullable=True)
    modifier_texts = Column(Text, nullable=True)
    technique_prompts = Column(Text, nullable=True)  # stored as JSON
    runs = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    outputs = relationship("GeneratedOutput", back_populates="session")


class GeneratedOutput(Base):
    __tablename__ = "generated_outputs"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("experiment_sessions.id"))
    technique = Column(String, nullable=False)
    domain = Column(String, nullable=False)
    run_number = Column(Integer, nullable=False)
    is_modified = Column(String, default="no")
    prompt = Column(Text, nullable=False)
    response = Column(Text, nullable=True)

    session = relationship("ExperimentSession", back_populates="outputs")
    scores = relationship("EvaluationScore", back_populates="output", uselist=False)


class EvaluationScore(Base):
    __tablename__ = "evaluation_scores"

    id = Column(Integer, primary_key=True, index=True)
    output_id = Column(Integer, ForeignKey("generated_outputs.id"))
    accuracy = Column(Float, nullable=True)
    relevance = Column(Float, nullable=True)
    coherence = Column(Float, nullable=True)
    consistency = Column(Float, nullable=True)
    justification = Column(Text, nullable=True)

    output = relationship("GeneratedOutput", back_populates="scores")