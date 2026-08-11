# Transpox

Transpox is a road-safety platform that detects potholes during rides and maps them to geographic locations.

## MVP

- Browser-based ride tracking as a Progressive Web App.
- GPS records the route from Start Ride to End Ride.
- Device accelerometer provides motion/bump evidence.
- Camera frames can be sent to a YOLOv12-compatible detection service.
- Detection events are geotagged and deduplicated into pothole events.
- Ride summary shows distance, duration, route and detected potholes.

## Architecture

```text
Phone Browser
   |
   +-- GPS ----------------------+
   +-- Accelerometer ------------+--> Web App --> Detection API --> YOLOv12
   +-- Camera -------------------+                  |
                                                    v
                                             Pothole Events
                                                    |
                                                    v
                                           Ride / Map Database
```

## Project structure

- `apps/web` — Next.js PWA frontend.
- `services/detection` — FastAPI inference service.
- `packages/shared-types` — shared TypeScript types.
- `packages/geo-utils` — geospatial helpers.
- `ml` — training/evaluation placeholders and model notes.
- `docs` — architecture and data model.

## Run locally

### Web

```bash
cd apps/web
npm install
npm run dev
```

Create `.env.local`:

```env
NEXT_PUBLIC_DETECTION_API=http://localhost:8000
```

### Detection service

```bash
cd services/detection
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Put your trained YOLOv12 weights at:

```text
services/detection/models/pothole.pt
```

The service intentionally does not ship a model weight file.

## Important privacy/safety notes

Location tracking is sensitive. Transpox should clearly ask for permission before collecting GPS, camera or motion data. Provide a visible Stop Ride control and delete/export controls for ride data.

Do not use the system as an autonomous driving or collision-avoidance system. Detection results are informational and can be wrong.

## Roadmap

1. Collect and label a representative pothole dataset.
2. Train/evaluate YOLOv12.
3. Add a production database.
4. Add route maps and server-side ride storage.
5. Add confidence + temporal/spatial deduplication.
6. Add moderation for false-positive reports.
7. Add aggregated pothole heatmaps.
