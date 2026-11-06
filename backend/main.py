from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models

# Create all database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Prompt Engineering Evaluation API",
    description="Automated prompt engineering benchmarking platform",
    version="1.0.0"
)

# CORS — allows Next.js frontend to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ─────────────────────────────────────────────────────────────────────
from routes import sessions, generate, evaluate, export

app.include_router(sessions.router)
app.include_router(generate.router)
app.include_router(evaluate.router)
app.include_router(export.router)


@app.get("/")
def root():
    return {"message": "Prompt Evaluation API is running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)