# Training

Suggested workflow:

1. Collect diverse road imagery.
2. Remove duplicates.
3. Annotate potholes with bounding boxes.
4. Split by road/location, not just by image.
5. Train YOLOv12.
6. Evaluate on unseen roads.
7. Review false positives manually.
8. Export the production model.
