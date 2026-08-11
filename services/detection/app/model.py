import io
import os
from pathlib import Path
from PIL import Image

MODEL_PATH = Path(os.getenv("TRANPOX_MODEL", Path(__file__).resolve().parents[1] / "models" / "pothole.pt"))
VEHICLE_MODEL_PATH = Path(os.getenv("TRANPOX_VEHICLE_MODEL", Path(__file__).resolve().parents[1] / "models" / "vehicles.pt"))
CONFIDENCE = float(os.getenv("TRANPOX_CONFIDENCE", "0.45"))

class PotholeDetector:
    motion_threshold = 12.5
    def __init__(self):
        self.model = self._load(MODEL_PATH)
        self.vehicle_model = self._load(VEHICLE_MODEL_PATH)
    def _load(self, path):
        if not path.exists(): return None
        try:
            from ultralytics import YOLO
            return YOLO(str(path))
        except Exception:
            return None
    @property
    def ready(self): return self.model is not None
    def _predict(self, model, image, confidence):
        if model is None: return []
        results = model.predict(image, conf=confidence, verbose=False)
        output = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None: continue
            names = getattr(result, "names", {})
            for box, conf, cls in zip(boxes.xyxy.tolist(), boxes.conf.tolist(), boxes.cls.tolist()):
                x1, y1, x2, y2 = box
                w, h = image.size
                output.append({
                    "confidence": float(conf),
                    "class_name": str(names.get(int(cls), int(cls))),
                    "box": [x1 / w, y1 / h, (x2-x1) / w, (y2-y1) / h]
                })
        return output
    def predict(self, image_bytes: bytes):
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        potholes = self._predict(self.model, image, CONFIDENCE)
        vehicles = self._predict(self.vehicle_model, image, 0.40)
        return potholes, vehicles

detector = PotholeDetector()
