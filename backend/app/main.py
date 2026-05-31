from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import tables, upload, ml, predictions

app = FastAPI(
    title="PROXY MODEL WEB APP",
    description="PROXY MODEL WEB APP",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tables.router)
app.include_router(upload.router)
app.include_router(ml.router)
app.include_router(predictions.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
