(function () {
  const STORAGE_KEY = "bliss-taskpro-state-v1";

  const defaults = {
    options: {
      clients: ["JIO", "Retail", "Others"],
      engineers: ["Naveen", "Rocky", "Sriram"],
      categories: ["Project", "O&M", "Others"],
      activities: ["Enod B", "5G", "Upgradation", "Repair", "Others"],
      districts: [
        "Bengaluru Urban",
        "Mysuru",
        "Tumakuru",
        "Belagavi",
        "Dharwad",
        "Ballari",
        "Dakshina Kannada",
        "Shivamogga"
      ]
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
      return {
        options: parsed.options || cloneDefaults().options,
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

  function ensurePrefixedFiles(siteId, files) {
    return Array.from(files || []).map((file) => ({
      id: uid("file"),
      originalName: file.name,
      storedName: `${siteId}_${file.name}`,
      type: file.type || "application/octet-stream",
      size: file.size || 0,
      uploadedAt: new Date().toISOString()
    }));
  }

  function countByStatus(tasks, status) {
    return tasks.filter((task) => task.status === status).length;
  }

  function setOptions(select, items, placeholder) {
    if (!select) return;
    const head = placeholder ? `<option value="">${placeholder}</option>` : "";
    select.innerHTML = `${head}${items.map((item) => `<option value="${item}">${item}</option>`).join("")}`;
  }

  function emptyMarkup(message) {
    return `<div class="empty-state">${message}</div>`;
  }

  window.BlissTaskPro = {
    readState,
    writeState,
    uid,
    formatDate,
    statusClass,
    ensurePrefixedFiles,
    countByStatus,
    setOptions,
    emptyMarkup
  };
})();
