# Bliss TaskPro

Bliss TaskPro includes a Master web app and an Engineer web app for draft creation, task assignment, field execution, sync, uploads, and PDF export.

## Hostinger Migration

This project can be deployed to Hostinger as a static site on:

- `https://blissinfra.in`

### Production Config

- Frontend base domain: `https://blissinfra.in`
- Google Apps Script config in [code.gs](E:\Bob_Coding\Bliss TaskPro\Bliss-TaskPro\code.gs):
  - `APP_URL = https://blissinfra.in`
  - `ALLOWED_ORIGIN = https://blissinfra.in`
- Production env file: [\.env](E:\Bob_Coding\Bliss TaskPro\Bliss-TaskPro\.env)
- Hostinger rewrite rules: [\.htaccess](E:\Bob_Coding\Bliss TaskPro\Bliss-TaskPro\.htaccess)
- Static auth callback placeholder: [index.html](E:\Bob_Coding\Bliss TaskPro\Bliss-TaskPro\auth\callback\index.html)

### Build For Hostinger

This repo does not use a framework build today. A packaging build is included for Hostinger:

1. Run `npm install`
2. Run `npm run build`
3. Upload the contents of [public_html](E:\Bob_Coding\Bliss TaskPro\Bliss-TaskPro\dist\public_html) to Hostinger `public_html`

### GitHub To Hostinger Deployment

A GitHub Actions workflow is included at:

- [deploy-hostinger.yml](E:\Bob_Coding\Bliss TaskPro\Bliss-TaskPro\.github\workflows\deploy-hostinger.yml)

It will:

1. run on push to `main`
2. install dependencies
3. build the Hostinger package
4. upload `dist/public_html` to Hostinger `/public_html/`

Add these GitHub repository secrets before using it:

- `HOSTINGER_FTP_SERVER`
- `HOSTINGER_FTP_USERNAME`
- `HOSTINGER_FTP_PASSWORD`
- `HOSTINGER_FTP_PORT`

Typical Hostinger values:

- `HOSTINGER_FTP_SERVER`: your Hostinger FTP host
- `HOSTINGER_FTP_USERNAME`: your FTP username
- `HOSTINGER_FTP_PASSWORD`: your FTP password
- `HOSTINGER_FTP_PORT`: usually `21`

The build copies:

- `index.html`
- `engineer.html`
- `styles.css`
- `shared.js`
- `master.js`
- `engineer.js`
- `json/`
- `Images/`
- `New Logo.png`
- `.htaccess`
- `auth/callback/index.html`

### Hostinger Folder Structure

```text
/public_html
  index.html
  engineer.html
  styles.css
  shared.js
  master.js
  engineer.js
  /json
  /Images
  /auth/callback/index.html
  .htaccess
```

### Important Notes

- This codebase does not contain a local `/api` backend. The frontend talks directly to Google Apps Script through the Apps Script URL saved in app settings.
- This codebase also does not contain Google OAuth login logic. Current login is credential-sheet based through Apps Script, not Google Sign-In.
- Because uploads go browser -> Google Apps Script -> Google Drive, Hostinger upload size/timeouts are not the upload bottleneck in the current architecture.
- If Google OAuth is added later, use:
  - Authorized JavaScript origin: `https://blissinfra.in`
  - Redirect URI: `https://blissinfra.in/auth/callback`

## Features

- Master draft creation with Client, Engineer, Category, and Activity
- Draft edit and delete actions in the Master page
- Manual Site ID assignment with task date, location, district, and instructions
- Engineer workflow with `Pending`, `WIP`, and `Completed`
- Rollback from Master with required rollback reason
- Dashboard summary cards in Master for Total, Pending, WIP, and Completed
- Google Apps Script sync with Google Sheets and Google Drive
- Per-SiteID workspace creation in Google Drive
- Per-SiteID Google Sheet storage for Master Entry and Engineer Entry
- Upload support for documents, site photos, measurement text, measurement images, and GPS
- PDF export from Master review
- Auto Sync toggle for Master and Engineer with manual sync fallback
- Sequential file upload queue with retry and progress feedback
- Master engineer dropdown refresh from the credential sheet with duplicate-safe merging
- Engineer dropdown options now come from the Apps Script state response, which reads `Display Name` values from the `Engineer_Credential` sheet.
- Century Gothic based UI styling across Master and Engineer pages
- Master and Engineer task tables with serial numbering and status actions at the end
- Manual latitude and longitude entry in Master task assignment with automatic district lookup

## Workflow

```text
Draft
|
v
Task Assigned (Site ID)
|
v
Pending
|
v
WIP
|
v
Completed
|
v
Master Review
|
v
PDF Export
```

## Master Flow

1. Master creates a draft using Client, Engineer, Category, and Activity.
2. Master edits or deletes drafts before assignment if needed.
3. Master assigns a manual Site ID and adds date, location, district, and instructions.
4. The task moves from draft into the active task lifecycle.
5. Master reviews completed work, can rollback to `Pending` or `WIP`, and exports PDF.

## Engineer Flow

1. Engineer logs in and sees only assigned Site IDs.
2. Engineer opens a Site ID to load the task workspace.
3. District is shown as locked read-only text from Master assignment.
4. Engineer updates task from `Pending` to `WIP` to `Completed`.
5. Engineer uploads documents, site photos, measurement text, measurement images, GPS, and site engineer name.

## Drive Structure

```text
Root Folder
\-- SiteID Folder
    +-- Documents
    +-- Site Photos
    +-- Measurement Photos
    \-- SiteID_DataSheet
```

Root Google Drive folder ID:

- `1I4xotaTUYN8PRYhfCzDST2OeRs0voiE1`

## SiteID Sheet Structure

Each Site ID gets its own Google Sheet named `SiteID_DataSheet`.

### Master Entry

- Site ID
- Client
- Engineer
- Category
- Activity
- Date
- Location
- District
- Instructions
- Created Date

### Engineer Entry

- Site Engineer Name
- Status
- Documents JSON
- Photos JSON
- Measurement Text
- Measurement Images JSON
- Latitude
- Longitude
- Completed Date
- Rollback Reason

## Notes

- UI theme, login system, manual Site ID entry, and status names remain unchanged.
- Sync now preserves local Master drafts until they are converted into tasks.
- Auto Sync now only runs background timers when the saved toggle is ON.
- With Auto Sync OFF, refresh, manual sync, and task-save actions still update data, but no background interval runs.
- Engineer auto sync now preserves the active WIP form while refreshing task list and status changes.
- Active Engineer upload sessions lock action buttons, show progress text, and upload files one-by-one with automatic retries.
- Engineer uploads now compress large site photos and measurement images before upload and keep the form usable while the background queue runs.
- Engineer upload success now refreshes only the local file list/detail view instead of forcing a full form reset.
- Master assigned-task view now uses the same lightweight table style as Task Details.
- Master draft selector now shows a soft glow when drafts are waiting for Site ID assignment.
- PDF export now shows a single `GPS` line under Location and uses `Invoice No:` in the billing block.
- Master Task page status buttons are display-only; status changes remain available only from the Task Details modal.
- Engineer task detail now keeps Document dropdown changes local without forcing a remote reload, and the WIP action sits directly below Site Engineer Name.
- Master header and Engineer header now place workspace title and logged-in credential text on the top-right, with Logout moved into the top action area.
- Master task assignment now supports manual latitude/longitude entry and auto-fills district from reverse geocoding while still keeping the GPS/map helpers.
- Master draft creation continues to support existing engineers and also saves manually entered engineers back into shared options for future dropdown use.
- Master and Engineer task tables now show serial numbers first and move the interactive status button to the final column.
- Engineer task detail now shows assigned location, latitude, longitude, and district together for easier site verification.
- Master PDF export now also saves a copy into the Site ID `Reports` folder in Drive.
- PDF task info now includes location, latitude, longitude, and district with improved alignment against the billing block.
- Rollback reason input now appears only after a rollback option is selected in the completed task modal.
- Engineer task details now fetch and display previously uploaded Drive files for documents, photos, and measurement images.
- Master task details now allow selecting individual documents, photos, and measurement images before saving a report.
- Master `Save` now stores the PDF and the selected file copies inside the Site ID `Reports` folder.
