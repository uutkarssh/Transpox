# Data model

## rides

- `id`
- `started_at`
- `ended_at`
- `start_lat`
- `start_lng`
- `end_lat`
- `end_lng`
- `distance_m`
- `pothole_count`

## ride_points

- `id`
- `ride_id`
- `timestamp`
- `latitude`
- `longitude`
- `accuracy_m`
- `speed_mps`
- `heading_deg`

## sensor_samples

- `id`
- `ride_id`
- `timestamp`
- `ax`
- `ay`
- `az`

## pothole_events

- `id`
- `ride_id`
- `latitude`
- `longitude`
- `confidence`
- `source`
- `detected_at`

## pothole_clusters

A cluster represents one real-world pothole after combining repeated detections from multiple frames/riders.

- `id`
- `latitude`
- `longitude`
- `confidence`
- `observation_count`
- `first_seen_at`
- `last_seen_at`
