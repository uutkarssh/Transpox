# Detection pipeline

## YOLOv12

The application expects a pothole-trained YOLOv12-compatible Ultralytics model.

Do not commit model weights to Git unless licensing, repository size and deployment requirements permit it.

## Recommended classes

Start with:

- `pothole`

For vehicle recognition, use a separate model at `services/detection/models/vehicles.pt` with classes appropriate to the deployment environment.

## Event generation

A frame detection becomes a pothole event only when:

- confidence is above the configured threshold,
- GPS accuracy is acceptable,
- the same location was not recently recorded.

Production systems should also consider vehicle speed, heading, camera geometry, temporal persistence, GPS uncertainty and duplicate observations from different riders.

## Metrics

Track precision, recall, mAP50, mAP50-95, false positives per kilometer, pothole detections per kilometer and median localization error.
