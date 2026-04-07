const CONFIG = {
  APP_NAME: 'Bliss TaskPro',
  CREDENTIAL_SHEET_ID: '1RuV_gocgi-DwFpN8uQqwE-MWiwHvXBg1-Ly0gL-ZbEk',
  SITE_ROOT_FOLDER_ID: '1I4xotaTUYN8PRYhfCzDST2OeRs0voiE1',
  APP_URL: 'https://blissinfra.in',
  ALLOWED_ORIGIN: 'https://blissinfra.in'
};

const SHEET_NAMES = {
  masterCredential: 'master_Credential',
  engineerCredential: 'Engineer_Credential'
};

const USER_HEADERS = ['User ID', 'Password', 'Role', 'Display Name', 'Status', 'Session Token', 'Session Updated At'];
const SITE_MASTER_HEADERS = ['Site ID', 'Client', 'Engineer', 'Category', 'Activity', 'Date', 'Location', 'District', 'Instructions', 'Created Date'];
const SITE_ENGINEER_HEADERS = ['Site Engineer Name', 'Status', 'Documents JSON', 'Photos JSON', 'Measurement Text', 'Measurement Images JSON', 'Latitude', 'Longitude', 'Completed Date', 'Rollback Reason'];

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action || '';
  if (action === 'getTask') return jsonOutput(getTaskSnapshot_(params));
  if (action === 'getState') return jsonOutput(getLatestAppState_(params));
  if (action === 'validateSession') return jsonOutput(validateSessionFromParams_(params));
  return jsonOutput({
    ok: true,
    appName: CONFIG.APP_NAME,
    siteRootFolderId: CONFIG.SITE_ROOT_FOLDER_ID
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(payload.action || '').trim();

    if (action === 'login') return jsonOutput(loginUser_(payload.payload || {}));
    if (action === 'validateSession') return jsonOutput(validateSession_(payload));

    const sessionCheck = validateSession_(payload);
    if (!sessionCheck.ok) return jsonOutput(sessionCheck);

    if (action === 'savePdfToDrive') {
      return jsonOutput(savePdfToDrive_(payload.payload || {}));
    }
    if (action === 'deleteDriveFile') {
      return jsonOutput(deleteDriveFile_(payload.payload || {}));
    }
    if (action === 'saveReportFiles') {
      return jsonOutput(saveReportFiles_(payload.payload || {}));
    }

    const task = normalizeTaskRecord_(payload.payload || {});

    let siteWorkspace = null;
    let uploadedFiles = [];
    if (task.siteId) {
      siteWorkspace = ensureSiteWorkspace_(task.siteId);
      uploadedFiles = saveFilesToDrive_(task, siteWorkspace);
      writeSiteTaskSheet_(siteWorkspace, task);
    }

    return jsonOutput({
      ok: true,
      action: action,
      uploadedFiles: uploadedFiles,
      siteWorkspace: siteWorkspace ? siteWorkspaceToObject_(siteWorkspace) : null
    });
  } catch (error) {
    return jsonOutput({
      ok: false,
      message: error.message,
      error: error.message
    });
  }
}

function getTaskSnapshot_(params) {
  const sessionCheck = validateSessionFromParams_(params);
  if (!sessionCheck.ok) return sessionCheck;

  const siteId = String(params.siteId || '').trim();
  if (!siteId) return { ok: false, message: 'Site ID is required.' };

  const siteWorkspace = getSiteWorkspaceBySiteId_(siteId);
  if (!siteWorkspace) return { ok: false, message: 'Site ID workspace not found.' };

  const task = readSiteTaskSheet_(siteWorkspace);
  return {
    ok: true,
    siteId: siteId,
    latestRow: siteTaskToLatestRow_(task),
    documents: listWorkspaceFiles_(siteWorkspace.documentsFolder),
    photos: listWorkspaceFiles_(siteWorkspace.photosFolder),
    measurementImages: listWorkspaceFiles_(siteWorkspace.measurementFolder),
    siteWorkspace: siteWorkspaceToObject_(siteWorkspace)
  };
}

function getLatestAppState_(params) {
  const sessionCheck = validateSessionFromParams_(params);
  if (!sessionCheck.ok) return sessionCheck;

  const tasks = readAllSiteTasks_();
  return {
    ok: true,
    state: {
      options: buildLatestOptions_(tasks),
      settings: {},
      drafts: [],
      tasks: tasks
    }
  };
}

function getCredentialEngineerNames_() {
  const sheet = getCredentialSpreadsheet_().getSheetByName(SHEET_NAMES.engineerCredential);
  if (!sheet) return [];
  ensureHeaders_(sheet, USER_HEADERS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  return dedupeNonEmpty_(values.slice(1).map(function(row) {
    return row[3];
  }));
}

function readAllSiteTasks_() {
  const rootFolder = getRootSiteFolder_();
  const folders = rootFolder.getFolders();
  const tasks = [];

  while (folders.hasNext()) {
    const siteFolder = folders.next();
    const siteId = String(siteFolder.getName() || '').trim();
    if (!siteId) continue;
    const siteWorkspace = getSiteWorkspaceBySiteId_(siteId);
    if (!siteWorkspace) continue;
    const task = readSiteTaskSheet_(siteWorkspace);
    if (!task.siteId) continue;
    tasks.push(task);
  }

  return tasks.sort(function(a, b) {
    return String(a.createdAt || a.updatedAt || '').localeCompare(String(b.createdAt || b.updatedAt || ''));
  });
}

function loginUser_(payload) {
  const requestedRole = String(payload.role || '').toLowerCase();
  const sheetName = requestedRole === 'master' ? SHEET_NAMES.masterCredential : SHEET_NAMES.engineerCredential;
  const sheet = getCredentialSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return { ok: false, message: 'Credential sheet not found: ' + sheetName };

  ensureHeaders_(sheet, USER_HEADERS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { ok: false, message: 'Credential sheet is empty: ' + sheetName };

  const rows = values.slice(1);
  const inputUserId = String(payload.userId || '').trim().toLowerCase();
  const inputPassword = String(payload.password || '').trim();
  const match = rows.find(function(row) {
    return String(row[0] || '').trim().toLowerCase() === inputUserId;
  });

  if (!match) return { ok: false, message: 'User ID not found in ' + sheetName + ': ' + payload.userId };
  if (String(match[1] || '').trim() !== inputPassword) return { ok: false, message: 'Password mismatch for user ID: ' + payload.userId };
  if (String(match[4] || 'ACTIVE').toUpperCase() === 'INACTIVE') return { ok: false, message: 'User is inactive: ' + payload.userId };

  const rowIndex = rows.indexOf(match) + 2;
  const sessionToken = createSessionToken_();
  const sessionUpdatedAt = new Date().toISOString();
  sheet.getRange(rowIndex, 6, 1, 2).setValues([[sessionToken, sessionUpdatedAt]]);

  return {
    ok: true,
    user: {
      userId: match[0],
      role: match[2],
      name: match[3] || match[0]
    },
    sessionToken: sessionToken,
    sessionUpdatedAt: sessionUpdatedAt
  };
}

function validateSessionFromParams_(params) {
  return validateSession_({
    source: params.source || params.role || '',
    userId: params.userId || '',
    sessionToken: params.sessionToken || ''
  });
}

function validateSession_(payload) {
  const requestedRole = String(payload.source || payload.role || '').toLowerCase();
  const userId = String(payload.userId || '').trim();
  const sessionToken = String(payload.sessionToken || '').trim();
  if (!requestedRole || !userId || !sessionToken) {
    return { ok: false, sessionExpired: true, message: 'Missing session details.' };
  }

  const sheetName = requestedRole === 'master' ? SHEET_NAMES.masterCredential : SHEET_NAMES.engineerCredential;
  const sheet = getCredentialSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return { ok: false, sessionExpired: true, message: 'Credential sheet not found: ' + sheetName };

  ensureHeaders_(sheet, USER_HEADERS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { ok: false, sessionExpired: true, message: 'Credential sheet is empty.' };

  const rows = values.slice(1);
  const user = rows.find(function(row) {
    return String(row[0] || '').trim().toLowerCase() === userId.toLowerCase();
  });

  if (!user) return { ok: false, sessionExpired: true, message: 'User session not found.' };

  const activeToken = String(user[5] || '').trim();
  const status = String(user[4] || 'ACTIVE').toUpperCase();
  if (status === 'INACTIVE' || !activeToken || activeToken !== sessionToken) {
    return { ok: false, sessionExpired: true, message: 'Session expired. Please login again.' };
  }

  return {
    ok: true,
    sessionExpired: false,
    user: {
      userId: user[0],
      role: user[2],
      name: user[3] || user[0]
    },
    sessionUpdatedAt: user[6] || ''
  };
}

function saveFilesToDrive_(task, siteWorkspace) {
  const saved = [];
  const mapping = {
    documents: siteWorkspace.documentsFolder,
    photos: siteWorkspace.photosFolder,
    measurementImages: siteWorkspace.measurementFolder
  };

  Object.keys(mapping).forEach(function(groupName) {
    const folder = mapping[groupName];
    (task[groupName] || []).forEach(function(fileItem) {
      if (!fileItem.base64Content) return;
      const fileName = fileItem.storedName || fileItem.originalName || 'upload.bin';
      const existing = findFileByName_(folder, fileName);
      if (existing) {
        saved.push(makeFileDescriptor_(existing, groupName));
        return;
      }
      const blob = Utilities.newBlob(
        Utilities.base64Decode(fileItem.base64Content),
        fileItem.type || 'application/octet-stream',
        fileName
      );
      const file = folder.createFile(blob);
      shareDriveItem_(file);
      saved.push(makeFileDescriptor_(file, groupName));
    });
  });

  return saved;
}

function ensureSiteWorkspace_(siteId) {
  const trimmedSiteId = String(siteId || '').trim();
  if (!trimmedSiteId) throw new Error('Site ID is required to create workspace.');

  const rootFolder = getRootSiteFolder_();
  const siteFolder = getOrCreateFolder_(rootFolder, trimmedSiteId);
  const documentsFolder = getOrCreateFolder_(siteFolder, 'Documents');
  const photosFolder = getOrCreateFolder_(siteFolder, 'Site Photos');
  const measurementFolder = getOrCreateFolder_(siteFolder, 'Measurement Photos');
  const reportsFolder = getOrCreateFolder_(siteFolder, 'Reports');
  const spreadsheet = getOrCreateSpreadsheetInFolder_(siteFolder, trimmedSiteId + '_DataSheet');

  ensureSiteSheet_(spreadsheet, 'Master Entry', SITE_MASTER_HEADERS);
  ensureSiteSheet_(spreadsheet, 'Engineer Entry', SITE_ENGINEER_HEADERS);

  shareDriveItem_(siteFolder);
  shareDriveItem_(documentsFolder);
  shareDriveItem_(photosFolder);
  shareDriveItem_(measurementFolder);
  shareDriveItem_(reportsFolder);
  shareDriveItem_(DriveApp.getFileById(spreadsheet.getId()));

  return {
    siteId: trimmedSiteId,
    siteFolder: siteFolder,
    documentsFolder: documentsFolder,
    photosFolder: photosFolder,
    measurementFolder: measurementFolder,
    reportsFolder: reportsFolder,
    spreadsheet: spreadsheet
  };
}

function getSiteWorkspaceBySiteId_(siteId) {
  const trimmedSiteId = String(siteId || '').trim();
  if (!trimmedSiteId) return null;
  try {
    const rootFolder = getRootSiteFolder_();
    const folders = rootFolder.getFoldersByName(trimmedSiteId);
    if (!folders.hasNext()) return null;
    const siteFolder = folders.next();
    const spreadsheet = findSpreadsheetInFolder_(siteFolder, trimmedSiteId + '_DataSheet');
    if (!spreadsheet) return null;
    return {
      siteId: trimmedSiteId,
      siteFolder: siteFolder,
      documentsFolder: getOrCreateFolder_(siteFolder, 'Documents'),
      photosFolder: getOrCreateFolder_(siteFolder, 'Site Photos'),
      measurementFolder: getOrCreateFolder_(siteFolder, 'Measurement Photos'),
      reportsFolder: getOrCreateFolder_(siteFolder, 'Reports'),
      spreadsheet: spreadsheet
    };
  } catch (error) {
    return null;
  }
}

function writeSiteTaskSheet_(siteWorkspace, task) {
  const currentTask = readSiteTaskSheet_(siteWorkspace);
  const mergedTask = mergeTaskRecords_(currentTask, task);
  const masterSheet = ensureSiteSheet_(siteWorkspace.spreadsheet, 'Master Entry', SITE_MASTER_HEADERS);
  const engineerSheet = ensureSiteSheet_(siteWorkspace.spreadsheet, 'Engineer Entry', SITE_ENGINEER_HEADERS);
  const completedDate = mergedTask.status === 'Completed'
    ? (mergedTask.completedAt || mergedTask.updatedAt || new Date().toISOString())
    : (currentTask.completedAt || '');

  upsertSingleDataRow_(masterSheet, [
    mergedTask.siteId || '',
    mergedTask.client || '',
    mergedTask.engineer || '',
    mergedTask.category || '',
    mergedTask.activity || '',
    mergedTask.date || '',
    mergedTask.location || '',
    mergedTask.district || '',
    mergedTask.instructions || '',
    mergedTask.createdAt || currentTask.createdAt || new Date().toISOString()
  ]);

  upsertSingleDataRow_(engineerSheet, [
    mergedTask.siteEngineerName || currentTask.siteEngineerName || '',
    mergedTask.status || currentTask.status || 'Pending',
    safeJson_(stripTransientFileFields_(mergedTask.documents)),
    safeJson_(stripTransientFileFields_(mergedTask.photos)),
    mergedTask.measurementText || currentTask.measurementText || '',
    safeJson_(stripTransientFileFields_(mergedTask.measurementImages)),
    mergedTask.gps?.latitude || mergedTask.latitude || currentTask.gps?.latitude || currentTask.latitude || '',
    mergedTask.gps?.longitude || mergedTask.longitude || currentTask.gps?.longitude || currentTask.longitude || '',
    completedDate,
    mergedTask.rollbackReason || currentTask.rollbackReason || ''
  ]);
}

function readSiteTaskSheet_(siteWorkspace) {
  const masterSheet = ensureSiteSheet_(siteWorkspace.spreadsheet, 'Master Entry', SITE_MASTER_HEADERS);
  const engineerSheet = ensureSiteSheet_(siteWorkspace.spreadsheet, 'Engineer Entry', SITE_ENGINEER_HEADERS);
  const masterRow = readSingleDataRow_(masterSheet, SITE_MASTER_HEADERS);
  const engineerRow = readSingleDataRow_(engineerSheet, SITE_ENGINEER_HEADERS);
  const status = engineerRow.Status || 'Pending';

  return normalizeTaskRecord_({
    id: toLifecycleTaskId_(siteWorkspace.siteId, status),
    baseTaskId: siteWorkspace.siteId,
    siteId: masterRow['Site ID'] || siteWorkspace.siteId,
    client: masterRow.Client || '',
    engineer: masterRow.Engineer || '',
    category: masterRow.Category || '',
    activity: masterRow.Activity || '',
    date: masterRow.Date || '',
    location: masterRow.Location || '',
    district: masterRow.District || '',
    instructions: masterRow.Instructions || '',
    status: status,
    siteEngineerName: engineerRow['Site Engineer Name'] || '',
    documents: parseJsonArray_(engineerRow['Documents JSON']),
    photos: parseJsonArray_(engineerRow['Photos JSON']),
    measurementText: engineerRow['Measurement Text'] || '',
    measurementImages: parseJsonArray_(engineerRow['Measurement Images JSON']),
    gps: (engineerRow.Latitude || engineerRow.Longitude) ? { latitude: engineerRow.Latitude || '', longitude: engineerRow.Longitude || '' } : null,
    rollbackReason: engineerRow['Rollback Reason'] || '',
    createdAt: masterRow['Created Date'] || '',
    completedAt: engineerRow['Completed Date'] || '',
    updatedAt: engineerRow['Completed Date'] || masterRow['Created Date'] || '',
    siteWorkspace: siteWorkspaceToObject_(siteWorkspace)
  });
}

function siteTaskToLatestRow_(task) {
  return {
    'Site Engineer Name': task.siteEngineerName || '',
    Status: task.status || 'Pending',
    'Measurement Text': task.measurementText || '',
    'GPS Latitude': task.gps?.latitude || task.latitude || '',
    'GPS Longitude': task.gps?.longitude || task.longitude || '',
    'Documents JSON': safeJson_(stripTransientFileFields_(task.documents)),
    'Photos JSON': safeJson_(stripTransientFileFields_(task.photos)),
    'Measurement Images JSON': safeJson_(stripTransientFileFields_(task.measurementImages)),
    'Rollback Reason': task.rollbackReason || ''
  };
}

function buildLatestOptions_(tasks) {
  return {
    clients: dedupeNonEmpty_(['JIO', 'Retail', 'Others'].concat((tasks || []).map(function(task) { return task.client; }))),
    engineers: dedupeNonEmpty_(['Naveen', 'Rocky', 'Sriram'].concat(getCredentialEngineerNames_()).concat((tasks || []).map(function(task) { return task.engineer; }))),
    categories: dedupeNonEmpty_(['Project', 'O&M', 'Others'].concat((tasks || []).map(function(task) { return task.category; }))),
    activities: dedupeNonEmpty_(['Enod B', '5G', 'Upgradation', 'Repair', 'Others'].concat((tasks || []).map(function(task) { return task.activity; }))),
    districts: dedupeNonEmpty_((tasks || []).map(function(task) { return task.district; }))
  };
}

function normalizeTaskRecord_(task) {
  const taskId = String(task.id || '').trim();
  return {
    id: taskId,
    baseTaskId: task.baseTaskId || extractTaskBaseId_(taskId) || task.siteId || '',
    draftId: task.draftId || '',
    client: task.client || '',
    engineer: task.engineer || '',
    category: task.category || '',
    activity: task.activity || '',
    siteId: task.siteId || '',
    date: task.date || '',
    location: task.location || '',
    latitude: task.latitude || '',
    longitude: task.longitude || '',
    district: task.district || '',
    instructions: task.instructions || '',
    status: task.status || 'Pending',
    siteEngineerName: task.siteEngineerName || '',
    documents: Array.isArray(task.documents) ? task.documents : [],
    photos: Array.isArray(task.photos) ? task.photos : [],
    measurementText: task.measurementText || '',
    measurementImages: Array.isArray(task.measurementImages) ? task.measurementImages : [],
    gps: task.gps || null,
    sharePackage: task.sharePackage || null,
    rollbackReason: task.rollbackReason || '',
    createdAt: task.createdAt || '',
    updatedAt: task.updatedAt || '',
    completedAt: task.completedAt || '',
    siteWorkspace: task.siteWorkspace || null
  };
}

function mergeTaskRecords_(baseTask, patchTask) {
  const base = normalizeTaskRecord_(baseTask || {});
  const patch = normalizeTaskRecord_(patchTask || {});
  const siteId = patch.siteId || base.siteId || '';
  const status = patch.status || base.status || 'Pending';
  const id = toLifecycleTaskId_(siteId, status);
  return normalizeTaskRecord_({
    id: id,
    baseTaskId: siteId || patch.baseTaskId || base.baseTaskId || '',
    draftId: patch.draftId || base.draftId || '',
    client: patch.client || base.client || '',
    engineer: patch.engineer || base.engineer || '',
    category: patch.category || base.category || '',
    activity: patch.activity || base.activity || '',
    siteId: siteId,
    date: patch.date || base.date || '',
    location: patch.location || base.location || '',
    latitude: patch.latitude || base.latitude || '',
    longitude: patch.longitude || base.longitude || '',
    district: patch.district || base.district || '',
    instructions: patch.instructions || base.instructions || '',
    status: status,
    siteEngineerName: patch.siteEngineerName || base.siteEngineerName || '',
    documents: pickLatestArray_(patch.documents, base.documents),
    photos: pickLatestArray_(patch.photos, base.photos),
    measurementText: patch.measurementText || base.measurementText || '',
    measurementImages: pickLatestArray_(patch.measurementImages, base.measurementImages),
    gps: patch.gps || base.gps || null,
    sharePackage: patch.sharePackage || base.sharePackage || null,
    rollbackReason: patch.rollbackReason || base.rollbackReason || '',
    createdAt: base.createdAt || patch.createdAt || '',
    updatedAt: patch.updatedAt || base.updatedAt || '',
    completedAt: patch.completedAt || base.completedAt || '',
    siteWorkspace: patch.siteWorkspace || base.siteWorkspace || null
  });
}

function getCredentialSpreadsheet_() {
  if (!CONFIG.CREDENTIAL_SHEET_ID || String(CONFIG.CREDENTIAL_SHEET_ID).indexOf('PASTE_') === 0) {
    throw new Error('Please update CONFIG.CREDENTIAL_SHEET_ID in code.gs');
  }
  return SpreadsheetApp.openById(CONFIG.CREDENTIAL_SHEET_ID);
}

function getRootSiteFolder_() {
  if (!CONFIG.SITE_ROOT_FOLDER_ID || String(CONFIG.SITE_ROOT_FOLDER_ID).indexOf('PASTE_') === 0) {
    throw new Error('Please update CONFIG.SITE_ROOT_FOLDER_ID in code.gs');
  }
  return DriveApp.getFolderById(CONFIG.SITE_ROOT_FOLDER_ID);
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const mismatch = headers.some(function(header, index) {
    return current[index] !== header;
  });
  if (mismatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function ensureSiteSheet_(spreadsheet, sheetName, headers) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName);
  ensureHeaders_(sheet, headers);
  return sheet;
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function getOrCreateFolder_(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(name);
}

function getOrCreateSpreadsheetInFolder_(folder, name) {
  const existing = findSpreadsheetInFolder_(folder, name);
  if (existing) return existing;
  const spreadsheet = SpreadsheetApp.create(name);
  DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);
  return spreadsheet;
}

function findSpreadsheetInFolder_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(file.getId());
    }
  }
  return null;
}

function upsertSingleDataRow_(sheet, values) {
  sheet.getRange(2, 1, 1, values.length).setValues([values]);
}

function readSingleDataRow_(sheet, headers) {
  ensureHeaders_(sheet, headers);
  if (sheet.getLastRow() < 2) {
    return mapRow_(headers, new Array(headers.length).fill(''));
  }
  return mapRow_(headers, sheet.getRange(2, 1, 1, headers.length).getValues()[0]);
}

function findFileByName_(folder, name) {
  const files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

function listWorkspaceFiles_(folder) {
  const files = folder.getFiles();
  const results = [];
  while (files.hasNext()) {
    results.push(makeFileDescriptor_(files.next()));
  }
  return results;
}

function makeFileDescriptor_(file, group) {
  return {
    group: group || '',
    id: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    mimeType: file.getMimeType(),
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400'
  };
}

function stripTransientFileFields_(items) {
  return (items || []).map(function(item) {
    const next = {};
    Object.keys(item || {}).forEach(function(key) {
      if (key === 'base64Content') return;
      next[key] = item[key];
    });
    return next;
  });
}

function pickLatestArray_(preferred, fallback) {
  if (Array.isArray(preferred) && preferred.length) return preferred;
  return Array.isArray(fallback) ? fallback : [];
}

function parseJsonArray_(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function dedupeNonEmpty_(values) {
  const seen = {};
  return (values || []).map(function(value) {
    return String(value || '').trim();
  }).filter(function(value) {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  }).sort();
}

function siteWorkspaceToObject_(siteWorkspace) {
  return {
    siteId: siteWorkspace.siteId,
    siteFolderId: siteWorkspace.siteFolder.getId(),
    documentsFolderId: siteWorkspace.documentsFolder.getId(),
    photosFolderId: siteWorkspace.photosFolder.getId(),
    measurementFolderId: siteWorkspace.measurementFolder.getId(),
    reportsFolderId: siteWorkspace.reportsFolder.getId(),
    spreadsheetId: siteWorkspace.spreadsheet.getId(),
    spreadsheetName: siteWorkspace.spreadsheet.getName()
  };
}

function savePdfToDrive_(payload) {
  const siteId = String(payload.siteId || '').trim();
  const pdfBase64 = String(payload.pdfBase64 || '').trim();
  const fileName = String(payload.fileName || `${siteId}_summary.pdf`).trim();
  if (!siteId) return { ok: false, message: 'Site ID is required to save PDF.' };
  if (!pdfBase64) return { ok: false, message: 'PDF content is required.' };

  const siteWorkspace = ensureSiteWorkspace_(siteId);
  const reportsFolder = siteWorkspace.reportsFolder;
  const existing = findFileByName_(reportsFolder, fileName);
  if (existing) {
    existing.setTrashed(true);
  }

  const blob = Utilities.newBlob(
    Utilities.base64Decode(pdfBase64),
    String(payload.mimeType || 'application/pdf'),
    fileName
  );
  const file = reportsFolder.createFile(blob);
  shareDriveItem_(file);

  return {
    ok: true,
    file: makeFileDescriptor_(file, 'report'),
    siteWorkspace: siteWorkspaceToObject_(siteWorkspace)
  };
}

function deleteDriveFile_(payload) {
  const siteId = String(payload.siteId || '').trim();
  const fileId = String(payload.fileId || '').trim();
  if (!siteId) return { ok: false, message: 'Site ID is required to delete file.' };
  if (!fileId) return { ok: false, message: 'File ID is required to delete file.' };

  const siteWorkspace = ensureSiteWorkspace_(siteId);
  const task = readSiteTaskSheet_(siteWorkspace);
  const nextTask = normalizeTaskRecord_({
    ...task,
    documents: (task.documents || []).filter(function(item) { return String(item.id || '') !== fileId; }),
    photos: (task.photos || []).filter(function(item) { return String(item.id || '') !== fileId; }),
    measurementImages: (task.measurementImages || []).filter(function(item) { return String(item.id || '') !== fileId; }),
    updatedAt: new Date().toISOString()
  });

  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (error) {}

  writeSiteTaskSheet_(siteWorkspace, nextTask);
  return {
    ok: true,
    task: nextTask,
    siteWorkspace: siteWorkspaceToObject_(siteWorkspace)
  };
}

function saveReportFiles_(payload) {
  const siteId = String(payload.siteId || '').trim();
  const pdfBase64 = String(payload.pdfBase64 || '').trim();
  const selectedFileIds = Array.isArray(payload.selectedFileIds) ? payload.selectedFileIds.map(function(id) { return String(id || '').trim(); }).filter(Boolean) : [];
  const fileName = String(payload.fileName || `${siteId}_summary.pdf`).trim();
  if (!siteId) return { ok: false, message: 'Site ID is required to save report files.' };
  if (!pdfBase64) return { ok: false, message: 'PDF content is required.' };

  const siteWorkspace = ensureSiteWorkspace_(siteId);
  const reportsFolder = siteWorkspace.reportsFolder;

  selectedFileIds.forEach(function(fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const existingCopy = findFileByName_(reportsFolder, file.getName());
      if (existingCopy) existingCopy.setTrashed(true);
      const copied = file.makeCopy(file.getName(), reportsFolder);
      shareDriveItem_(copied);
    } catch (error) {}
  });

  const existingPdf = findFileByName_(reportsFolder, fileName);
  if (existingPdf) existingPdf.setTrashed(true);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(pdfBase64),
    String(payload.mimeType || 'application/pdf'),
    fileName
  );
  const pdfFile = reportsFolder.createFile(blob);
  shareDriveItem_(pdfFile);

  return {
    ok: true,
    file: makeFileDescriptor_(pdfFile, 'report'),
    copiedFileIds: selectedFileIds,
    siteWorkspace: siteWorkspaceToObject_(siteWorkspace)
  };
}

function shareDriveItem_(item) {
  try {
    item.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {}
}

function mapRow_(headers, row) {
  const output = {};
  headers.forEach(function(header, index) {
    output[header] = row[index];
  });
  return output;
}

function extractTaskBaseId_(taskId) {
  return String(taskId || '').trim().replace(/^(draft|task|wip|complete)-/i, '');
}

function toLifecycleTaskId_(seed, statusOrStage) {
  const baseId = String(seed || '').trim();
  const stage = String(statusOrStage || '').trim().toLowerCase();
  const prefix = stage === 'completed' || stage === 'complete'
    ? 'complete'
    : stage === 'wip'
      ? 'wip'
      : stage === 'pending' || stage === 'task'
        ? 'task'
        : 'draft';
  return baseId ? prefix + '-' + baseId : '';
}

function createSessionToken_() {
  return Utilities.getUuid() + '-' + new Date().getTime();
}

function safeJson_(value) {
  return JSON.stringify(value || []);
}

function jsonOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
