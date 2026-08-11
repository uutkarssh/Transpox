from uuid import uuid4

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .model import detector

app = FastAPI(title="Transpox Detection API", version="0.3.1")

# No cookies/authentication are used by this API, so credentials stay disabled.
# This keeps browser requests from the Vercel frontend CORS-compatible.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "ok": True,
        "model_loaded": detector.ready,
        "inference_backend": detector.backend,
        "vehicle_model_loaded": detector.vehicle_model is not None,
    }


@app.post("/detect")
async def detect(
    image: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    timestamp: int = Form(...),
    motion: float = Form(0),
    confidence: float | None = Form(None),
):
    data = await image.read()
    potholes, vehicles = detector.predict(data, confidence=confidence)

    detections = []
    for item in potholes:
        detections.append(
            {
                "id": str(uuid4()),
                "lat": lat,
                "lng": lng,
                "timestamp": timestamp,
                "confidence": item["confidence"],
                # Motion is supporting context only; vision remains the
                # source of the pothole classification.
                "source": "vision",
                "box": item["box"],
                "className": item["class_name"],
            }
        )

    vehicle_events = []
    for item in vehicles:
        vehicle_events.append(
            {
                "id": str(uuid4()),
                "lat": lat,
                "lng": lng,
                "timestamp": timestamp,
                "confidence": item["confidence"],
                "source": "vision",
                "box": item["box"],
                "className": item["class_name"],
            }
        )

    return {
        "detections": detections,
        "vehicles": vehicle_events,
        "count": len(detections),
        "inference_backend": detector.backend,
    }
