# SafeSight

## Pull On Another Device (Clean And Ready)

Use this checklist after cloning the repo on a different PC.

1. Install prerequisites:
- Python 3.10+
- Node.js (with npm)
- MongoDB (running locally)

2. Clone the repository and open the project folder.

3. Run first-time setup:
- Double-click `install.bat`

4. Start the app:
- Double-click `SafeSight.bat`
- This opens SafeSight as a native desktop window and auto-starts backend/frontend services.

5. Open:
- Frontend (dev server): http://localhost:5173
- API Docs (desktop mode): http://localhost:8001/docs

## Important Notes

- On first run, MongoDB creates database `safesight` automatically when the backend inserts initial data.
- Backend startup auto-creates the default captain account if none exists.
- Default login:
  - Username: `captain`
  - Password: `password`
- `backend/.env` is local-only (gitignored). On another desktop, copy your own env values if you use custom settings.
- YOLO model files (`*.pt`) are not tracked. Put your model at `backend/models/best.pt` (or set a custom `DETECTION_MODEL_PATH`).

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
  "message": "COLLISION ALERT: HIGH severity at Camera 1 (Main Road) on 2026-04-09 14:35. Confidence: 92%",
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
- `COLLISION_PRE_EVENT_SECONDS=5`
- `COLLISION_CLIP_FPS=10`

API:
- `GET /api/collisions/{collision_id}/video` returns the stored MP4 clip.

UI:
- Collision Logs now show clip status.
- Once ready, `Play 15s Clip` appears in the row and opens an in-app player.

## YOLO best.pt Live Collision Detection

You can run a custom YOLO `.pt` model (for example `best.pt`) directly on live camera frames.

### 1) Put your model file in the project

- Place your model in `backend/models` as `best.pt`
  - Example path: `safecctv/backend/models/best.pt`
- Or use a custom path by setting `DETECTION_MODEL_PATH` in `backend/.env`.

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
