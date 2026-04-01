(function () {
  const STORAGE_KEY = "bliss-taskpro-state-v2";
  const SETTINGS_KEY = "bliss-taskpro-settings-v1";
  const MASTER_SESSION_KEY = "bliss-taskpro-master-session";
  const ENGINEER_SESSION_KEY = "bliss-taskpro-engineer-session";

  const defaults = {
    options: {
      clients: ["JIO", "Retail", "Others"],
      engineers: ["Naveen", "Rocky", "Sriram"],
      categories: ["Project", "O&M", "Others"],
      activities: ["Enod B", "5G", "Upgradation", "Repair", "Others"],
      districts: []
    },
    settings: {
      master: {
        googleScriptUrl: "",
        googleSheetId: "",
        googleDocumentFolderId: "",
        googlePhotoFolderId: "",
        googleMeasurementFolderId: "",
        autoSyncEnabled: false
      },
      engineer: {
        googleScriptUrl: "",
        googleSheetId: "",
        googleDocumentFolderId: "",
        googlePhotoFolderId: "",
        googleMeasurementFolderId: "",
        autoSyncEnabled: false
      }
    },
    drafts: [],
    tasks: []
  };

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(defaults));
  }

  function readState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const storedSettings = readSettings();
    if (!raw) {
      const clean = cloneDefaults();
      clean.settings = normalizeSettings(storedSettings, clean.settings);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      return clean;
    }

    try {
      const parsed = JSON.parse(raw);
      const base = cloneDefaults();
      return {
        options: normalizeOptions(parsed.options, base.options),
        settings: normalizeSettings(storedSettings || parsed.settings, base.settings),
        drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
      };
    } catch (error) {
      const clean = cloneDefaults();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      return clean;
    }
  }

  function writeState(state) {
    writeSettings(state.settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStateForStorage(state)));
    return state;
  }

  function sanitizeStateForStorage(state) {
    return {
      ...state,
      tasks: (state.tasks || []).map((task) => ({
        ...task,
        documents: (task.documents || []).map(stripFileContent),
        photos: (task.photos || []).map(stripFileContent),
        measurementImages: (task.measurementImages || []).map(stripFileContent)
      }))
    };
  }

  function stripFileContent(file) {
    if (!file || typeof file !== "object") return file;
    const { base64Content, previewUrl, ...rest } = file;
    return rest;
  }

  function readSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function writeSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function normalizeOptions(input, fallback) {
    const base = JSON.parse(JSON.stringify(fallback));
    const next = input || {};
    return {
      clients: mergeOptionList(base.clients, next.clients),
      engineers: mergeOptionList(base.engineers, next.engineers),
      categories: mergeOptionList(base.categories, next.categories),
      activities: mergeOptionList(base.activities, next.activities),
      districts: mergeOptionList(base.districts, next.districts)
    };
  }

  function mergeOptionList(baseList, nextList) {
    const seen = new Set();
    return [...(Array.isArray(baseList) ? baseList : []), ...(Array.isArray(nextList) ? nextList : [])]
      .map((item) => String(item || "").trim())
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  function clearLocalCache() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    sessionStorage.removeItem(MASTER_SESSION_KEY);
    sessionStorage.removeItem(ENGINEER_SESSION_KEY);
  }

  function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function extractTaskBaseId(taskId) {
    const value = String(taskId || "").trim();
    if (!value) return "";
    return value.replace(/^(draft|task|wip|complete)-/i, "");
  }

  function toLifecycleTaskId(taskId, statusOrStage) {
    const baseId = extractTaskBaseId(taskId);
    const rawStage = String(statusOrStage || "").trim().toLowerCase();
    const prefix = rawStage === "completed" || rawStage === "complete"
      ? "complete"
      : rawStage === "wip"
        ? "wip"
        : rawStage === "pending" || rawStage === "task"
          ? "task"
          : "draft";
    return baseId ? `${prefix}-${baseId}` : "";
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function statusClass(status) {
    if (status === "WIP") return "status-wip";
    if (status === "Completed") return "status-completed";
    return "status-pending";
  }

  function setOptions(select, items, placeholder) {
    if (!select) return;
    const head = placeholder ? `<option value="">${placeholder}</option>` : "";
    select.innerHTML = `${head}${items.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  }

  function emptyMarkup(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function ensurePrefixedFiles(siteId, files, extra) {
    return Array.from(files || []).map((file) => ({
      id: uid("file"),
      originalName: file.name,
      storedName: `${siteId}_${file.name}`,
      type: file.type || "application/octet-stream",
      size: file.size || 0,
      uploadedAt: new Date().toISOString(),
      ...extra
    }));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function enrichFilesWithContent(siteId, files, extra) {
    const items = [];
    for (const file of Array.from(files || [])) {
      const dataUrl = await readFileAsDataUrl(file);
      const base64Content = String(dataUrl).split(",")[1] || "";
      items.push({
        id: uid("file"),
        originalName: file.name,
        storedName: `${siteId}_${file.name}`,
        type: file.type || "application/octet-stream",
        size: file.size || 0,
        uploadedAt: new Date().toISOString(),
        base64Content,
        previewUrl: dataUrl,
        ...extra
      });
    }
    return items;
  }

  function countByStatus(tasks, status) {
    return tasks.filter((task) => task.status === status).length;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function loadDistricts() {
    const response = await fetch("./json/karnataka_districts.json");
    const data = await response.json();
    return data.map((item) => item.name);
  }

  async function postGoogleSync(state, payload) {
    const source = payload.source === "engineer" ? "engineer" : "master";
    const activeSettings = state.settings?.[source] || {};
    const endpoint = activeSettings.googleScriptUrl;
    if (!endpoint) return { skipped: true };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, state: sanitizeStateForStorage(state), activeSettings })
      });
      const data = await response.json();
      return data?.ok === false ? { skipped: false, error: new Error(data.message || data.error || "Sync failed"), sessionExpired: !!data.sessionExpired } : { skipped: false, data };
    } catch (error) {
      return { skipped: false, error };
    }
  }

  async function fetchGoogleTask(settings, siteId, session) {
    const endpoint = settings.googleScriptUrl;
    if (!endpoint || !siteId) return null;
    try {
      const url = new URL(endpoint);
      url.searchParams.set("action", "getTask");
      url.searchParams.set("siteId", siteId);
      url.searchParams.set("sheetId", settings.googleSheetId || "");
      url.searchParams.set("documentFolderId", settings.googleDocumentFolderId || "");
      url.searchParams.set("photoFolderId", settings.googlePhotoFolderId || "");
      url.searchParams.set("measurementFolderId", settings.googleMeasurementFolderId || "");
      url.searchParams.set("source", session?.role || "");
      url.searchParams.set("userId", session?.userId || "");
      url.searchParams.set("sessionToken", session?.sessionToken || "");
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json"
        }
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async function fetchGoogleState(settings, session) {
    const endpoint = settings.googleScriptUrl;
    if (!endpoint) return null;
    try {
      const url = new URL(endpoint);
      url.searchParams.set("action", "getState");
      url.searchParams.set("sheetId", settings.googleSheetId || "");
      url.searchParams.set("documentFolderId", settings.googleDocumentFolderId || "");
      url.searchParams.set("photoFolderId", settings.googlePhotoFolderId || "");
      url.searchParams.set("measurementFolderId", settings.googleMeasurementFolderId || "");
      url.searchParams.set("source", session?.role || "");
      url.searchParams.set("userId", session?.userId || "");
      url.searchParams.set("sessionToken", session?.sessionToken || "");
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json"
        }
      });
      const data = await response.json();
      return data || null;
    } catch (error) {
      return null;
    }
  }

  async function loginWithGoogle(settings, role, userId, password) {
    const endpoint = settings.googleScriptUrl;
    if (!endpoint) {
      return { ok: false, message: "Apps Script URL is required in settings." };
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "login",
          source: role,
          activeSettings: settings,
          payload: { role, userId, password }
        })
      });
      const data = await response.json();
      if (data?.ok) return data;
      return {
        ok: false,
        message: data?.message || data?.error || "Login failed.",
        error: data?.error || data?.message || "Login failed."
      };
    } catch (error) {
      return { ok: false, message: `Unable to verify login. ${error.message || ""}`.trim() };
    }
  }

  async function fetchGoogleConfig(settings) {
    const endpoint = settings.googleScriptUrl;
    if (!endpoint) return null;
    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/json"
        }
      });
      const data = await response.json();
      if (!data?.ok) return null;
      return {
        googleSheetId: sanitizeGoogleValue(data.sheetId),
        googleDocumentFolderId: sanitizeGoogleValue(data.documentFolderId),
        googlePhotoFolderId: sanitizeGoogleValue(data.photoFolderId),
        googleMeasurementFolderId: sanitizeGoogleValue(data.measurementFolderId)
      };
    } catch (error) {
      return null;
    }
  }

  function sanitizeGoogleValue(value) {
    const next = String(value || "").trim();
    if (!next) return "";
    if (next.includes("PASTE_")) return "";
    return next;
  }

  function mergeGoogleSettings(currentSettings, nextSettings) {
    return {
      googleScriptUrl: sanitizeGoogleValue(nextSettings?.googleScriptUrl) || currentSettings?.googleScriptUrl || "",
      googleSheetId: sanitizeGoogleValue(nextSettings?.googleSheetId) || currentSettings?.googleSheetId || "",
      googleDocumentFolderId: sanitizeGoogleValue(nextSettings?.googleDocumentFolderId) || currentSettings?.googleDocumentFolderId || "",
      googlePhotoFolderId: sanitizeGoogleValue(nextSettings?.googlePhotoFolderId) || currentSettings?.googlePhotoFolderId || "",
      googleMeasurementFolderId: sanitizeGoogleValue(nextSettings?.googleMeasurementFolderId) || currentSettings?.googleMeasurementFolderId || "",
      autoSyncEnabled: typeof nextSettings?.autoSyncEnabled === "boolean"
        ? nextSettings.autoSyncEnabled
        : currentSettings?.autoSyncEnabled ?? false
    };
  }

  function normalizeSettings(input, fallback) {
    const base = JSON.parse(JSON.stringify(fallback));
    if (!input) return base;
    if (input.master || input.engineer) {
      return {
        master: { ...base.master, ...(input.master || {}) },
        engineer: { ...base.engineer, ...(input.engineer || {}) }
      };
    }
    return {
      master: { ...base.master, ...(input || {}) },
      engineer: { ...base.engineer }
    };
  }

  async function reverseGeocodeDistrict(latitude, longitude) {
    if (!latitude || !longitude) return "";
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json"
        }
      });
      const data = await response.json();
      const address = data.address || {};
      return address.state_district || address.county || address.city_district || "";
    } catch (error) {
      return "";
    }
  }

  async function validateGoogleSession(settings, session) {
    const endpoint = settings.googleScriptUrl;
    if (!endpoint || !session?.userId || !session?.sessionToken) return { ok: false, sessionExpired: true };
    try {
      const url = new URL(endpoint);
      url.searchParams.set("action", "validateSession");
      url.searchParams.set("sheetId", settings.googleSheetId || "");
      url.searchParams.set("documentFolderId", settings.googleDocumentFolderId || "");
      url.searchParams.set("photoFolderId", settings.googlePhotoFolderId || "");
      url.searchParams.set("measurementFolderId", settings.googleMeasurementFolderId || "");
      url.searchParams.set("role", session.role || "");
      url.searchParams.set("userId", session.userId || "");
      url.searchParams.set("sessionToken", session.sessionToken || "");
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json"
        }
      });
      return await response.json();
    } catch (error) {
      return { ok: false, message: "Unable to validate session." };
    }
  }

  function getStatusHost() {
    let host = document.getElementById("floating-sync-status");
    if (host) return host;
    host = document.createElement("div");
    host.id = "floating-sync-status";
    host.className = "floating-sync-status hidden";
    host.innerHTML = '<div class="floating-sync-status__bar"></div><div class="floating-sync-status__text"></div>';
    document.body.appendChild(host);
    return host;
  }

  function showSyncStatus(message, tone = "working", persist = false) {
    const host = getStatusHost();
    host.className = `floating-sync-status tone-${tone}`;
    host.querySelector(".floating-sync-status__text").textContent = message;
    host.classList.remove("hidden");
    if (!persist) {
      clearTimeout(showSyncStatus.timeoutId);
      showSyncStatus.timeoutId = setTimeout(() => {
        host.classList.add("hidden");
      }, tone === "working" ? 120000 : 2600);
    }
  }

  function hideSyncStatus() {
    const host = document.getElementById("floating-sync-status");
    clearTimeout(showSyncStatus.timeoutId);
    if (host) host.classList.add("hidden");
  }

  function saveEngineerSession(session) {
    sessionStorage.setItem(ENGINEER_SESSION_KEY, JSON.stringify(session));
  }

  function saveMasterSession(data) {
    sessionStorage.setItem(MASTER_SESSION_KEY, JSON.stringify(data));
  }

  function getMasterSession() {
    const raw = sessionStorage.getItem(MASTER_SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function formatLoginFailure(result) {
    const message = String(result?.message || result?.error || "Login failed.").trim();
    if (/CONFIG\.SHEET_ID/i.test(message) || /Please update CONFIG\.SHEET_ID/i.test(message)) {
      return `${message} Update SHEET_ID in Apps Script code.gs or save Google Sheet ID in Advanced Settings.`;
    }
    if (/Credential sheet not found/i.test(message) || /Credential sheet is empty/i.test(message)) {
      return `${message} Check your Google Sheet tabs and login rows.`;
    }
    if (/Apps Script URL is required/i.test(message)) {
      return `${message} Open Settings and save the deployed Apps Script Web App URL first.`;
    }
    return message;
  }

  function clearMasterSession() {
    sessionStorage.removeItem(MASTER_SESSION_KEY);
  }

  function getEngineerSession() {
    const raw = sessionStorage.getItem(ENGINEER_SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object"
        ? parsed
        : { userId: "", name: String(parsed || ""), role: "engineer", sessionToken: "" };
    } catch (error) {
      return { userId: "", name: raw, role: "engineer", sessionToken: "" };
    }
  }

  function clearEngineerSession() {
    sessionStorage.removeItem(ENGINEER_SESSION_KEY);
  }

  window.BlissTaskPro = {
    readState,
    writeState,
    clearLocalCache,
    uid,
    extractTaskBaseId,
    toLifecycleTaskId,
    formatDate,
    statusClass,
    setOptions,
    emptyMarkup,
    ensurePrefixedFiles,
    enrichFilesWithContent,
    countByStatus,
    escapeHtml,
    loadDistricts,
    postGoogleSync,
    fetchGoogleTask,
    fetchGoogleState,
    reverseGeocodeDistrict,
    loginWithGoogle,
    fetchGoogleConfig,
    formatLoginFailure,
    validateGoogleSession,
    mergeGoogleSettings,
    showSyncStatus,
    hideSyncStatus,
    saveMasterSession,
    getMasterSession,
    clearMasterSession,
    saveEngineerSession,
    getEngineerSession,
    clearEngineerSession
  };
})();
