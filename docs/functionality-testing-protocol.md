# Functionality Testing Protocol

## System Under Test
- Application: SafeSight (SafeCCTV)
- Frontend: React + Vite (desktop and browser runtime)
- Backend: FastAPI (`/api/*`)
- Database: MongoDB (`safesight`)

## General Test Environment
- Backend service is running and reachable.
- Frontend service is running and reachable (or Electron desktop app is launched).
- MongoDB service is running.
- At least one captain account exists (`captain / password` on first startup).
- Test responder account exists for role-based and SMS tests.
- At least one reachable RTSP source is available for live camera tests.

---

## 1. Login Functionality

### Positive Test Case: Successful Login
- Test Case ID: Login-01
- Test Priority: High
- Test Description: Verify that a user can log in with valid credentials.
- Pre-conditions: User account exists and is active.
- Dependencies: Backend auth endpoint, database connection.
- Post-conditions: User is redirected to the dashboard and token is stored.

Table 1

_Test Case: Login functionality (Positive)_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open login page | URL/app launch | Login form is displayed with username and password fields. | -- | -- | -- |
| 2 | Enter valid credentials and click Sign In | Username: captain<br>Password: password | API returns bearer token; no error is shown. | -- | -- | -- |
| 3 | Verify post-login state | Stored token in localStorage | Dashboard loads and welcome notification appears. | -- | -- | -- |

### Negative Test Case: Invalid Login
- Test Case ID: Login-02
- Test Priority: High
- Test Description: Verify login fails for invalid credentials.
- Pre-conditions: Login page is accessible.
- Dependencies: Backend auth endpoint.
- Post-conditions: User remains on login page; no token is stored.

Table 2

_Test Case: Login functionality (Negative)_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open login page | URL/app launch | Login form is displayed. | -- | -- | -- |
| 2 | Enter invalid credentials and click Sign In | Username: captain<br>Password: wrongpass | Error message shows "Invalid username or password." | -- | -- | -- |
| 3 | Validate session not created | localStorage token key | No token is saved and user is not redirected. | -- | -- | -- |

### Negative Test Case: Invalid Token Session Bootstrap
- Test Case ID: Login-03
- Test Priority: Medium
- Test Description: Verify stale or invalid token is cleared during startup check.
- Pre-conditions: Browser/app storage contains invalid token.
- Dependencies: `/api/auth/me` endpoint.
- Post-conditions: User is logged out and shown login page.

Table 3

_Test Case: Session bootstrap with invalid token_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Insert invalid token and reload app | token: invalid.jwt.token | App shows session checking loader briefly. | -- | -- | -- |
| 2 | Observe auth validation result | `/api/auth/me` with invalid token | Token and stale user cache are cleared. | -- | -- | -- |
| 3 | Confirm final page | N/A | Login page is displayed; protected pages are not rendered. | -- | -- | -- |

---

## 2. Role-Based Access Control

### Positive Test Case: Captain Navigation Access
- Test Case ID: RBAC-01
- Test Priority: High
- Test Description: Verify captain can access all captain pages.
- Pre-conditions: Captain user account exists.
- Dependencies: Auth, page permission logic, sidebar rendering.
- Post-conditions: Captain can navigate all allowed pages.

Table 4

_Test Case: Captain page access_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Login as captain | captain/password | Login succeeds. | -- | -- | -- |
| 2 | Inspect sidebar menu items | Role: captain | Dashboard, Camera Dashboard, Camera Locations, Camera Management, Collision Logs, User Management, Alert History, Analytics are visible. | -- | -- | -- |
| 3 | Open User Management and Camera Management pages | N/A | Both pages load without authorization errors. | -- | -- | -- |

### Negative Test Case: Responder Restricted Pages
- Test Case ID: RBAC-02
- Test Priority: High
- Test Description: Verify responder cannot access captain-only pages.
- Pre-conditions: Responder user account exists.
- Dependencies: Role gating in shell and backend captain-only APIs.
- Post-conditions: Responder can only access allowed pages.

Table 5

_Test Case: Responder page restriction_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Login as responder | responder credentials | Login succeeds. | -- | -- | -- |
| 2 | Inspect sidebar menu items | Role: responder | Camera Management and User Management are not visible. | -- | -- | -- |
| 3 | Attempt captain-only API call | `GET /api/users/` | API returns 403 Captain access required. | -- | -- | -- |

---

## 3. Dashboard Functionality

### Positive Test Case: Dashboard Data Load
- Test Case ID: Dash-01
- Test Priority: High
- Test Description: Verify dashboard loads stats, collisions, cameras, and alerts.
- Pre-conditions: User is logged in.
- Dependencies: `/api/dashboard/stats`, `/api/collisions/`, `/api/cameras/`, `/api/alerts/`.
- Post-conditions: Cards and widgets show fetched data.

Table 6

_Test Case: Dashboard overview load_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Navigate to Dashboard page | N/A | Loading state appears then resolves. | -- | -- | -- |
| 2 | Observe summary cards | DB with cameras/collisions/alerts | Active Cameras, Mapped Cameras, Total Collisions, etc. display computed values. | -- | -- | -- |
| 3 | Verify quick lists | Recent collisions/alerts | Recent rows and map/hotspot sections render without errors. | -- | -- | -- |

### Positive Test Case: Dashboard Collision Acknowledge Shortcut
- Test Case ID: Dash-02
- Test Priority: Medium
- Test Description: Verify pending event can be acknowledged from dashboard widget.
- Pre-conditions: At least one pending collision exists.
- Dependencies: `/api/collisions/{id}` update endpoint.
- Post-conditions: Collision status changes from pending to acknowledged.

Table 7

_Test Case: Dashboard acknowledge action_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find a pending collision in dashboard list | Collision status: pending | Pending event row is visible with acknowledge action. | -- | -- | -- |
| 2 | Click Acknowledge | Collision ID | Success notification appears. | -- | -- | -- |
| 3 | Refresh data | N/A | Event status updates to acknowledged; pending count decreases. | -- | -- | -- |

---

## 4. Camera Management Functionality

### Positive Test Case: Add Camera With Valid RTSP
- Test Case ID: CamMgmt-01
- Test Priority: High
- Test Description: Verify captain can add camera with valid stream source.
- Pre-conditions: Captain is logged in; valid RTSP URL is available.
- Dependencies: `/api/cameras/` create endpoint, RTSP validation service.
- Post-conditions: New camera is created as active.

Table 8

_Test Case: Add camera (Positive)_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Camera Management and click Add Camera | N/A | Add modal opens. | -- | -- | -- |
| 2 | Submit required fields | Name, Location, RTSP URL, Description | Validation passes; API returns 201. | -- | -- | -- |
| 3 | Verify camera list | Created camera record | New camera appears with active status. | -- | -- | -- |

### Negative Test Case: Add Camera With Invalid RTSP
- Test Case ID: CamMgmt-02
- Test Priority: High
- Test Description: Verify camera creation is blocked when RTSP is unreachable/invalid.
- Pre-conditions: Captain is logged in.
- Dependencies: RTSP probe validation.
- Post-conditions: No camera is persisted.

Table 9

_Test Case: Add camera (Negative invalid RTSP)_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Add Camera modal | N/A | Modal is displayed. | -- | -- | -- |
| 2 | Submit invalid stream URL | RTSP: rtsp://invalid-source | API returns error (400) with validation detail. | -- | -- | -- |
| 3 | Verify list integrity | Camera count before vs after | No new camera is added. | -- | -- | -- |

### Positive Test Case: Edit Camera Metadata
- Test Case ID: CamMgmt-03
- Test Priority: Medium
- Test Description: Verify captain can update camera fields.
- Pre-conditions: Camera exists.
- Dependencies: `/api/cameras/{id}` update endpoint.
- Post-conditions: Updated fields are visible in list and persisted.

Table 10

_Test Case: Edit camera_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Click Edit on existing camera | Camera ID | Edit modal opens with existing values. | -- | -- | -- |
| 2 | Change metadata and save | Name/Location/Description | API update succeeds. | -- | -- | -- |
| 3 | Validate updated row | New metadata values | List reflects new values after reload. | -- | -- | -- |

### Positive Test Case: Disable And Reconnect Camera
- Test Case ID: CamMgmt-04
- Test Priority: High
- Test Description: Verify captain can disable and reconnect camera lifecycle state.
- Pre-conditions: Active camera exists with reachable RTSP.
- Dependencies: `/api/cameras/{id}` update, `/api/cameras/{id}/reconnect`.
- Post-conditions: Camera returns to active after reconnect.

Table 11

_Test Case: Camera lifecycle action_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Click Disable on active camera | Camera ID | Status changes to inactive. | -- | -- | -- |
| 2 | Click Enable/Reconnect | Same camera ID | Reconnect runs RTSP validation and worker restart. | -- | -- | -- |
| 3 | Verify final state | Status and error fields | Camera status is active and last stream error is cleared. | -- | -- | -- |

### Positive Test Case: Delete Camera
- Test Case ID: CamMgmt-05
- Test Priority: Medium
- Test Description: Verify captain can delete a camera.
- Pre-conditions: Camera exists and can be removed.
- Dependencies: `/api/cameras/{id}` delete endpoint.
- Post-conditions: Camera record is removed from database and UI.

Table 12

_Test Case: Delete camera_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Click Delete on selected camera | Camera ID | Confirmation prompt appears. | -- | -- | -- |
| 2 | Confirm deletion | N/A | API returns success response. | -- | -- | -- |
| 3 | Verify camera list | Deleted camera ID | Camera no longer appears in list. | -- | -- | -- |

---

## 5. Camera Dashboard And Locations

### Positive Test Case: Live Stream And Fullscreen
- Test Case ID: CamDash-01
- Test Priority: High
- Test Description: Verify live stream tiles and fullscreen controls work.
- Pre-conditions: At least one active camera with valid RTSP exists.
- Dependencies: `/api/cameras/{id}/stream`, stream worker pipeline.
- Post-conditions: Stream renders and fullscreen closes correctly.

Table 13

_Test Case: Camera dashboard live output_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Camera Dashboard page | N/A | Camera tiles render with status badges. | -- | -- | -- |
| 2 | Observe active camera tile | Active camera with RTSP | Live image stream appears (or connecting/reconnecting state then connected). | -- | -- | -- |
| 3 | Open fullscreen and close with ESC | Selected camera tile | Fullscreen view opens and closes on ESC/close button. | -- | -- | -- |

### Positive Test Case: Assign Camera Pinpoint (Captain)
- Test Case ID: CamMap-01
- Test Priority: High
- Test Description: Verify captain can assign map coordinates to a camera.
- Pre-conditions: Captain logged in; at least one camera exists.
- Dependencies: Leaflet map UI, `/api/cameras/{id}` update endpoint.
- Post-conditions: Camera stores `map_latitude` and `map_longitude`.

Table 14

_Test Case: Camera map assignment_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Camera Locations and click Assign Camera | N/A | Assignment panel and map click mode are enabled. | -- | -- | -- |
| 2 | Select camera and click map point | Latitude/Longitude point | Draft marker appears with pending coordinates. | -- | -- | -- |
| 3 | Click Save Pinpoint | Camera ID + selected coordinates | Success notification; marker persists after reload. | -- | -- | -- |

### Negative Test Case: Responder View-Only On Camera Locations
- Test Case ID: CamMap-02
- Test Priority: Medium
- Test Description: Verify responder cannot assign/update camera pinpoints.
- Pre-conditions: Responder logged in.
- Dependencies: Role-based UI and captain-only API protection.
- Post-conditions: Responder remains in view-only mode.

Table 15

_Test Case: Camera map access control_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Login as responder and open Camera Locations | Responder account | Map is visible with existing camera pins. | -- | -- | -- |
| 2 | Attempt to find save controls | N/A | No captain assignment action is available. | -- | -- | -- |
| 3 | Attempt direct API update | `PUT /api/cameras/{id}` as responder | API returns 403 Captain access required. | -- | -- | -- |

---

## 6. Collision Logs And Clip Playback

### Positive Test Case: Collision List And Filter
- Test Case ID: Coll-01
- Test Priority: High
- Test Description: Verify collisions load and filter by status.
- Pre-conditions: Collision records exist.
- Dependencies: `/api/collisions/` endpoint.
- Post-conditions: Filtered list reflects selected status.

Table 16

_Test Case: Collision list and filter_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Collision Logs page | N/A | Collision table loads with latest records. | -- | -- | -- |
| 2 | Click filter buttons | all/pending/acknowledged/resolved | Only rows matching selected status are displayed. | -- | -- | -- |
| 3 | Refresh list | Refresh action | Updated collision rows are fetched and displayed. | -- | -- | -- |

### Positive Test Case: Acknowledge Pending Collision
- Test Case ID: Coll-02
- Test Priority: High
- Test Description: Verify pending collision can be acknowledged.
- Pre-conditions: At least one collision has status pending.
- Dependencies: `/api/collisions/{id}` update endpoint.
- Post-conditions: Collision status becomes acknowledged with audit fields.

Table 17

_Test Case: Collision acknowledge_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Find pending collision row | Status: pending | Acknowledge button is visible. | -- | -- | -- |
| 2 | Click Acknowledge | Collision ID | Success notification appears. | -- | -- | -- |
| 3 | Validate updated row | Status and acknowledged_by/acknowledged_at | Status changes to acknowledged and auditor name is set. | -- | -- | -- |

### Positive Test Case: Play Ready Collision Clip
- Test Case ID: Coll-03
- Test Priority: Medium
- Test Description: Verify ready clip is playable in modal viewer.
- Pre-conditions: Collision has `video_status=ready` and `video_file_id`.
- Dependencies: `/api/collisions/{id}/video` endpoint and browser video support.
- Post-conditions: Clip is played and metadata is shown.

Table 18

_Test Case: Collision clip playback_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Locate collision row with ready clip | video_status: ready | Play 15s Clip button is visible. | -- | -- | -- |
| 2 | Click Play 15s Clip | Collision ID | Video blob is fetched and viewer modal opens. | -- | -- | -- |
| 3 | Validate playback details | Clip window metadata | Video plays; duration and pre/post-event info are displayed. | -- | -- | -- |

### Negative Test Case: Clip Still Processing Or Missing
- Test Case ID: Coll-04
- Test Priority: Medium
- Test Description: Verify proper handling when clip is not available yet.
- Pre-conditions: Collision has `video_status=processing` or no `video_file_id`.
- Dependencies: Collision row rendering and video endpoint error handling.
- Post-conditions: User sees status/error message; app remains stable.

Table 19

_Test Case: Collision clip unavailable state_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open collision row without ready clip | video_status: processing/missing | Processing or missing badge is visible. | -- | -- | -- |
| 2 | Attempt playback action (if available) | Collision ID | User receives informative warning or API 409/404 detail. | -- | -- | -- |
| 3 | Verify page stability | N/A | No crash; user can continue using collision page. | -- | -- | -- |

---

## 7. User Management Functionality

### Positive Test Case: Create Responder User
- Test Case ID: User-01
- Test Priority: High
- Test Description: Verify captain can create a new user account.
- Pre-conditions: Captain logged in.
- Dependencies: `/api/users/` create endpoint.
- Post-conditions: New user appears in user list as active.

Table 20

_Test Case: User creation_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open User Management and click Add User | N/A | Add user modal opens. | -- | -- | -- |
| 2 | Submit valid form | Unique username/email, role, phone, password | API returns 201 and success notification. | -- | -- | -- |
| 3 | Verify list entry | Created user data | New user row appears with correct role/status. | -- | -- | -- |

### Positive Test Case: Update User Without Password Change
- Test Case ID: User-02
- Test Priority: Medium
- Test Description: Verify updating user profile fields works when password is left blank.
- Pre-conditions: Existing user record.
- Dependencies: `/api/users/{id}` update endpoint.
- Post-conditions: Non-password fields are updated and account remains usable.

Table 21

_Test Case: User update (blank password)_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Edit on existing user | User ID | Edit modal opens with user details. | -- | -- | -- |
| 2 | Modify profile and keep password empty | Full name, phone, role | Update succeeds without requiring password value. | -- | -- | -- |
| 3 | Validate saved record | Updated fields | Updated data is displayed after reload. | -- | -- | -- |

### Negative Test Case: Duplicate Username Or Email
- Test Case ID: User-03
- Test Priority: High
- Test Description: Verify duplicate username/email is rejected.
- Pre-conditions: Existing user with known username/email.
- Dependencies: Duplicate validation on create/update.
- Post-conditions: Duplicate save is blocked and original records are unchanged.

Table 22

_Test Case: User uniqueness validation_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Start add/edit user flow | Existing username/email | Form is ready for submission. | -- | -- | -- |
| 2 | Submit duplicate values | Duplicate username or duplicate email | API returns 400 with "Username or email already exists". | -- | -- | -- |
| 3 | Verify no unintended overwrite | User records | Existing user data remains unchanged. | -- | -- | -- |

### Negative Test Case: Captain Self-Delete Protection
- Test Case ID: User-04
- Test Priority: High
- Test Description: Verify captain cannot delete own account.
- Pre-conditions: Captain logged in.
- Dependencies: `/api/users/{id}` delete validation.
- Post-conditions: Current user account remains intact.

Table 23

_Test Case: Prevent self-delete_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Attempt to delete currently logged-in user via API | Current captain user ID | API returns 400 "Cannot delete yourself". | -- | -- | -- |
| 2 | Reload user list | N/A | Current captain account still exists. | -- | -- | -- |
| 3 | Validate session continuity | Existing token/session | Current session remains active. | -- | -- | -- |

---

## 8. Alert History And SMS Functionality

### Positive Test Case: Alert History Role Scope
- Test Case ID: Alerts-01
- Test Priority: High
- Test Description: Verify captain sees all alerts and responder sees only own alerts.
- Pre-conditions: Alert records exist for multiple responders.
- Dependencies: `/api/alerts/` role-based query.
- Post-conditions: Returned alert scope matches logged-in role.

Table 24

_Test Case: Alert history role filtering_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Login as captain and open Alert History | Captain account | Alert list displays all recent alert records. | -- | -- | -- |
| 2 | Login as responder and open Alert History | Responder account | Only alerts where `user_id` matches responder are shown. | -- | -- | -- |
| 3 | Compare visible counts | Same dataset, two roles | Captain count is greater than or equal to responder count. | -- | -- | -- |

### Positive Test Case: Send Test SMS (Captain)
- Test Case ID: Alerts-02
- Test Priority: High
- Test Description: Verify captain can trigger test SMS and delivery logs are recorded.
- Pre-conditions: SMS API configured; at least one active responder with phone number.
- Dependencies: `/api/alerts/test-sms`, external SMS provider connectivity.
- Post-conditions: Test alert records are inserted with sent/failed status.

Table 25

_Test Case: Test SMS dispatch_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Alert History as captain | N/A | Send Test SMS button is visible. | -- | -- | -- |
| 2 | Click Send Test SMS | Optional camera_id/message | API returns dispatch summary (sent, failed, recipients). | -- | -- | -- |
| 3 | Reload alert list | Latest records | New `is_test=true` alert rows appear with provider status details. | -- | -- | -- |

---

## 9. Analytics Functionality

### Positive Test Case: Monthly Analytics With Data
- Test Case ID: Analytics-01
- Test Priority: Medium
- Test Description: Verify analytics cards and charts render when monthly collisions exist.
- Pre-conditions: Current month has collision records.
- Dependencies: `/api/collisions/`, `/api/cameras/`, chart rendering components.
- Post-conditions: Metrics and chart visuals are correctly populated.

Table 26

_Test Case: Analytics populated state_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Analytics page | N/A | Loading indicator resolves and page content appears. | -- | -- | -- |
| 2 | Verify summary cards | Monthly collision data | Monthly totals, daily average, peak day, and high severity are shown. | -- | -- | -- |
| 3 | Verify charts | Daily, severity, hotspot, status datasets | All charts render with non-empty datasets and labels. | -- | -- | -- |

### Negative Test Case: Monthly Analytics Empty State
- Test Case ID: Analytics-02
- Test Priority: Low
- Test Description: Verify charts show graceful empty states when no monthly collisions exist.
- Pre-conditions: No collisions in current month.
- Dependencies: Analytics data transforms and empty-state components.
- Post-conditions: Empty-state messages shown without runtime errors.

Table 27

_Test Case: Analytics empty state_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Open Analytics page with empty month dataset | Monthly collisions = 0 | Stat cards show zero/derived values. | -- | -- | -- |
| 2 | Check chart containers | N/A | Empty-state messages are shown instead of broken charts. | -- | -- | -- |
| 3 | Validate console/runtime stability | N/A | No frontend crash or unhandled exceptions. | -- | -- | -- |

---

## 10. Detection Service Functionality

### Positive Test Case: Detection Status Endpoint
- Test Case ID: Detect-01
- Test Priority: Medium
- Test Description: Verify detection service status endpoint returns health and configuration data.
- Pre-conditions: Authenticated user session.
- Dependencies: `/api/detection/status` endpoint.
- Post-conditions: Status payload is retrievable and consistent.

Table 28

_Test Case: Detection status check_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Send authenticated request | `GET /api/detection/status` | API returns 200 with status object. | -- | -- | -- |
| 2 | Validate key fields | enabled, running, model_exists, model_loaded, last_error | Response includes expected keys and valid values. | -- | -- | -- |
| 3 | Cross-check model path | Configured model file path | `model_exists` matches actual file availability. | -- | -- | -- |

### Positive/Negative Test Case: Detection Enable/Disable Access Control
- Test Case ID: Detect-02
- Test Priority: High
- Test Description: Verify captain can enable/disable detection while non-captain is blocked.
- Pre-conditions: Captain and responder accounts exist.
- Dependencies: `/api/detection/enable`, `/api/detection/disable`, captain-only guard.
- Post-conditions: Detection enabled state changes only for authorized role.

Table 29

_Test Case: Detection control authorization_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Call enable endpoint as captain | `POST /api/detection/enable` | API returns status with `enabled=true`. | -- | -- | -- |
| 2 | Call disable endpoint as captain | `POST /api/detection/disable` | API returns status with `enabled=false`. | -- | -- | -- |
| 3 | Call enable endpoint as responder | responder auth token | API returns 403 Captain access required. | -- | -- | -- |

### Positive Test Case: One-Shot Detection Test (Create Event)
- Test Case ID: Detect-03
- Test Priority: Medium
- Test Description: Verify one-shot detection test can create collision event when detection occurs.
- Pre-conditions: Active camera exists with available frame stream.
- Dependencies: `/api/detection/test/{camera_id}?create_event=true`.
- Post-conditions: Collision may be created when detector returns positive result.

Table 30

_Test Case: Detection test with event creation_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Send test request with create_event true | Camera ID, `create_event=true` | API returns detected true/false response payload. | -- | -- | -- |
| 2 | If detected=true, validate event fields | collision_id, event_created | `event_created=true` and collision_id is present. | -- | -- | -- |
| 3 | Verify collision logs | Latest collisions list | New collision record appears when event was created. | -- | -- | -- |

### Positive Test Case: One-Shot Detection Test (No Event Creation)
- Test Case ID: Detect-04
- Test Priority: Medium
- Test Description: Verify one-shot detection can run without writing a collision entry.
- Pre-conditions: Active camera exists with available frame stream.
- Dependencies: `/api/detection/test/{camera_id}?create_event=false`.
- Post-conditions: No collision record is inserted by this call.

Table 31

_Test Case: Detection test without event creation_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Send test request with create_event false | Camera ID, `create_event=false` | API returns detected true/false response payload. | -- | -- | -- |
| 2 | Validate returned flags | event_created, collision_id | `event_created=false`; collision_id is null/absent. | -- | -- | -- |
| 3 | Confirm no new collision is inserted | Compare collision count before/after | Collision count does not increase from this request alone. | -- | -- | -- |

---

## 11. Health And Startup Functionality

### Positive Test Case: API Health Endpoint
- Test Case ID: Health-01
- Test Priority: High
- Test Description: Verify service health endpoint reports alive state.
- Pre-conditions: Backend service is running.
- Dependencies: `/api/health` endpoint.
- Post-conditions: Health check can be used for monitoring.

Table 32

_Test Case: API health check_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Send health request | `GET /api/health` | API returns HTTP 200. | -- | -- | -- |
| 2 | Validate response body | N/A | JSON contains `status: ok` and `service: SafeSight API`. | -- | -- | -- |
| 3 | Repeat check after app idle period | N/A | Endpoint remains responsive and consistent. | -- | -- | -- |

### Positive Test Case: Default Captain Auto-Creation
- Test Case ID: Startup-01
- Test Priority: Medium
- Test Description: Verify backend creates default captain on empty database startup.
- Pre-conditions: Fresh database with no captain user.
- Dependencies: Startup initialization (`ensure_default_captain`).
- Post-conditions: Default captain account is available for first login.

Table 33

_Test Case: First-run captain bootstrap_

| Step | Action | Test Data | Expected Output | Actual Output | Status | Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Start backend with empty users collection | Clean DB state | Startup process completes without errors. | -- | -- | -- |
| 2 | Query user records/login page | Username: captain | Captain account is present/usable. | -- | -- | -- |
| 3 | Attempt login with default credentials | captain/password | Login succeeds; user role is captain. | -- | -- | -- |

---

## Notes For Test Execution
- Fill Actual Output, Status, and Remarks during execution.
- Use consistent status values (e.g., Pass, Fail, Blocked).
- Capture screenshots/log references in Remarks for failed cases.
- For SMS and RTSP tests, record external dependency issues separately from app defects.
