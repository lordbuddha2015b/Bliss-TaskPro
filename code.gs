const CONFIG = {
  APP_NAME: 'Bliss TaskPro',
  SHEET_ID: 'PASTE_GOOGLE_SHEET_ID_HERE',
  DOCUMENT_FOLDER_ID: 'PASTE_DOCUMENT_FOLDER_ID_HERE',
  PHOTO_FOLDER_ID: 'PASTE_PHOTO_FOLDER_ID_HERE',
  APP_URL: 'PASTE_DEPLOYED_APPS_SCRIPT_WEB_APP_URL_HERE',
  ALLOWED_ORIGIN: '*'
};

const SHEET_NAMES = {
  master: 'Master_Sheet',
  engineer: 'Engineer_Sheet',
  masterCredential: 'master_Credential',
  engineerCredential: 'Engineer_Credential'
};

const MASTER_HEADERS = [
  'Timestamp', 'Action', 'User ID', 'Task ID', 'Site ID', 'Client', 'Engineer',
  'Category', 'Activity', 'Task Date', 'Location', 'Latitude', 'Longitude',
  'District', 'Instructions', 'Status', 'Rollback Reason', 'Settings JSON'
];

const ENGINEER_HEADERS = [
  'Timestamp', 'Action', 'User ID', 'Task ID', 'Site ID', 'Engineer', 'Site Engineer Name',
  'Status', 'Task Date', 'Location', 'District', 'GPS Latitude', 'GPS Longitude',
  'Measurement Text', 'Documents JSON', 'Photos JSON', 'Measurement Images JSON', 'Settings JSON'
];

const USER_HEADERS = ['User ID', 'Password', 'Role', 'Display Name', 'Status'];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'getTask') {
    return jsonOutput(getTaskSnapshot_(e.parameter || {}));
  }
  return jsonOutput({
    ok: true,
    appName: CONFIG.APP_NAME,
    appUrl: CONFIG.APP_URL,
    sheetId: CONFIG.SHEET_ID,
    documentFolderId: CONFIG.DOCUMENT_FOLDER_ID,
    photoFolderId: CONFIG.PHOTO_FOLDER_ID
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = payload.action || 'unknown';
    const source = payload.source || 'unknown';
    const state = payload.state || {};
    const task = payload.payload || {};
    const activeSettings = payload.activeSettings || {};

    if (action === 'login') {
      return jsonOutput(loginUser_(activeSettings, task));
    }

    const sheet = getAppSheet_(activeSettings, source);
    ensureAppSheet_(sheet, source);

    const row = buildRow_({
      action,
      source,
      task,
      state,
      userId: payload.userId || ''
    });

    sheet.appendRow(row);

    const uploadedFiles = saveFilesToDrive_(task, activeSettings);

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
  if (input.source === 'engineer') {
    return [
      new Date(), input.action || '', input.userId || '', task.id || '', task.siteId || '',
      task.engineer || '', task.siteEngineerName || '', task.status || '', task.date || '',
      task.location || '', task.district || '', task.gps?.latitude || '', task.gps?.longitude || '',
      task.measurementText || '', safeJson_(task.documents || []), safeJson_(task.photos || []),
      safeJson_(task.measurementImages || []), safeJson_(input.state?.settings?.engineer || {})
    ];
  }

  return [
    new Date(), input.action || '', input.userId || '', task.id || '', task.siteId || '',
    task.client || '', task.engineer || '', task.category || '', task.activity || '', task.date || '',
    task.location || '', task.latitude || task.gps?.latitude || '', task.longitude || task.gps?.longitude || '',
    task.district || '', task.instructions || '', task.status || '', task.rollbackReason || '',
    safeJson_(input.state?.settings?.master || {})
  ];
}

function saveFilesToDrive_(task, settings) {
  const saved = [];
  const mapping = {
    documents: getDocumentFolder_(settings),
    photos: getPhotoFolder_(settings),
    measurementImages: getPhotoFolder_(settings)
  };

  Object.keys(mapping).forEach(function(groupName) {
    const folder = mapping[groupName];
    (task[groupName] || []).forEach(function(fileItem) {
      if (!fileItem.base64Content) return;
      const existing = findFileByName_(folder, fileItem.storedName || fileItem.originalName || 'upload.bin');
      if (existing) {
        saved.push({
          group: groupName,
          name: existing.getName(),
          url: existing.getUrl(),
          id: existing.getId()
        });
        return;
      }
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

function getSpreadsheet_(settings) {
  const sheetId = settings.googleSheetId || CONFIG.SHEET_ID;
  if (!sheetId || sheetId.indexOf('PASTE_') === 0) {
    throw new Error('Please update CONFIG.SHEET_ID in code.gs');
  }
  return SpreadsheetApp.openById(sheetId);
}

function getAppSheet_(settings, source) {
  const spreadsheet = getSpreadsheet_(settings);
  const name = source === 'engineer' ? SHEET_NAMES.engineer : SHEET_NAMES.master;
  return getOrCreateSheet_(spreadsheet, name);
}

function getCredentialSheet_(settings, role) {
  var name = role === 'master' ? SHEET_NAMES.masterCredential : SHEET_NAMES.engineerCredential;
  return getOrCreateSheet_(getSpreadsheet_(settings), name);
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function getDocumentFolder_(settings) {
  const folderId = settings.googleDocumentFolderId || CONFIG.DOCUMENT_FOLDER_ID;
  if (!folderId || folderId.indexOf('PASTE_') === 0) {
    throw new Error('Please update document folder ID in code.gs');
  }
  return DriveApp.getFolderById(folderId);
}

function getPhotoFolder_(settings) {
  const folderId = settings.googlePhotoFolderId || CONFIG.PHOTO_FOLDER_ID;
  if (!folderId || folderId.indexOf('PASTE_') === 0) {
    throw new Error('Please update photo folder ID in code.gs');
  }
  return DriveApp.getFolderById(folderId);
}

function findFileByName_(folder, name) {
  const files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

function getTaskSnapshot_(params) {
  const settings = {
    googleSheetId: params.sheetId || '',
    googleDocumentFolderId: params.documentFolderId || '',
    googlePhotoFolderId: params.photoFolderId || ''
  };
  const siteId = params.siteId || '';
  const sheet = getOrCreateSheet_(getSpreadsheet_(settings), SHEET_NAMES.engineer);
  const values = sheet.getDataRange().getValues();
  const header = values.shift();
  const latest = values.reverse().find(function(row) {
    return String(row[4] || '') === String(siteId);
  });

  return {
    ok: true,
    siteId: siteId,
    latestRow: latest ? mapRow_(header, latest) : null,
    documents: listFilesByPrefix_(getDocumentFolder_(settings), siteId + '_'),
    photos: listFilesByPrefix_(getPhotoFolder_(settings), siteId + '_')
  };
}

function mapRow_(header, row) {
  const out = {};
  header.forEach(function(key, index) {
    out[key] = row[index];
  });
  return out;
}

function listFilesByPrefix_(folder, prefix) {
  const files = folder.getFiles();
  const results = [];
  while (files.hasNext()) {
    const file = files.next();
    if (String(file.getName()).indexOf(prefix) !== 0) continue;
    results.push({
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400'
    });
  }
  return results;
}

function ensureAppSheet_(sheet, source) {
  if (source === 'engineer') {
    ensureHeadersAndStyle_(sheet, ENGINEER_HEADERS, '#AE445A', '#F7DDE3');
  } else {
    ensureHeadersAndStyle_(sheet, MASTER_HEADERS, '#4B4376', '#E8BCB9');
  }
}

function ensureCredentialSheet_(sheet) {
  ensureHeadersAndStyle_(sheet, USER_HEADERS, '#2F6690', '#D9EEF9');
}

function ensureHeadersAndStyle_(sheet, headers, headerColor, bandColor) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const mismatch = headers.some(function(header, index) { return current[index] !== header; });
    if (mismatch) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground(headerColor).setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), headers.length).setBackground(bandColor);
  }
  for (var i = 1; i <= headers.length; i++) {
    sheet.setColumnWidth(i, 170);
  }
}

function loginUser_(settings, payload) {
  const requestedRole = String(payload.role || '').toLowerCase();
  const spreadsheet = getSpreadsheet_(settings);
  const sheetName = requestedRole === 'master' ? SHEET_NAMES.masterCredential : SHEET_NAMES.engineerCredential;
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    return { ok: false, message: 'Credential sheet not found: ' + sheetName };
  }
  ensureCredentialSheet_(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { ok: false, message: 'Credential sheet is empty: ' + sheetName };
  }
  const rows = values.slice(1);
  const inputUserId = String(payload.userId || '').trim().toLowerCase();
  const inputPassword = String(payload.password || '').trim();
  const matchingUser = rows.find(function(row) {
    return String(row[0] || '').trim().toLowerCase() === inputUserId;
  });
  if (!matchingUser) {
    return { ok: false, message: 'User ID not found in ' + sheetName + ': ' + payload.userId };
  }
  const rowPassword = String(matchingUser[1] || '').trim();
  if (rowPassword !== inputPassword) {
    return { ok: false, message: 'Password mismatch for user ID: ' + payload.userId };
  }
  const status = String(matchingUser[4] || 'ACTIVE').toUpperCase();
  if (status === 'INACTIVE') {
    return { ok: false, message: 'User is inactive: ' + payload.userId };
  }
  const user = rows.find(function(row) {
    const rowUserId = String(row[0] || '').trim().toLowerCase();
    const rowRole = String(row[2] || '').trim().toLowerCase();
    const isMasterRow = rowRole === 'master' || rowRole.indexOf('master') >= 0;
    const roleMatches = requestedRole === 'master' ? isMasterRow : !isMasterRow;

    return rowUserId === inputUserId
      && String(row[1] || '').trim() === inputPassword
      && roleMatches
      && String(row[4] || 'ACTIVE').toUpperCase() !== 'INACTIVE';
  });

  if (!user) {
    return { ok: false, message: 'Role mismatch in ' + sheetName + ' for user ID: ' + payload.userId };
  }

  return {
    ok: true,
    user: {
      userId: user[0],
      role: user[2],
      name: user[3] || user[0]
    }
  };
}

function safeJson_(value) {
  return JSON.stringify(value || []);
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
