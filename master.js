(function () {
  const app = window.BlissTaskPro;
  let state = app.readState();
  let selectedDraftId = "";
  let selectedMapTarget = "master";
  let selectedMapPoint = null;
  let map;
  let mapMarker;

  const navButtons = document.querySelectorAll("[data-page-target]");
  const sections = document.querySelectorAll(".page-section");

  const masterForm = document.getElementById("master-filter-form");
  const assignmentForm = document.getElementById("task-assignment-form");
  const googleScriptInput = document.getElementById("google-script-url");
  const googleSheetInput = document.getElementById("google-sheet-id");
  const googleDriveInput = document.getElementById("google-drive-id");

  const clientMaster = document.getElementById("clientMaster");
  const engineerMaster = document.getElementById("engineerMaster");
  const categoryMaster = document.getElementById("categoryMaster");
  const activityMaster = document.getElementById("activityMaster");
  const clientMasterOther = document.getElementById("clientMasterOther");
  const engineerMasterOther = document.getElementById("engineerMasterOther");
  const categoryMasterOther = document.getElementById("categoryMasterOther");
  const activityMasterOther = document.getElementById("activityMasterOther");
  const draftSelector = document.getElementById("draftSelector");
  const districtSelect = document.getElementById("assignDistrict");

  const assignSiteId = document.getElementById("assignSiteId");
  const assignDate = document.getElementById("assignDate");
  const assignLocation = document.getElementById("assignLocation");
  const assignLatitude = document.getElementById("assignLatitude");
  const assignLongitude = document.getElementById("assignLongitude");
  const assignInstructions = document.getElementById("assignInstructions");

  function saveState(action, payload) {
    app.writeState(state);
    app.postGoogleSync(state, {
      app: "Bliss TaskPro",
      source: "master",
      action,
      payload,
      state
    });
  }

  function setOptions() {
    app.setOptions(clientMaster, state.options.clients, "Select Client");
    app.setOptions(engineerMaster, state.options.engineers, "Select Engineer");
    app.setOptions(categoryMaster, state.options.categories, "Select Category");
    app.setOptions(activityMaster, state.options.activities, "Select Activity");
    app.setOptions(districtSelect, state.options.districts, "Select District");
  }

  function toggleOtherField(select, input, wrapId, label) {
    const show = /^other/i.test(select.value || "");
    const wrap = document.getElementById(wrapId);
    wrap.classList.toggle("hidden", !show);
    input.required = show;
    if (!show) input.value = "";
    input.placeholder = `Enter ${label}`;
  }

  function resolveSelectValue(selectValue, otherValue) {
    return /^other/i.test(selectValue || "") ? otherValue.trim() : selectValue;
  }

  function pushOptionIfMissing(key, value) {
    if (!value) return;
    if (!state.options[key].includes(value)) {
      state.options[key].push(value);
      state.options[key].sort((a, b) => a.localeCompare(b));
    }
  }

  function renderStats() {
    document.getElementById("master-total-tasks").textContent = state.tasks.length;
    document.getElementById("master-wip-tasks").textContent = app.countByStatus(state.tasks, "WIP");
    document.getElementById("master-completed-tasks").textContent = app.countByStatus(state.tasks, "Completed");
  }

  function renderDrafts() {
    const host = document.getElementById("draft-list");
    if (!state.drafts.length) {
      host.innerHTML = app.emptyMarkup("No drafts saved.");
      return;
    }

    host.innerHTML = state.drafts.slice().reverse().map((draft) => `
      <article class="stack-card">
        <h5>${app.escapeHtml(draft.client)} | ${app.escapeHtml(draft.engineer)}</h5>
        <p class="meta-line">${app.escapeHtml(draft.category)} | ${app.escapeHtml(draft.activity)}</p>
      </article>
    `).join("");
  }

  function renderDraftSelector() {
    if (!state.drafts.length) {
      draftSelector.innerHTML = '<option value="">No draft available</option>';
      document.getElementById("frozen-summary").innerHTML = app.emptyMarkup("Save a master draft first.");
      selectedDraftId = "";
      return;
    }

    draftSelector.innerHTML = `<option value="">Select Draft</option>${state.drafts.map((draft) => `
      <option value="${draft.id}">${app.escapeHtml(draft.client)} | ${app.escapeHtml(draft.engineer)} | ${app.escapeHtml(draft.category)} | ${app.escapeHtml(draft.activity)}</option>
    `).join("")}`;

    if (selectedDraftId && state.drafts.some((draft) => draft.id === selectedDraftId)) {
      draftSelector.value = selectedDraftId;
    }
    renderFrozenSummary();
  }

  function renderFrozenSummary() {
    const host = document.getElementById("frozen-summary");
    const draft = state.drafts.find((item) => item.id === draftSelector.value);
    if (!draft) {
      host.innerHTML = app.emptyMarkup("Select a saved draft.");
      return;
    }

    selectedDraftId = draft.id;
    host.innerHTML = `
      <span class="frozen-chip">Client: ${app.escapeHtml(draft.client)}</span>
      <span class="frozen-chip">Engineer: ${app.escapeHtml(draft.engineer)}</span>
      <span class="frozen-chip">Category: ${app.escapeHtml(draft.category)}</span>
      <span class="frozen-chip">Activity: ${app.escapeHtml(draft.activity)}</span>
    `;
  }

  function renderQueue() {
    const host = document.getElementById("queue-list");
    if (!state.tasks.length) {
      host.innerHTML = app.emptyMarkup("No task assigned.");
      return;
    }

    host.innerHTML = state.tasks.slice().reverse().map((task) => `
      <article class="stack-card">
        <h5>${app.escapeHtml(task.siteId)}</h5>
        <p class="meta-line">${app.escapeHtml(task.client)} | ${app.escapeHtml(task.engineer)}</p>
        <p class="meta-line">${app.formatDate(task.date)} | ${app.escapeHtml(task.district)}</p>
        <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
      </article>
    `).join("");
  }

  function renderTaskTable() {
    const host = document.getElementById("master-task-table");
    if (!state.tasks.length) {
      host.innerHTML = '<tr><td colspan="8"><div class="empty-state">No task data yet.</div></td></tr>';
      return;
    }

    host.innerHTML = state.tasks.slice().reverse().map((task) => `
      <tr>
        <td><span class="status-pill ${app.statusClass(task.status)}">${task.status}</span></td>
        <td>
          ${task.status === "Completed"
            ? `<button class="site-link-button" data-completed-id="${task.id}">${app.escapeHtml(task.siteId)}</button>`
            : `<strong>${app.escapeHtml(task.siteId)}</strong>`}
        </td>
        <td>${app.escapeHtml(task.engineer)}</td>
        <td>${app.escapeHtml(task.siteEngineerName || "-")}</td>
        <td>${app.escapeHtml(task.district)}</td>
        <td>${task.documents.filter((item) => item.answer === "Yes").length}</td>
        <td>${task.photos.length}</td>
        <td>${task.status === "Completed" ? `<button class="secondary-button" data-completed-id="${task.id}">Completed</button>` : "Pending"}</td>
      </tr>
    `).join("");

    host.querySelectorAll("[data-completed-id]").forEach((button) => {
      button.addEventListener("click", () => renderCompletedDetail(button.dataset.completedId));
    });
  }

  function renderCompletedDetail(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    const host = document.getElementById("completed-detail-panel");
    if (!task) {
      host.innerHTML = app.emptyMarkup("Task not found.");
      return;
    }

    const share = task.sharePackage || {
      selectedDocuments: task.documents.filter((item) => item.answer === "Yes").map((item) => item.id),
      selectedPhotos: task.photos.map((item) => item.id),
      includeMeasurement: true,
      includeMeasurementImages: true,
      includeInstructions: true,
      includeGps: true,
      workOrder: "",
      billingStatus: "No",
      invoiceNumber: "",
      value: ""
    };

    host.innerHTML = `
      <div class="detail-panel" data-share-task-id="${task.id}">
        <div>
          <h4>${app.escapeHtml(task.siteId)}</h4>
          <p class="meta-line">${app.escapeHtml(task.client)} | ${app.escapeHtml(task.engineer)} | ${app.escapeHtml(task.siteEngineerName || "-")}</p>
        </div>

        <div>
          <strong>Documents</strong>
          <div class="check-grid">
            ${task.documents.filter((item) => item.answer === "Yes").length
              ? task.documents.filter((item) => item.answer === "Yes").map((item) => `
                <label><input type="checkbox" data-doc-id="${item.id}" ${share.selectedDocuments.includes(item.id) ? "checked" : ""}>${app.escapeHtml(item.docType || item.storedName)}</label>
              `).join("")
              : '<span class="fine-print">No document selected as Yes.</span>'}
          </div>
        </div>

        <div>
          <strong>Photos</strong>
          <div class="check-grid">
            ${task.photos.length
              ? task.photos.map((item, index) => `
                <label><input type="checkbox" data-photo-id="${item.id}" ${share.selectedPhotos.includes(item.id) ? "checked" : ""}>Photo ${index + 1}</label>
              `).join("")
              : '<span class="fine-print">No photos uploaded.</span>'}
          </div>
        </div>

        <div class="check-grid">
          <label><input type="checkbox" id="includeMeasurement" ${share.includeMeasurement ? "checked" : ""}>Measurement Text</label>
          <label><input type="checkbox" id="includeMeasurementImages" ${share.includeMeasurementImages ? "checked" : ""}>Measurement Images</label>
          <label><input type="checkbox" id="includeInstructions" ${share.includeInstructions ? "checked" : ""}>Instructions</label>
          <label><input type="checkbox" id="includeGps" ${share.includeGps ? "checked" : ""}>GPS</label>
        </div>

        <div class="form-grid">
          <label><span>WO</span><input id="shareWorkOrder" type="text" value="${app.escapeHtml(share.workOrder)}"></label>
          <label><span>Billing Status</span>
            <select id="shareBillingStatus">
              <option value="Yes" ${share.billingStatus === "Yes" ? "selected" : ""}>Yes</option>
              <option value="No" ${share.billingStatus === "No" ? "selected" : ""}>No</option>
            </select>
          </label>
          <label><span>Invoice Number</span><input id="shareInvoiceNumber" type="text" value="${app.escapeHtml(share.invoiceNumber)}"></label>
          <label><span>Value</span><input id="shareValue" type="number" step="0.01" value="${app.escapeHtml(share.value)}"></label>
        </div>

        <div class="action-row">
          <button id="save-share-package" class="secondary-button" type="button">Save Selection</button>
          <button id="download-share-pdf" class="primary-button" type="button">Export PDF</button>
        </div>
      </div>
    `;

    document.getElementById("save-share-package").addEventListener("click", () => {
      const nextShare = collectSharePackage(task.id);
      task.sharePackage = nextShare;
      saveState("saveSharePackage", { taskId: task.id, sharePackage: nextShare });
      renderCompletedDetail(task.id);
    });

    document.getElementById("download-share-pdf").addEventListener("click", () => {
      const nextShare = collectSharePackage(task.id);
      task.sharePackage = nextShare;
      saveState("exportSharePdf", { taskId: task.id, sharePackage: nextShare });
      exportTaskPdf(task, nextShare);
    });
  }

  function collectSharePackage(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    return {
      selectedDocuments: task.documents.filter((item) => item.answer === "Yes" && document.querySelector(`[data-doc-id="${item.id}"]`)?.checked).map((item) => item.id),
      selectedPhotos: task.photos.filter((item) => document.querySelector(`[data-photo-id="${item.id}"]`)?.checked).map((item) => item.id),
      includeMeasurement: document.getElementById("includeMeasurement")?.checked ?? true,
      includeMeasurementImages: document.getElementById("includeMeasurementImages")?.checked ?? true,
      includeInstructions: document.getElementById("includeInstructions")?.checked ?? true,
      includeGps: document.getElementById("includeGps")?.checked ?? true,
      workOrder: document.getElementById("shareWorkOrder")?.value.trim() || "",
      billingStatus: document.getElementById("shareBillingStatus")?.value || "No",
      invoiceNumber: document.getElementById("shareInvoiceNumber")?.value.trim() || "",
      value: document.getElementById("shareValue")?.value || ""
    };
  }

  function exportTaskPdf(task, share) {
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      window.alert("PDF library not loaded.");
      return;
    }

    const pdf = new jsPDF();
    const selectedDocs = task.documents.filter((item) => share.selectedDocuments.includes(item.id));
    const selectedPhotos = task.photos.filter((item) => share.selectedPhotos.includes(item.id));
    let y = 18;

    function line(text) {
      const lines = pdf.splitTextToSize(String(text), 175);
      pdf.text(lines, 16, y);
      y += lines.length * 7;
      if (y > 270) {
        pdf.addPage();
        y = 18;
      }
    }

    pdf.setFontSize(18);
    line(`Bliss TaskPro - ${task.siteId}`);
    pdf.setFontSize(11);
    line(`Client: ${task.client}`);
    line(`Engineer: ${task.engineer}`);
    line(`Site Engineer: ${task.siteEngineerName || "-"}`);
    line(`Date: ${app.formatDate(task.date)}`);
    line(`District: ${task.district}`);
    line(`Location: ${task.location}`);
    line(`WO: ${share.workOrder}`);
    line(`Billing Status: ${share.billingStatus}`);
    line(`Invoice Number: ${share.invoiceNumber}`);
    line(`Value: ${share.value}`);

    if (share.includeInstructions) line(`Instructions: ${task.instructions || "-"}`);
    if (share.includeMeasurement) line(`Measurement: ${task.measurementText || "-"}`);
    if (share.includeGps) line(`Completion GPS: ${task.gps ? `${task.gps.latitude}, ${task.gps.longitude}` : "-"}`);
    if (share.includeMeasurementImages) line(`Measurement Images: ${task.measurementImages.map((item) => item.storedName).join(", ") || "-"}`);
    line(`Documents: ${selectedDocs.map((item) => item.storedName).join(", ") || "-"}`);
    line(`Photos: ${selectedPhotos.map((item) => item.storedName).join(", ") || "-"}`);

    pdf.save(`${task.siteId}_summary.pdf`);
  }

  function resetAssignmentForm() {
    assignmentForm.reset();
    assignDate.value = new Date().toISOString().split("T")[0];
    assignLatitude.value = "";
    assignLongitude.value = "";
    renderFrozenSummary();
  }

  function refreshAll() {
    state = app.readState();
    googleScriptInput.value = state.settings.googleScriptUrl || "";
    googleSheetInput.value = state.settings.googleSheetId || "";
    googleDriveInput.value = state.settings.googleDriveFolderId || "";
    setOptions();
    toggleOtherField(clientMaster, clientMasterOther, "clientMasterOtherWrap", "client");
    toggleOtherField(engineerMaster, engineerMasterOther, "engineerMasterOtherWrap", "engineer");
    toggleOtherField(categoryMaster, categoryMasterOther, "categoryMasterOtherWrap", "category");
    toggleOtherField(activityMaster, activityMasterOther, "activityMasterOtherWrap", "activity");
    renderDrafts();
    renderDraftSelector();
    renderQueue();
    renderTaskTable();
    renderStats();
  }

  function openMap(target) {
    selectedMapTarget = target;
    selectedMapPoint = null;
    document.getElementById("map-modal").classList.remove("hidden");
    if (!map) {
      map = L.map("map-picker").setView([12.9716, 77.5946], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);
      map.on("click", (event) => {
        selectedMapPoint = event.latlng;
        document.getElementById("map-selected-output").textContent = `Lat: ${event.latlng.lat.toFixed(6)}, Lng: ${event.latlng.lng.toFixed(6)}`;
        if (mapMarker) map.removeLayer(mapMarker);
        mapMarker = L.marker(event.latlng).addTo(map);
      });
    }
    setTimeout(() => map.invalidateSize(), 120);
  }

  function closeMap() {
    document.getElementById("map-modal").classList.add("hidden");
  }

  function openSettings() {
    document.getElementById("settings-modal").classList.remove("hidden");
  }

  function closeSettings() {
    document.getElementById("settings-modal").classList.add("hidden");
  }

  function applyCoords(lat, lng) {
    assignLatitude.value = lat;
    assignLongitude.value = lng;
  }

  function captureCurrentLocation() {
    if (!navigator.geolocation) {
      window.alert("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => applyCoords(position.coords.latitude, position.coords.longitude),
      () => window.alert("Unable to fetch current location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  masterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(masterForm);
    const client = resolveSelectValue(String(form.get("client")), String(form.get("clientOther") || ""));
    const engineer = resolveSelectValue(String(form.get("engineer")), String(form.get("engineerOther") || ""));
    const category = resolveSelectValue(String(form.get("category")), String(form.get("categoryOther") || ""));
    const activity = resolveSelectValue(String(form.get("activity")), String(form.get("activityOther") || ""));

    if (!client || !engineer || !category || !activity) {
      window.alert("Please fill the Other field where selected.");
      return;
    }

    pushOptionIfMissing("clients", client);
    pushOptionIfMissing("engineers", engineer);
    pushOptionIfMissing("categories", category);
    pushOptionIfMissing("activities", activity);

    state.drafts.push({
      id: app.uid("draft"),
      client,
      engineer,
      category,
      activity,
      createdAt: new Date().toISOString()
    });
    saveState("saveDraft", state.drafts[state.drafts.length - 1]);
    masterForm.reset();
    setOptions();
    refreshAll();
  });

  assignmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(assignmentForm);
    const draft = state.drafts.find((item) => item.id === String(form.get("draftId")));
    if (!draft) {
      window.alert("Please select a saved draft.");
      return;
    }
    const siteId = String(form.get("siteId")).trim();
    if (state.tasks.some((task) => task.siteId === siteId)) {
      window.alert("Site ID already exists.");
      return;
    }

    const task = {
      id: app.uid("task"),
      draftId: draft.id,
      client: draft.client,
      engineer: draft.engineer,
      category: draft.category,
      activity: draft.activity,
      siteId,
      date: String(form.get("date")),
      location: String(form.get("location")).trim(),
      latitude: String(form.get("latitude")).trim(),
      longitude: String(form.get("longitude")).trim(),
      district: String(form.get("district")),
      instructions: String(form.get("instructions")).trim(),
      status: "Pending",
      siteEngineerName: "",
      documents: [],
      photos: [],
      measurementText: "",
      measurementImages: [],
      gps: null,
      sharePackage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    state.tasks.push(task);
    saveState("assignTask", task);
    resetAssignmentForm();
    refreshAll();
    document.querySelector('[data-page-target="details-page"]').click();
  });

  draftSelector.addEventListener("change", () => {
    selectedDraftId = draftSelector.value;
    renderFrozenSummary();
  });

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      navButtons.forEach((item) => item.classList.remove("active"));
      sections.forEach((section) => section.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.pageTarget).classList.add("active");
    });
  });

  document.getElementById("capture-master-location").addEventListener("click", captureCurrentLocation);
  document.getElementById("pick-master-location").addEventListener("click", () => openMap("master"));
  document.getElementById("close-map-modal").addEventListener("click", closeMap);
  document.getElementById("save-map-point").addEventListener("click", () => {
    if (!selectedMapPoint) {
      window.alert("Please select a point on the map.");
      return;
    }
    applyCoords(selectedMapPoint.lat.toFixed(6), selectedMapPoint.lng.toFixed(6));
    closeMap();
  });

  document.getElementById("open-settings-modal").addEventListener("click", openSettings);
  document.getElementById("close-settings-modal").addEventListener("click", closeSettings);
  document.getElementById("save-google-settings").addEventListener("click", () => {
    state.settings.googleScriptUrl = googleScriptInput.value.trim();
    state.settings.googleSheetId = googleSheetInput.value.trim();
    state.settings.googleDriveFolderId = googleDriveInput.value.trim();
    saveState("saveGoogleSetting", { ...state.settings });
    closeSettings();
    window.alert("Google settings saved.");
  });

  window.addEventListener("storage", refreshAll);

  clientMaster.addEventListener("change", () => toggleOtherField(clientMaster, clientMasterOther, "clientMasterOtherWrap", "client"));
  engineerMaster.addEventListener("change", () => toggleOtherField(engineerMaster, engineerMasterOther, "engineerMasterOtherWrap", "engineer"));
  categoryMaster.addEventListener("change", () => toggleOtherField(categoryMaster, categoryMasterOther, "categoryMasterOtherWrap", "category"));
  activityMaster.addEventListener("change", () => toggleOtherField(activityMaster, activityMasterOther, "activityMasterOtherWrap", "activity"));

  (async function init() {
    try {
      state.options.districts = await app.loadDistricts();
      saveState("loadDistricts", { count: state.options.districts.length });
    } catch (error) {
      state.options.districts = state.options.districts.length ? state.options.districts : ["Bengaluru Urban"];
      app.writeState(state);
    }
    setOptions();
    toggleOtherField(clientMaster, clientMasterOther, "clientMasterOtherWrap", "client");
    toggleOtherField(engineerMaster, engineerMasterOther, "engineerMasterOtherWrap", "engineer");
    toggleOtherField(categoryMaster, categoryMasterOther, "categoryMasterOtherWrap", "category");
    toggleOtherField(activityMaster, activityMasterOther, "activityMasterOtherWrap", "activity");
    assignDate.value = new Date().toISOString().split("T")[0];
    googleScriptInput.value = state.settings.googleScriptUrl || "";
    refreshAll();
  })();
})();
