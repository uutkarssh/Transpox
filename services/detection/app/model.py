import io
import json
import os
import tempfile
from pathlib import Path

from PIL import Image

MODEL_PATH = Path(os.getenv("TRANPOX_MODEL", Path(__file__).resolve().parents[1] / "models" / "pothole.pt"))
VEHICLE_MODEL_PATH = Path(os.getenv("TRANPOX_VEHICLE_MODEL", Path(__file__).resolve().parents[1] / "models" / "vehicles.pt"))
CONFIDENCE = float(os.getenv("TRANPOX_CONFIDENCE", "0.25"))
HF_SPACE = os.getenv("HF_SPACE", "Utkarssh/transpox-api")
HF_TOKEN = os.getenv("HF_TOKEN")


class PotholeDetector:
    motion_threshold = 12.5

    def __init__(self):
        self.model = self._load_local(MODEL_PATH)
        self.vehicle_model = self._load_local(VEHICLE_MODEL_PATH)
        self.hf_client = self._load_hf_client()

    def _load_local(self, path):
        if not path.exists():
            return None
        try:
            from ultralytics import YOLO
            return YOLO(str(path))
        except Exception:
            return None

    def _load_hf_client(self):
        try:
            from gradio_client import Client
            kwargs = {"hf_token": HF_TOKEN} if HF_TOKEN else {}
            return Client(HF_SPACE, **kwargs)
        except Exception:
            return None

    @property
    def ready(self):
        return self.hf_client is not None or self.model is not None

    @property
    def backend(self):
        if self.hf_client is not None:
            return "huggingface"
        if self.model is not None:
            return "local"
        return "unavailable"

    def _predict_local(self, model, image, confidence):
        if model is None:
            return []
        results = model.predict(image, conf=confidence, verbose=False)
        output = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            names = getattr(result, "names", {})
            w, h = image.size
            for box, conf, cls in zip(boxes.xyxy.tolist(), boxes.conf.tolist(), boxes.cls.tolist()):
                x1, y1, x2, y2 = box
                output.append({
                    "confidence": float(conf),
                    "class_name": str(names.get(int(cls), int(cls))),
                    "box": [x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h],
                })
        return output

    def _predict_huggingface(self, image_bytes, image, confidence):
        if self.hf_client is None:
            return []

        from gradio_client import handle_file

        with tempfile.NamedTemporaryFile(suffix=".jpg") as tmp:
            tmp.write(image_bytes)
            tmp.flush()
            result = self.hf_client.predict(
                image=handle_file(tmp.name),
                confidence=float(confidence),
                api_name="/detect_potholes",
            )

        if not isinstance(result, (list, tuple)) or len(result) < 2:
            return []

        raw_json = result[1]
        payload = raw_json if isinstance(raw_json, dict) else json.loads(str(raw_json))
        detections = payload.get("detections", [])
        w, h = image.size
        output = []
        for item in detections:
            box = item.get("box_xyxy") or item.get("bbox") or item.get("box")
            if not box or len(box) != 4:
                continue
            x1, y1, x2, y2 = [float(v) for v in box]
            output.append({
                "confidence": float(item.get("confidence", 0.0)),
                "class_name": str(item.get("class", "D40")),
                "box": [x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h],
            })
        return output

    def predict(self, image_bytes: bytes, confidence: float | None = None):
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        threshold = CONFIDENCE if confidence is None else max(0.05, min(float(confidence), 0.90))

        hf_failed = False
        try:
            potholes = self._predict_huggingface(image_bytes, image, threshold)
        except Exception:
            potholes = []
            hf_failed = True

        # Only fall back to the local model when the HF request actually fails.
        # A successful HF response with zero detections should remain zero.
        if hf_failed and self.model is not None:
            potholes = self._predict_local(self.model, image, threshold)

        vehicles = self._predict_local(self.vehicle_model, image, 0.40)
        return potholes, vehicles


detector = PotholeDetector()
