# Transpox Detection Service

This service runs cloud-side so the rider's Android phone does not need a laptop or local ML installation.

## Inference backend

Pothole inference is now routed through the public Hugging Face Space:

- Space: `Utkarssh/transpox-api`
- Gradio API: `/detect_potholes`
- Inputs: `image`, `confidence`
- Outputs: annotated image + detection JSON

The service converts the returned `box_xyxy` coordinates into normalized `[x, y, width, height]` boxes for the Transpox web app.

The default confidence is `0.25`, intentionally lower than the previous `0.45` local default so weaker real potholes are less likely to be discarded. The value remains configurable through `TRANPOX_CONFIDENCE` or the `/detect` request's optional `confidence` field.

## Optional local models

- `models/pothole.pt` — local pothole model used only as a fallback if the Hugging Face request fails.
- `models/vehicles.pt` — optional local vehicle detector.

The repository ignores large model weights by default. For production, store weights in object storage/model hosting and download them during deployment, or attach them through the deployment platform.

## API

`GET /health`

Returns service health and the active inference backend.

`POST /detect` with multipart fields:

- `image`
- `lat`
- `lng`
- `timestamp`
- `motion`
- `confidence` (optional)

The response contains pothole detections, optional vehicle detections, confidence values, normalized camera bounding boxes, count, and the active inference backend.

## Phone-only architecture

The Android browser captures GPS, camera frames and motion data. This service sends frames to the remote Hugging Face model and returns normalized detections. Therefore the user does not need Python, a laptop, Termux or a local ML installation.
