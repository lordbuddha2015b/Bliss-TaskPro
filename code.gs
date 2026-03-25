const CONFIG = {
  APP_NAME: 'Bliss TaskPro',
  SHEET_ID: 'PASTE_GOOGLE_SHEET_ID_HERE',
  DRIVE_FOLDER_ID: 'PASTE_GOOGLE_DRIVE_FOLDER_ID_HERE',
  APP_URL: 'PASTE_DEPLOYED_APPS_SCRIPT_WEB_APP_URL_HERE',
  ALLOWED_ORIGIN: '*'
};

function doGet() {
  return jsonOutput({
    ok: true,
    appName: CONFIG.APP_NAME,
    appUrl: CONFIG.APP_URL,
    sheetId: CONFIG.SHEET_ID,
    driveFolderId: CONFIG.DRIVE_FOLDER_ID
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = payload.action || 'unknown';
    const source = payload.source || 'unknown';
    const state = payload.state || {};
    const task = payload.payload || {};

    const sheet = getSheet_(state.settings || {});
    ensureHeader_(sheet);

    const row = buildRow_({
      action,
      source,
      task,
      state
    });

    sheet.appendRow(row);

    const uploadedFiles = saveFilesToDrive_(task, state.settings || {});

    return jsonOutput({
      ok: true,
      action,
      uploadedFiles
    });
  } catch (error) {
    return jsonOutput({
      ok: false,
      error: error.message
    });
  }
}

function buildRow_(input) {
  const task = input.task || {};
  return [
    new Date(),
    input.action || '',
    input.source || '',
    task.id || '',
    task.siteId || '',
    task.client || '',
    task.engineer || '',
    task.siteEngineerName || '',
    task.category || '',
    task.activity || '',
    task.date || '',
    task.location || '',
    task.latitude || task.gps?.latitude || '',
    task.longitude || task.gps?.longitude || '',
    task.district || '',
    task.instructions || '',
    task.status || '',
    task.measurementText || '',
    safeJson_(task.documents || []),
    safeJson_(task.photos || []),
    safeJson_(task.measurementImages || []),
    safeJson_(task.sharePackage || {}),
    safeJson_(input.state?.settings || {})
  ];
}

function saveFilesToDrive_(task, settings) {
  const folder = getDriveFolder_(settings);
  const saved = [];
  const groups = ['documents', 'photos', 'measurementImages'];

  groups.forEach(function(groupName) {
    (task[groupName] || []).forEach(function(fileItem) {
      if (!fileItem.base64Content) return;
      const contentType = fileItem.type || 'application/octet-stream';
      const blob = Utilities.newBlob(
        Utilities.base64Decode(fileItem.base64Content),
        contentType,
        fileItem.storedName || fileItem.originalName || 'upload.bin'
      );
      const file = folder.createFile(blob);
      saved.push({
        group: groupName,
        name: file.getName(),
        url: file.getUrl(),
        id: file.getId()
      });
    });
  });

  return saved;
}

function getSheet_(settings) {
  const sheetId = settings.googleSheetId || CONFIG.SHEET_ID;
  if (!sheetId || sheetId.indexOf('PASTE_') === 0) {
    throw new Error('Please update CONFIG.SHEET_ID in code.gs');
  }
  return SpreadsheetApp.openById(sheetId).getSheets()[0];
}

function getDriveFolder_(settings) {
  const folderId = settings.googleDriveFolderId || CONFIG.DRIVE_FOLDER_ID;
  if (!folderId || folderId.indexOf('PASTE_') === 0) {
    throw new Error('Please update CONFIG.DRIVE_FOLDER_ID in code.gs');
  }
  return DriveApp.getFolderById(folderId);
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow([
    'Timestamp',
    'Action',
    'Source',
    'Task ID',
    'Site ID',
    'Client',
    'Engineer',
    'Site Engineer Name',
    'Category',
    'Activity',
    'Task Date',
    'Location',
    'Latitude',
    'Longitude',
    'District',
    'Instructions',
    'Status',
    'Measurement Text',
    'Documents JSON',
    'Photos JSON',
    'Measurement Images JSON',
    'Share Package JSON',
    'Settings JSON'
  ]);
}

function safeJson_(value) {
  return JSON.stringify(value || []);
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
