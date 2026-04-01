const CONFIG = {
  APP_NAME: 'Bliss TaskPro',
  CREDENTIAL_SHEET_ID: '1RuV_gocgi-DwFpN8uQqwE-MWiwHvXBg1-Ly0gL-ZbEk',
  ENTRY_SHEET_ID: '13FpNMiOSQqVDTP_S-bmoNiGC2zSM-D_2_r1f5TfjD9I',
  DOCUMENT_FOLDER_ID: '1LRqfC3LAmN8s7kAKXjKhTYawhW2pcYBb',
  PHOTO_FOLDER_ID: '1YK4tt9njxSTnZeOnd4sw4qeBsA9g5Eri',
  MEASUREMENT_FOLDER_ID: '1k65ph5AwZXXa_O2m-suK6Fu0E71vRL5V',
  APP_URL: 'PASTE_DEPLOYED_APPS_SCRIPT_WEB_APP_URL_HERE',
  ALLOWED_ORIGIN: '*'
};

const SHEET_NAMES = {
  master: 'Master_Sheet',
  engineer: 'Engineer_Sheet',
  masterCredential: 'master_Credential',
  engineerCredential: 'Engineer_Credential',
  appState: 'App_State'
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

const USER_HEADERS = ['User ID', 'Password', 'Role', 'Display Name', 'Status', 'Session Token', 'Session Updated At'];
const APP_STATE_HEADERS = ['Timestamp', 'Source', 'State JSON'];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'getTask') {
    return jsonOutput(getTaskSnapshot_(e.parameter || {}));
  }
  if (action === 'getState') {
    return jsonOutput(getLatestAppState_(e.parameter || {}));
  }
  if (action === 'validateSession') {
    return jsonOutput(validateSessionFromParams_(e.parameter || {}));
  }
  return jsonOutput({
    ok: true,
    appName: CONFIG.APP_NAME,
    appUrl: CONFIG.APP_URL,
    sheetId: CONFIG.ENTRY_SHEET_ID,
    documentFolderId: CONFIG.DOCUMENT_FOLDER_ID,
    photoFolderId: CONFIG.PHOTO_FOLDER_ID,
    measurementFolderId: CONFIG.MEASUREMENT_FOLDER_ID
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
    if (action === 'validateSession') {
      return jsonOutput(validateSession_(activeSettings, payload));
    }

    const sessionCheck = validateSession_(activeSettings, payload);
    if (!sessionCheck.ok) {
      return jsonOutput(sessionCheck);
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
    saveAppState_(activeSettings, source, state);

    return jsonOutput({
      ok: true,
      action,
      uploadedFiles
    });
  } catch (error) {
    return jsonOutput({
      ok: false,
      message: error.message,
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
    measurementImages: getMeasurementFolder_(settings)
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

function getSpreadsheetById_(sheetId, errorMessage) {
  if (!sheetId || sheetId.indexOf('PASTE_') === 0) {
    throw new Error(errorMessage);
  }
  return SpreadsheetApp.openById(sheetId);
}

function getSpreadsheet_(settings) {
  const sheetId = CONFIG.ENTRY_SHEET_ID || settings.googleSheetId;
  return getSpreadsheetById_(sheetId, 'Please update CONFIG.ENTRY_SHEET_ID in code.gs');
}

function getCredentialSpreadsheet_() {
  const sheetId = CONFIG.CREDENTIAL_SHEET_ID;
  return getSpreadsheetById_(sheetId, 'Please update CONFIG.CREDENTIAL_SHEET_ID in code.gs');
}

function getMasterTaskSpreadsheet_(settings) {
  const sheetId = CONFIG.ENTRY_SHEET_ID || settings.googleSheetId;
  return getSpreadsheetById_(sheetId, 'Please update CONFIG.ENTRY_SHEET_ID in code.gs');
}

function getEngineerTaskSpreadsheet_(settings) {
  const sheetId = CONFIG.ENTRY_SHEET_ID || settings.googleSheetId;
  return getSpreadsheetById_(sheetId, 'Please update CONFIG.ENTRY_SHEET_ID in code.gs');
}

function getAppStateSpreadsheet_(settings) {
  const sheetId = CONFIG.ENTRY_SHEET_ID || settings.googleSheetId;
  return getSpreadsheetById_(sheetId, 'Please update CONFIG.ENTRY_SHEET_ID in code.gs');
}

function getAppSheet_(settings, source) {
  const spreadsheet = source === 'engineer'
    ? getEngineerTaskSpreadsheet_(settings)
    : getMasterTaskSpreadsheet_(settings);
  const name = source === 'engineer' ? SHEET_NAMES.engineer : SHEET_NAMES.master;
  return getOrCreateSheet_(spreadsheet, name);
}

function getCredentialSheet_(settings, role) {
  var name = role === 'master' ? SHEET_NAMES.masterCredential : SHEET_NAMES.engineerCredential;
  return getOrCreateSheet_(getCredentialSpreadsheet_(), name);
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function getDocumentFolder_(settings) {
  return getDriveFolderWithFallback_(
    CONFIG.DOCUMENT_FOLDER_ID,
    settings.googleDocumentFolderId,
    'Please update document folder ID in code.gs'
  );
}

function getPhotoFolder_(settings) {
  return getDriveFolderWithFallback_(
    CONFIG.PHOTO_FOLDER_ID,
    settings.googlePhotoFolderId,
    'Please update photo folder ID in code.gs'
  );
}

function getMeasurementFolder_(settings) {
  return getDriveFolderWithFallback_(
    CONFIG.MEASUREMENT_FOLDER_ID,
    settings.googleMeasurementFolderId,
    'Please update measurement folder ID in code.gs'
  );
}

function getDriveFolderWithFallback_(preferredId, fallbackId, errorMessage) {
  var candidates = [preferredId, fallbackId].filter(function(id) {
    return !!id && String(id).indexOf('PASTE_') !== 0;
  });
  var lastError = null;
  for (var i = 0; i < candidates.length; i++) {
    try {
      return DriveApp.getFolderById(candidates[i]);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError ? lastError.message : errorMessage);
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
  const sessionCheck = validateSessionFromParams_(params);
  if (!sessionCheck.ok) {
    return sessionCheck;
  }
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
    documents: listFilesBySiteId_(getDocumentFolder_(settings), siteId),
    photos: listFilesBySiteId_(getPhotoFolder_(settings), siteId)
  };
}

function mapRow_(header, row) {
  const out = {};
  header.forEach(function(key, index) {
    out[key] = row[index];
  });
  return out;
}

function listFilesBySiteId_(folder, siteId) {
  const files = folder.getFiles();
  const results = [];
  const token = '_' + String(siteId) + '_';
  while (files.hasNext()) {
    const file = files.next();
    const name = String(file.getName());
    const startsWithSiteId = name.indexOf(String(siteId) + '_') === 0;
    const containsSiteIdToken = name.indexOf(token) >= 0;
    if (!startsWithSiteId && !containsSiteIdToken) continue;
    results.push({
      id: file.getId(),
      name: name,
      url: file.getUrl(),
      mimeType: file.getMimeType(),
      thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400'
    });
  }
  return results;
}

function ensureAppSheet_(sheet, source) {
  if (source === 'engineer') {
    ensureHeaders_(sheet, ENGINEER_HEADERS);
  } else {
    ensureHeaders_(sheet, MASTER_HEADERS);
  }
}

function ensureCredentialSheet_(sheet) {
  ensureHeaders_(sheet, USER_HEADERS);
}

function ensureAppStateSheet_(sheet) {
  ensureHeaders_(sheet, APP_STATE_HEADERS);
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const mismatch = headers.some(function(header, index) { return current[index] !== header; });
    if (mismatch) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
}

function getStateSheet_(settings) {
  return getOrCreateSheet_(getAppStateSpreadsheet_(settings), SHEET_NAMES.appState);
}

function saveAppState_(settings, source, state) {
  if (!state) return;
  const sheet = getStateSheet_(settings);
  ensureAppStateSheet_(sheet);
  sheet.appendRow([
    new Date(),
    source || '',
    JSON.stringify(state || {})
  ]);
}

function getLatestAppState_(params) {
  const settings = {
    googleSheetId: params.sheetId || '',
    googleDocumentFolderId: params.documentFolderId || '',
    googlePhotoFolderId: params.photoFolderId || ''
  };
  const sessionCheck = validateSessionFromParams_(params);
  if (!sessionCheck.ok) {
    return sessionCheck;
  }
  const sheet = getStateSheet_(settings);
  ensureAppStateSheet_(sheet);
  const values = sheet.getDataRange().getValues();
  var latestState = null;
  if (values.length > 1) {
    const latest = values[values.length - 1];
    try {
      latestState = JSON.parse(String(latest[2] || '{}'));
    } catch (error) {
      return {
        ok: false,
        message: 'Invalid state JSON in App_State sheet.'
      };
    }
  }
  return {
    ok: true,
    state: buildLatestMergedState_(settings, latestState)
  };
}

function buildLatestMergedState_(settings, baseState) {
  var state = normalizeAppState_(baseState || {});
  var latestMasterTasks = getLatestTasksFromSheet_(getAppSheet_(settings, 'master'), 'master');
  var latestEngineerTasks = getLatestTasksFromSheet_(getAppSheet_(settings, 'engineer'), 'engineer');
  var taskMap = {};

  state.tasks.forEach(function(task) {
    if (!task || !task.id || !task.siteId) return;
    var taskKey = task.baseTaskId || extractTaskBaseId_(task.id);
    if (!taskKey) return;
    taskMap[taskKey] = normalizeTaskRecord_(task);
  });

  latestMasterTasks.forEach(function(task) {
    if (!task || !task.id) return;
    taskMap[task.id] = mergeTaskRecords_(taskMap[task.id], task);
  });

  latestEngineerTasks.forEach(function(task) {
    if (!task || !task.id) return;
    taskMap[task.id] = mergeTaskRecords_(taskMap[task.id], task);
  });

  state.tasks = Object.keys(taskMap).map(function(key) {
    return normalizeTaskRecord_(taskMap[key]);
  }).filter(function(task) {
    return !!String(task.siteId || '').trim();
  }).sort(function(a, b) {
    return String(a.createdAt || a.updatedAt || '').localeCompare(String(b.createdAt || b.updatedAt || ''));
  });

  state.options = buildLatestOptions_(state);
  return state;
}

function buildLatestOptions_(state) {
  var options = state.options || {};
  return {
    clients: dedupeNonEmpty_(['JIO', 'Retail', 'Others'].concat(options.clients || []).concat(state.tasks.map(function(task) { return task.client; }))),
    engineers: dedupeNonEmpty_(['Naveen', 'Rocky', 'Sriram'].concat(options.engineers || []).concat(state.tasks.map(function(task) { return task.engineer; }))),
    categories: dedupeNonEmpty_(['Project', 'O&M', 'Others'].concat(options.categories || []).concat(state.tasks.map(function(task) { return task.category; }))),
    activities: dedupeNonEmpty_(['Enod B', '5G', 'Upgradation', 'Repair', 'Others'].concat(options.activities || []).concat(state.tasks.map(function(task) { return task.activity; }))),
    districts: dedupeNonEmpty_((options.districts || []).concat(state.tasks.map(function(task) { return task.district; })))
  };
}

function dedupeNonEmpty_(values) {
  var seen = {};
  return (values || [])
    .map(function(value) { return String(value || '').trim(); })
    .filter(function(value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    })
    .sort();
}

function normalizeAppState_(state) {
  return {
    options: {
      clients: Array.isArray(state.options && state.options.clients) ? state.options.clients : ['JIO', 'Retail', 'Others'],
      engineers: Array.isArray(state.options && state.options.engineers) ? state.options.engineers : ['Naveen', 'Rocky', 'Sriram'],
      categories: Array.isArray(state.options && state.options.categories) ? state.options.categories : ['Project', 'O&M', 'Others'],
      activities: Array.isArray(state.options && state.options.activities) ? state.options.activities : ['Enod B', '5G', 'Upgradation', 'Repair', 'Others'],
      districts: Array.isArray(state.options && state.options.districts) ? state.options.districts : []
    },
    settings: state.settings || {},
    drafts: Array.isArray(state.drafts) ? state.drafts : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : []
  };
}

function getLatestTasksFromSheet_(sheet, source) {
  ensureAppSheet_(sheet, source);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var header = values.shift();
  var latestByTaskId = {};

  values.forEach(function(row) {
    var mapped = mapRow_(header, row);
    var taskId = String(mapped['Task ID'] || '').trim();
    var taskKey = extractTaskBaseId_(taskId);
    var siteId = String(mapped['Site ID'] || '').trim();
    if (!taskKey || !siteId) return;
    latestByTaskId[taskKey] = source === 'engineer'
      ? engineerRowToTask_(mapped)
      : masterRowToTask_(mapped);
  });

  return Object.keys(latestByTaskId).map(function(taskKey) {
    return latestByTaskId[taskKey];
  });
}

function masterRowToTask_(row) {
  var taskId = row['Task ID'] || '';
  return normalizeTaskRecord_({
    id: taskId,
    baseTaskId: extractTaskBaseId_(taskId),
    siteId: row['Site ID'] || '',
    client: row.Client || '',
    engineer: row.Engineer || '',
    category: row.Category || '',
    activity: row.Activity || '',
    date: row['Task Date'] || '',
    location: row.Location || '',
    latitude: row.Latitude || '',
    longitude: row.Longitude || '',
    district: row.District || '',
    instructions: row.Instructions || '',
    status: row.Status || 'Pending',
    rollbackReason: row['Rollback Reason'] || '',
    updatedAt: toIsoString_(row.Timestamp)
  });
}

function engineerRowToTask_(row) {
  var taskId = row['Task ID'] || '';
  return normalizeTaskRecord_({
    id: taskId,
    baseTaskId: extractTaskBaseId_(taskId),
    siteId: row['Site ID'] || '',
    engineer: row.Engineer || '',
    siteEngineerName: row['Site Engineer Name'] || '',
    status: row.Status || '',
    date: row['Task Date'] || '',
    location: row.Location || '',
    district: row.District || '',
    measurementText: row['Measurement Text'] || '',
    documents: parseJsonArray_(row['Documents JSON']),
    photos: parseJsonArray_(row['Photos JSON']),
    measurementImages: parseJsonArray_(row['Measurement Images JSON']),
    gps: (row['GPS Latitude'] || row['GPS Longitude']) ? {
      latitude: row['GPS Latitude'] || '',
      longitude: row['GPS Longitude'] || ''
    } : null,
    updatedAt: toIsoString_(row.Timestamp)
  });
}

function mergeTaskRecords_(baseTask, patchTask) {
  var base = normalizeTaskRecord_(baseTask || {});
  var patch = normalizeTaskRecord_(patchTask || {});
  return normalizeTaskRecord_({
    id: patch.id || base.id || '',
    baseTaskId: patch.baseTaskId || base.baseTaskId || extractTaskBaseId_(patch.id || base.id || ''),
    draftId: patch.draftId || base.draftId || '',
    client: patch.client || base.client || '',
    engineer: patch.engineer || base.engineer || '',
    category: patch.category || base.category || '',
    activity: patch.activity || base.activity || '',
    siteId: patch.siteId || base.siteId || '',
    date: patch.date || base.date || '',
    location: patch.location || base.location || '',
    latitude: patch.latitude || base.latitude || '',
    longitude: patch.longitude || base.longitude || '',
    district: patch.district || base.district || '',
    instructions: patch.instructions || base.instructions || '',
    status: patch.status || base.status || 'Pending',
    siteEngineerName: patch.siteEngineerName || base.siteEngineerName || '',
    documents: pickLatestArray_(patch.documents, base.documents),
    photos: pickLatestArray_(patch.photos, base.photos),
    measurementText: patch.measurementText || base.measurementText || '',
    measurementImages: pickLatestArray_(patch.measurementImages, base.measurementImages),
    gps: patch.gps || base.gps || null,
    sharePackage: patch.sharePackage || base.sharePackage || null,
    rollbackReason: patch.rollbackReason || base.rollbackReason || '',
    createdAt: base.createdAt || patch.createdAt || patch.updatedAt || '',
    updatedAt: patch.updatedAt || base.updatedAt || ''
  });
}

function normalizeTaskRecord_(task) {
  var taskId = task.id || '';
  return {
    id: taskId,
    baseTaskId: task.baseTaskId || extractTaskBaseId_(taskId),
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
    updatedAt: task.updatedAt || ''
  };
}

function extractTaskBaseId_(taskId) {
  return String(taskId || '').trim().replace(/^(draft|task|wip|complete)-/i, '');
}

function pickLatestArray_(preferred, fallback) {
  if (Array.isArray(preferred) && preferred.length) return preferred;
  return Array.isArray(fallback) ? fallback : [];
}

function parseJsonArray_(value) {
  try {
    var parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function loginUser_(settings, payload) {
  const requestedRole = String(payload.role || '').toLowerCase();
  const spreadsheet = getCredentialSpreadsheet_();
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

  var userRowIndex = rows.indexOf(user) + 2;
  var sessionToken = createSessionToken_();
  var sessionUpdatedAt = new Date().toISOString();
  sheet.getRange(userRowIndex, 6, 1, 2).setValues([[sessionToken, sessionUpdatedAt]]);

  return {
    ok: true,
    user: {
      userId: user[0],
      role: user[2],
      name: user[3] || user[0]
    },
    sessionToken: sessionToken,
    sessionUpdatedAt: sessionUpdatedAt
  };
}

function validateSessionFromParams_(params) {
  const settings = {
    googleSheetId: params.sheetId || '',
    googleDocumentFolderId: params.documentFolderId || '',
    googlePhotoFolderId: params.photoFolderId || ''
  };
  return validateSession_(settings, {
    source: params.source || params.role || '',
    userId: params.userId || '',
    sessionToken: params.sessionToken || ''
  });
}

function validateSession_(settings, payload) {
  var requestedRole = String(payload.source || payload.role || '').toLowerCase();
  var userId = String(payload.userId || '').trim();
  var sessionToken = String(payload.sessionToken || '').trim();
  if (!requestedRole || !userId || !sessionToken) {
    return {
      ok: false,
      sessionExpired: true,
      message: 'Missing session details.'
    };
  }

  var sheet = getCredentialSheet_(settings, requestedRole === 'master' ? 'master' : 'engineer');
  ensureCredentialSheet_(sheet);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return {
      ok: false,
      sessionExpired: true,
      message: 'Credential sheet is empty.'
    };
  }

  var rows = values.slice(1);
  var user = rows.find(function(row) {
    return String(row[0] || '').trim().toLowerCase() === userId.toLowerCase();
  });
  if (!user) {
    return {
      ok: false,
      sessionExpired: true,
      message: 'User session not found.'
    };
  }

  var activeToken = String(user[5] || '').trim();
  var status = String(user[4] || 'ACTIVE').toUpperCase();
  if (status === 'INACTIVE' || !activeToken || activeToken !== sessionToken) {
    return {
      ok: false,
      sessionExpired: true,
      message: 'Session expired. Please login again.'
    };
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

function createSessionToken_() {
  return Utilities.getUuid() + '-' + new Date().getTime();
}

function toIsoString_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value);
}

function safeJson_(value) {
  return JSON.stringify(value || []);
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
