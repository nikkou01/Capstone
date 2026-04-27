# SafeSight New Desktop Setup (Windows)

This guide is for setting up SafeSight from scratch on a new Windows desktop/laptop.

## 1) Prerequisites

Install these first:

- Python 3.10 or newer (with Add Python to PATH enabled)
- Node.js LTS (includes npm)
- MongoDB Community Server
- Git (optional, if you need to clone)

Quick checks in PowerShell:

```powershell
python --version
node --version
npm --version
```

## 2) Get the Project

Clone or copy the project folder to your machine, then open the root folder:

```powershell
cd "D:\path\to\safecctv"
```

Path independence:

- You can place the `safecctv` folder anywhere on disk.
- Launcher scripts use script-relative paths (`%~dp0`), so they do not rely on a fixed drive/folder.

## 2.5) Run Preflight (Recommended)

```powershell
.\preflight.bat
```

This validates Python, Node/npm, MongoDB, and required project folders before launch.

## 3) Run the Installer (All Required Dependencies)

Run the root installer:

```powershell
.\install.bat
```

What this installs/prepares:

- backend Python virtual environment (`backend\.venv`)
- backend pip packages from `backend\requirements.txt`
- backend `.env` auto-created from `.env.example` if missing
- frontend npm packages
- mobile-responder npm packages (if `mobile-responder` exists)
- MongoDB service check/start attempt

## 4) Start SafeSight Desktop App

Run:

```powershell
.\SafeSight.bat
```

This starts:

- backend + frontend in desktop mode
- mobile responder app (Expo) in a separate terminal

`SafeSight.bat` automatically sets `EXPO_PUBLIC_API_BASE_URL` to `http://<detected-lan-ip>:8000/api` before launching Expo.

## 5) Verify Services

- Desktop/web frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

Default accounts:

- Captain: `captain` / `password`
- Responder: `responder` / `password`

## 6) Mobile Responder App

When `SafeSight.bat` runs, Expo is opened automatically in a separate terminal.

Then open Expo Go and scan the QR code from that terminal.

Manual fallback (only if needed):

```powershell
cd mobile-responder
$env:EXPO_PUBLIC_API_BASE_URL="http://<YOUR-PC-LAN-IP>:8000/api"
npm run start -- --tunnel --clear
```

## 7) Troubleshooting

- If backend login/API fails, make sure backend is running on port 8000.
- If mobile app cannot connect, do not use localhost; use your PC LAN IP.
- If Expo says port 8081 is busy, stop the old process or allow Expo to use 8082.
- If dependencies are broken after updates, rerun `install.bat`.
- Run `preflight.bat` to get a fast fail/pass report on the current machine.
