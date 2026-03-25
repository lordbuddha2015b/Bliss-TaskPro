# Bliss TaskPro

Two linked browser apps for field task monitoring:

- `index.html` = Master App
- `engineer.html` = Engineer App

## What it does

- Master can create Site ID drafts, assign tasks, and monitor all task details.
- Engineer sees assigned tasks by engineer name filter.
- Task status colors:
  - Gray = Pending
  - Orange = WIP
  - Green = Completed
- Document and photo names are automatically prefixed with the Site ID.
- Engineer completion requires:
  - document upload
  - photo upload
  - measurement saved
  - GPS captured

## Notes

- This version uses browser `localStorage` so both pages stay linked on the same browser/device.
- For GPS capture, the browser will ask for location permission.
- For stronger access control and multi-user login, a backend/auth layer should be added next.
