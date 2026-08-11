# Transpox

**Transpox is designed to work from an Android phone without running anything locally.** Open the deployed website, grant camera/location permissions, tap **Start Ride**, and the phone sends selected camera frames + GPS + motion data to the cloud detection API.

## Live ride experience

- Mobile-first ride UI.
- Rear camera preview while riding.
- Red camera boxes for detected potholes.
- Optional yellow vehicle boxes for upcoming/nearby vehicles.
- Normal road-map tiles (not satellite).
- Blue route line and current-location marker.
- GPS speed, distance, duration and accuracy.
- Accelerometer/motion signal.
- Potholes are geotagged and spatially deduplicated.

## Phone-only architecture

```text
Android Browser
     |
     +-- Camera
     +-- GPS
     +-- Accelerometer
     |
     v
Vercel / Next.js PWA
     |
     v
Cloud Detection API
     |
     +-- YOLOv12 pothole model
     +-- optional vehicle model
     |
     v
Live detections -> map + camera overlay
```

The Android phone does **not** need Python, a laptop, Termux, or a local ML server.

## Deployment

### A. Frontend on Vercel

Import `uutkarssh/Transpox` into Vercel. The included `vercel.json` configures the Next.js application.

Set this environment variable in Vercel:

```env
NEXT_PUBLIC_DETECTION_API=https://YOUR-DETECTION-SERVICE.example.com
```

After deployment, open the HTTPS URL on your Android phone. Camera and geolocation permissions require a secure origin such as HTTPS.

### B. Detection API in the cloud

Deploy `services/detection` using the included `Dockerfile` / `render.yaml` or another container host that can run the required ML workload.

The API needs:

```text
models/pothole.pt       # required: trained YOLOv12 pothole model
models/vehicles.pt      # optional: vehicle detector
```

Large model weights are ignored by Git by default. For production, keep them in model/object storage or attach them through the deployment platform.

### C. Important: a model is still required

The code is a deployment-ready inference shell, but it cannot invent a trained pothole model. You must supply a pothole-trained YOLOv12 weight file before real pothole detection will work. Vehicle recognition similarly needs a vehicle-capable model.

## Project structure

- `apps/web` — Next.js PWA frontend.
- `services/detection` — FastAPI cloud inference service.
- `packages/shared-types` — shared TypeScript types.
- `packages/geo-utils` — geospatial helpers.
- `ml` — training/evaluation notes.
- `docs` — architecture and data model.

## Privacy and safety

Transpox handles sensitive location and camera data. Ask for permission explicitly, show a visible End Ride control, minimize raw frame retention, and publish a clear retention policy before public launch.

Detection is informational and can be wrong. Do not use Transpox as an autonomous-driving or collision-avoidance system.
