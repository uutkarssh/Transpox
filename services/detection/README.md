# Transpox Detection Service

This service runs cloud-side so the rider's Android phone does not need a laptop or local ML installation.

## Required model files

- `models/pothole.pt` — your trained YOLOv12 pothole model.
- `models/vehicles.pt` — optional vehicle detector.

The repository ignores large model weights by default. For production, store weights in object storage/model hosting and download them during deployment, or attach them through the deployment platform.

## API

`GET /health`

`POST /detect` with multipart fields:

- `image`
- `lat`
- `lng`
- `timestamp`
- `motion`

The response contains pothole detections, optional vehicle detections, confidence values and normalized camera bounding boxes.

## Phone-only architecture

The Android browser captures GPS, camera frames and motion data. This service performs the expensive ML inference remotely. Therefore the user does not need Python, a laptop, Termux or a local server.
