# SafeSight

## Pull On Another Device (Clean And Ready)

Use this checklist after cloning the repo on a different PC.

Detailed guide: see `NEW_DESKTOP_SETUP.md`.

1. Install prerequisites:
- Python 3.10+
- Node.js (with npm)
- MongoDB (running locally)

2. Clone the repository and open the project folder.

Path note:
- The project can live in any folder/drive. Startup scripts use script-relative paths.

2.5. Run machine preflight check (recommended):
- Double-click `preflight.bat`
- or run `./preflight.bat` in terminal

3. Run first-time setup:
- Double-click `install.bat`

4. Start the app:
- Double-click `SafeSight.bat`
- This opens SafeSight as a native desktop window, auto-starts backend/frontend services, and auto-launches the mobile responder Expo app in a separate terminal.
- Mobile API URL is auto-set to `http://<detected-lan-ip>:8000/api` by the launcher.

5. Open:
- Frontend (dev server): http://localhost:5173
- API Docs (desktop mode): http://localhost:8000/docs

## Important Notes

- On first run, MongoDB creates database `safesight` automatically when the backend inserts initial data.
- Backend startup auto-creates the default captain account if none exists.
- Default login:
  - Username: `captain`
  - Password: `password`
- Default responder login for the mobile app:
  - Username: `responder`
  - Password: `password`
- `backend/.env` is local-only (gitignored), but setup now auto-creates it from `backend/.env.example` if missing.
- Default detection model `backend/models/best.pt` is included in the repository.
- If you need custom secrets or provider settings, edit `backend/.env` after running setup.

## SMS API Integration

The backend can call your SMS provider whenever a collision is created.

Configure these in `backend/.env`:
- `SMS_API_URL`: SMS provider endpoint URL
- `SMS_API_KEY`: API token/key
- `SMS_API_AUTH_HEADER`: header name for auth (default `Authorization`)
- `SMS_API_AUTH_SCHEME`: auth prefix (default `Bearer`).
  - Set to `Basic` for UniSMS. The backend auto-encodes `secret_key:` to Base64.
- `SMS_API_FROM`: sender id/name (optional)
- `SMS_API_TO_FIELD`: recipient field name in payload (default `to`)
- `SMS_API_MESSAGE_FIELD`: message field name in payload (default `message`)
- `SMS_API_FROM_FIELD`: sender field name in payload (default `from`)
- `SMS_API_EXTRA_JSON`: extra JSON object merged into payload (optional)
- `SMS_API_TIMEOUT_SECONDS`: request timeout in seconds
- `PUBLIC_BASE_URL`: public base URL used in SMS clip links (example: `https://your-domain.com`)

### UniSMS Quick Configuration

Use these values for UniSMS:
- `SMS_API_URL=https://unismsapi.com/api/sms`
- `SMS_API_AUTH_HEADER=Authorization`
- `SMS_API_AUTH_SCHEME=Basic`
- `SMS_API_TO_FIELD=recipient`
- `SMS_API_MESSAGE_FIELD=content`
- `SMS_API_FROM_FIELD=sender_id`

Optional:
- `SMS_API_EXTRA_JSON={"metadata":{"source":"accident_detection"}}`
- Leave `SMS_API_FROM` blank unless your Sender ID is approved by UniSMS.

Example request payload sent by backend:
```json
{
  "to": "+639xxxxxxxxx",
  "message": "COLLISION ALERT: HIGH severity at Camera 1 (Main Road) on 2026-04-09 14:35. Confidence: 92%. Clip (10s before + 5s after): https://your-domain.com/api/public/collisions/<collision_id>/video?token=<token>",
  "from": "SafeSight"
}
```

Notes:
- SMS dispatch is sent to active users with role `responder`.
- Delivery outcomes are saved in Alert History with `sent` or `failed` status.
- Captains can trigger a manual test from Alert History using the `Send Test SMS` button.

## Automatic Collision Video Clip

When a collision is created, the backend now attempts to generate and store a 15-second MP4 clip for that event.

What gets stored:
- Video status (`processing`, `ready`, or `failed`)
- Duration and before/after timing metadata
- Clip file in MongoDB GridFS

Defaults in `backend/.env`:
- `COLLISION_CLIP_SECONDS=15`
- `COLLISION_PRE_EVENT_SECONDS=10`
- `COLLISION_CLIP_FPS=10`

API:
- `GET /api/collisions/{collision_id}/video` returns the stored MP4 clip.
- `GET /api/public/collisions/{collision_id}/video?token=...` returns the same clip without login, for SMS recipients.

UI:
- Collision Logs now show clip status.
- Once ready, `Play 15s Clip` appears in the row and opens an in-app player.

## Collision Simulation Upload

You can upload a local video file and test it against the currently loaded YOLO model.

API:
- `POST /api/collisions/simulate` (multipart field name: `video_file`)

Response highlights:
- `detected`: whether the model/heuristic detected a collision candidate
- `confidence`, `class_name`, `detected_at_second`
- analyzed frame statistics (`analyzed_frames`, `sampled_every_n_frames`)

Tuning keys in `backend/.env`:
- `SIMULATION_ANALYSIS_FPS=6`
- `SIMULATION_MAX_ANALYZED_FRAMES=900`

UI:
- Collision Logs now includes a `Collision Simulation` button where you can pick a video and run detection.

## YOLO best.pt Live Collision Detection

You can run a custom YOLO `.pt` model (for example `best.pt`) directly on live camera frames.

### 1) Put your model file in the project

- `backend/models/best.pt` is included by default, so no extra copy step is required on a fresh clone.
- To use a different model, replace `backend/models/best.pt` or set a custom `DETECTION_MODEL_PATH` in `backend/.env`.

### 2) Enable detector settings in `backend/.env`

Use these keys:

- `DETECTION_ENABLED=1`
- `DETECTION_MODEL_PATH=backend/models/best.pt`
- `DETECTION_CONFIDENCE_THRESHOLD=0.01`
- `DETECTION_COOLDOWN_SECONDS=12`
- `DETECTION_POLL_INTERVAL_SECONDS=0.10`
- `DETECTION_ALLOWED_CLASS_IDS=` (optional, comma-separated class ids)
- `DETECTION_ALLOWED_CLASS_NAMES=` (optional, comma-separated class names)

Tip:
- If your model has exactly one class and it means collision, you can leave both class filters blank.

### 3) Install backend dependencies

The backend now requires `ultralytics`.

- Run setup again (`install.bat`) or install from backend requirements.

### 4) Restart SafeSight

- Restart backend/app so detection service reads the new env values and loads the model.

### 5) Test detection with your live CCTV

- Point CCTV at an accident video feed.
- Keep camera status as `active` with valid RTSP.
- The detector automatically creates collision records when a detection passes threshold.

Useful API endpoints:

- `GET /api/detection/status` -> detector health/model status
- `POST /api/detection/test/{camera_id}?create_event=true` -> run one-shot inference on latest frame (optionally create collision event)
- `POST /api/detection/enable` and `POST /api/detection/disable` -> runtime toggle

Result flow:

- New detections appear in Collision Logs.
- SMS alert flow runs as usual.
- 15-second collision clips are generated as usual.

## Optional Database Reset (Advanced)

If you need a clean database, run:

```powershell
backend\.venv\Scripts\python.exe backend\reset_db.py --yes
```

## Build A Windows Installer (.exe)

1. Open PowerShell in the project root.
2. Run:
  - `cd frontend`
  - `npm run desktop:build`
3. Find generated installer output in `frontend/release`.

Notes:
- Build packaging includes the `backend` folder from the project root.
- Make sure `install.bat` has been run before packaging so `backend/.venv` exists.

## Android Responder Mobile App

A dedicated responder-only Android app is now available in `mobile-responder`.

What it includes:
- Responder-only login (non-responder roles are blocked in the app)
- Live auto-refresh dashboards for collisions, alerts, camera health, and summary stats
- Collision status actions (acknowledge/responded/resolved flow)
- Same backend/database integration through existing `/api` endpoints
- SMS alerts remain active as backup alerts (double alerting)

Quick start:

1. Open a terminal in `mobile-responder`
2. Install dependencies:
  - `npm install`
3. Set API URL to your backend LAN host (important for phone testing):
  - PowerShell: `$env:EXPO_PUBLIC_API_BASE_URL="http://<YOUR-PC-LAN-IP>:8000/api"`
4. Start Expo:
  - `npm run start`
5. Run on Android emulator or Expo Go on a phone (same Wi-Fi)

See full instructions in `mobile-responder/README.md`.
