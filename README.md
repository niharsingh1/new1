# ALLIED - AI-Based Satellite Threat & Collision Detection

A lightweight web dashboard that demonstrates:

1. **Input Data** via simulated orbital coordinates or pasted TLE data.
2. **Prediction Model** using linear regression for future orbit path estimation.
3. **Collision Logic** that raises an alert when satellite-to-satellite distance drops below a threshold.
4. **Simple Dashboard** with Earth visualization, orbit paths, red alert warnings, and threat percentage.

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
