# SafeSight Responder Mobile (Android)

This is a dedicated Android mobile app for responders.

It connects to the same backend/database through existing API routes and keeps SMS alerts active as backup alerts.

## Features

- Responder-only login gate (captain/non-responder accounts are blocked in this app)
- Live responder dashboard (auto-refresh every 5 seconds)
- Collision logs with action workflow:
  - pending -> acknowledge / decline
  - acknowledged -> mark responded
  - responded -> mark resolved
- SMS alert history for the logged-in responder
- Camera health and snapshot previews

## Setup

1. Open terminal in this folder.
2. Install dependencies:

```bash
npm install
```

3. Set your API base URL for mobile (LAN IP of backend host):

PowerShell:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://192.168.1.3:8000/api"
```

4. Start Expo:

```bash
npm run start
```

5. Run on Android:

- Use Android Studio emulator, or
- Scan QR with Expo Go on your Android phone (same Wi-Fi network).

## Important Notes

- Do not use localhost on a physical phone; use your computer LAN IP.
- Backend already has CORS allow_origins=["*"], so mobile calls are allowed.
- SMS system remains unchanged and still sends to responder numbers for double alerting.
- Default test login: `responder` / `password`.
