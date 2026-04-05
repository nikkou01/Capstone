# SafeCCTV

## Pull On Another Device (Clean And Ready)

Use this checklist after cloning the repo on a different PC.

1. Install prerequisites:
- Python 3.10+
- Node.js (with npm)
- MongoDB (running locally)

2. Clone the repository and open the project folder.

3. Run first-time setup:
- Double-click `install.bat`
- When asked `Reset MongoDB database to clean state now?`, choose `Y`

4. Start the app:
- Double-click `start-all.bat`

5. Open:
- Frontend: http://localhost:5173
- API Docs: http://localhost:8000/docs

## Important Notes

- Choosing `Y` during setup resets database `safecctv` so there are no test inputs.
- After reset, backend startup recreates only the default captain account.
- Default login:
  - Username: `captain`
  - Password: `password`

## If You Already Added Test Data

Run `reset-db.bat` anytime, then start services again with `start-all.bat`.
