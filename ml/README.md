# Transpox ML

This directory contains training notes and evaluation material.

## Dataset

Create train/validation/test splits with geographic separation where possible. Randomly splitting nearby frames can leak nearly identical road scenes between train and test.

Example:

```text
ml/dataset/
├── images/
├── labels/
└── data.yaml
```

Do not commit a large raw dataset without checking licenses and Git repository limits.

## Model

Train a YOLOv12 pothole detector using a suitable Ultralytics-supported workflow and export the resulting model to `services/detection/models/pothole.pt`.

An optional vehicle model can be exported to `services/detection/models/vehicles.pt`.
