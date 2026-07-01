from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="DVD Rental Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from routes.home import router as home_router
from routes.analysis import router as analysis_router
from routes.inventory import router as inventory_router
from routes.prediction import router as prediction_router
from routes.recommend import router as recommend_router
from routes.insight import router as insight_router

app.include_router(home_router, prefix="/api")
app.include_router(analysis_router, prefix="/api/analysis")
app.include_router(inventory_router, prefix="/api/inventory")
app.include_router(prediction_router, prefix="/api")
app.include_router(recommend_router, prefix="/api/recommend")
app.include_router(insight_router, prefix="/api")

@app.get("/")
def root():
    return {"status": "ok", "message": "DVD Rental Dashboard API is running"}