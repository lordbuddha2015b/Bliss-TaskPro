# Bliss TaskPro

Bliss TaskPro includes a Master web app and an Engineer web app for draft creation, task assignment, field execution, sync, uploads, and PDF export.

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
- Backward compatibility layer for older centralized task records

## Workflow

```text
Draft
↓
Task Assigned (Site ID)
↓
Pending
↓
WIP
↓
Completed
↓
Master Review
↓
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
└── SiteID Folder
    ├── Documents
    ├── Site Photos
    ├── Measurement Photos
    └── SiteID_DataSheet
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
- Engineer auto sync now preserves the active WIP form while refreshing task list and status changes.
- Master PDF export now also saves a copy into the Site ID `Reports` folder in Drive.
- Rollback reason input now appears only after a rollback option is selected in the completed task modal.
