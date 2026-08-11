# Transpox architecture

## Data flow

1. User explicitly starts a ride.
2. Browser asks for geolocation permission.
3. Browser asks for camera permission.
4. `watchPosition()` records GPS points.
5. `DeviceMotionEvent` records acceleration signals.
6. Camera frames are sampled instead of uploading continuous video.
7. Frames + current GPS + motion score go to the detection API.
8. YOLOv12 detects potholes.
9. Optional vehicle model detects nearby vehicles.
10. The backend returns geotagged detections and normalized bounding boxes.
11. The client/server deduplicates detections within a configurable geographic radius.
12. End Ride freezes the route and produces a ride summary.

## Production architecture

```text
PWA
  |
  +--> Road map / Ride UI
  +--> GPS
  +--> Camera
  +--> Motion sensors
  |
  v
API Gateway
  |
  +--> Ride service --------> PostgreSQL/PostGIS
  |
  +--> Detection service ---> YOLOv12 GPU
  |
  +--> Aggregation service -> Pothole clusters
```

## Sensor fusion

Camera confidence is the primary visual signal. Accelerometer peaks can support a detection but should not independently label a road feature as a pothole because bumps can come from speed breakers, road joints or normal vibration.

## Vehicle recognition

Vehicle recognition is intentionally separated from pothole detection. Add a vehicle model at `services/detection/models/vehicles.pt`; the frontend will display returned vehicle boxes in yellow and vehicle markers on the map.

## Privacy

Only collect data necessary for the ride. Do not retain raw camera frames by default. Store aggregated pothole events and route data according to an explicit retention policy.
