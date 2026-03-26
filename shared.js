(function () {
  const STORAGE_KEY = "bliss-taskpro-state-v2";
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
        googlePhotoFolderId: ""
      },
      engineer: {
        googleScriptUrl: "",
        googleSheetId: "",
        googleDocumentFolderId: "",
        googlePhotoFolderId: ""
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
    if (!raw) {
      const clean = cloneDefaults();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      return clean;
    }

    try {
      const parsed = JSON.parse(raw);
      const base = cloneDefaults();
      return {
        options: { ...base.options, ...(parsed.options || {}) },
        settings: normalizeSettings(parsed.settings, base.settings),
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, activeSettings })
      });
      return { skipped: false };
    } catch (error) {
      return { skipped: false, error };
    }
  }

  async function fetchGoogleTask(settings, siteId) {
    const endpoint = settings.googleScriptUrl;
    if (!endpoint || !siteId) return null;
    try {
      const url = new URL(endpoint);
      url.searchParams.set("action", "getTask");
      url.searchParams.set("siteId", siteId);
      url.searchParams.set("sheetId", settings.googleSheetId || "");
      url.searchParams.set("documentFolderId", settings.googleDocumentFolderId || "");
      url.searchParams.set("photoFolderId", settings.googlePhotoFolderId || "");
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
      return await response.json();
    } catch (error) {
      return { ok: false, message: "Unable to verify login." };
    }
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

  function saveEngineerSession(name) {
    sessionStorage.setItem(ENGINEER_SESSION_KEY, name);
  }

  function saveMasterSession(data) {
    sessionStorage.setItem(MASTER_SESSION_KEY, JSON.stringify(data));
  }

  function getMasterSession() {
    const raw = sessionStorage.getItem(MASTER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function clearMasterSession() {
    sessionStorage.removeItem(MASTER_SESSION_KEY);
  }

  function getEngineerSession() {
    return sessionStorage.getItem(ENGINEER_SESSION_KEY) || "";
  }

  function clearEngineerSession() {
    sessionStorage.removeItem(ENGINEER_SESSION_KEY);
  }

  window.BlissTaskPro = {
    readState,
    writeState,
    uid,
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
    reverseGeocodeDistrict,
    loginWithGoogle,
    saveMasterSession,
    getMasterSession,
    clearMasterSession,
    saveEngineerSession,
    getEngineerSession,
    clearEngineerSession
  };
})();
