# Bliss TaskPro

## Entry Pages

- `index.html` = Master App
- `engineer.html` = Engineer App

## Current Setup

- Master and Engineer apps are linked through browser storage.
- Karnataka districts load from `json/karnataka_districts.json`.
- PDF export is available for completed task share packs.
- OpenStreetMap map picking is available for master task location and engineer completion GPS.
- A Google Apps Script Web App URL can be saved in the Master app for sync-ready posting hooks.

## Important

- Full Google Sheets and Google Drive account integration is not complete until a real Google Apps Script or backend endpoint is provided.
- For best results, run the app through a local or hosted web server instead of opening raw `file:///` pages, because map tiles, JSON loading, and external libraries work more reliably that way.
