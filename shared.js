(function () {
  const STORAGE_KEY = "bliss-taskpro-state-v2";
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
      googleScriptUrl: "",
      googleSheetId: "",
      googleDriveFolderId: ""
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
        settings: { ...base.settings, ...(parsed.settings || {}) },
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
    const endpoint = state.settings.googleScriptUrl;
    if (!endpoint) return { skipped: true };
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return { skipped: false };
    } catch (error) {
      return { skipped: false, error };
    }
  }

  function saveEngineerSession(name) {
    sessionStorage.setItem(ENGINEER_SESSION_KEY, name);
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
    countByStatus,
    escapeHtml,
    loadDistricts,
    postGoogleSync,
    saveEngineerSession,
    getEngineerSession,
    clearEngineerSession
  };
})();
