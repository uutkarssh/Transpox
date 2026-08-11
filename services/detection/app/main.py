from uuid import uuid4
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from .model import detector

app = FastAPI(title="Transpox Detection API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"ok": True, "model_loaded": detector.ready, "vehicle_model_loaded": detector.vehicle_model is not None}

@app.post("/detect")
async def detect(image: UploadFile = File(...), lat: float = Form(...), lng: float = Form(...), timestamp: int = Form(...), motion: float = Form(0)):
    data = await image.read()
    potholes, vehicles = detector.predict(data)
    detections = []
    for item in potholes:
        detections.append({"id": str(uuid4()), "lat": lat, "lng": lng, "timestamp": timestamp, "confidence": item["confidence"], "source": "fused" if motion >= detector.motion_threshold else "vision", "box": item["box"], "className": item["class_name"]})
    vehicle_events = []
    for item in vehicles:
        vehicle_events.append({"id": str(uuid4()), "lat": lat, "lng": lng, "timestamp": timestamp, "confidence": item["confidence"], "source": "vision", "box": item["box"], "className": item["class_name"]})
    return {"detections": detections, "vehicles": vehicle_events, "count": len(detections)}
