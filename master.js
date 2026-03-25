(function () {
  const app = window.BlissTaskPro;
  let state = app.readState();
  let selectedDraftId = "";
  let selectedMapPoint = null;
  let currentEditTaskId = "";
  let masterSession = app.getMasterSession();
  let map;
  let mapMarker;

  const navButtons = document.querySelectorAll("[data-page-target]");
  const sections = document.querySelectorAll(".page-section");
  const masterLoginScreen = document.getElementById("master-login-screen");
  const masterAppShell = document.getElementById("master-app-shell");

  const masterForm = document.getElementById("master-filter-form");
  const assignmentForm = document.getElementById("task-assignment-form");
  const googleScriptInput = document.getElementById("google-script-url");
  const googleSheetInput = document.getElementById("google-sheet-id");
  const googleDocumentDriveInput = document.getElementById("google-document-drive-id");
  const googlePhotoDriveInput = document.getElementById("google-photo-drive-id");

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

  function showMasterApp() {
    masterLoginScreen.classList.add("hidden");
    masterAppShell.classList.remove("hidden");
    document.getElementById("logged-in-master").textContent = masterSession?.name || masterSession?.userId || "Master";
  }

  function showMasterLogin() {
    masterLoginScreen.classList.remove("hidden");
    masterAppShell.classList.add("hidden");
  }

  function saveState(action, payload) {
    app.writeState(state);
    app.postGoogleSync(state, {
      app: "Bliss TaskPro",
      source: "master",
      userId: masterSession?.userId || "",
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
    if (!value || state.options[key].includes(value)) return;
    state.options[key].push(value);
    state.options[key].sort((a, b) => a.localeCompare(b));
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

  function getAvailableDrafts() {
    return state.drafts.filter((draft) => !state.tasks.some((task) => task.draftId === draft.id && task.id !== currentEditTaskId));
  }

  function renderDraftSelector() {
    const drafts = getAvailableDrafts();
    if (!drafts.length) {
      draftSelector.innerHTML = '<option value="">No draft available</option>';
      document.getElementById("frozen-summary").innerHTML = app.emptyMarkup("Only unassigned drafts are shown.");
      return;
    }

    draftSelector.innerHTML = `<option value="">Select Draft</option>${drafts.map((draft) => `
      <option value="${draft.id}">${app.escapeHtml(draft.client)} | ${app.escapeHtml(draft.engineer)} | ${app.escapeHtml(draft.category)} | ${app.escapeHtml(draft.activity)}</option>
    `).join("")}`;

    if (selectedDraftId && drafts.some((draft) => draft.id === selectedDraftId)) {
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
        <div class="action-row">
          <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
          ${task.status === "Pending" ? `<button class="secondary-button" data-edit-task="${task.id}">Edit</button><button class="secondary-button" data-delete-task="${task.id}">Delete</button>` : ""}
        </div>
      </article>
    `).join("");

    host.querySelectorAll("[data-edit-task]").forEach((button) => {
      button.addEventListener("click", () => loadTaskForEdit(button.dataset.editTask));
    });
    host.querySelectorAll("[data-delete-task]").forEach((button) => {
      button.addEventListener("click", () => deleteTask(button.dataset.deleteTask));
    });
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
        <td><button class="site-link-button" data-open-task="${task.id}">${app.escapeHtml(task.siteId)}</button></td>
        <td>${app.escapeHtml(task.engineer)}</td>
        <td>${app.escapeHtml(task.siteEngineerName || "-")}</td>
        <td>${app.escapeHtml(task.district || "-")}</td>
        <td>${task.documents.filter((item) => item.answer === "Yes").length}</td>
        <td>${task.photos.length}</td>
        <td><button class="secondary-button" data-open-task="${task.id}">${task.status}</button></td>
      </tr>
    `).join("");

    host.querySelectorAll("[data-open-task]").forEach((button) => {
      button.addEventListener("click", () => openTaskDetailModal(button.dataset.openTask));
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
    if (!jsPDF) return;
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
    line(`Status: ${task.status}`);
    line(`Date: ${app.formatDate(task.date)}`);
    line(`District: ${task.district || "-"}`);
    line(`Location: ${task.location}`);
    line(`WO: ${share.workOrder}`);
    line(`Billing Status: ${share.billingStatus}`);
    line(`Invoice Number: ${share.invoiceNumber}`);
    line(`Value: ${share.value}`);
    if (share.includeInstructions) line(`Instructions: ${task.instructions || "-"}`);
    if (share.includeMeasurement) line(`Measurement: ${task.measurementText || "-"}`);
    if (share.includeGps) line(`GPS: ${task.gps ? `${task.gps.latitude}, ${task.gps.longitude}` : "-"}`);
    if (share.includeMeasurementImages) line(`Measurement Images: ${task.measurementImages.map((item) => item.storedName).join(", ") || "-"}`);
    line(`Documents: ${selectedDocs.map((item) => item.storedName).join(", ") || "-"}`);
    line(`Photos: ${selectedPhotos.map((item) => item.storedName).join(", ") || "-"}`);
    pdf.save(`${task.siteId}_summary.pdf`);
  }

  async function openTaskDetailModal(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    const host = document.getElementById("task-detail-modal-content");
    if (!task) {
      host.innerHTML = app.emptyMarkup("Task not found.");
      return;
    }

    const remote = await app.fetchGoogleTask(state.settings.engineer, task.siteId);
    const remoteDocuments = remote?.documents || [];
    const remotePhotos = remote?.photos || [];

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
      <div class="detail-panel">
        <div>
          <h4>${app.escapeHtml(task.siteId)}</h4>
          <p class="meta-line">${app.escapeHtml(task.client)} | ${app.escapeHtml(task.engineer)} | ${app.escapeHtml(task.siteEngineerName || "-")}</p>
          <p class="meta-line">${app.formatDate(task.date)} | ${app.escapeHtml(task.location)} | ${app.escapeHtml(task.district || "-")}</p>
          <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
        </div>

        <div class="form-grid">
          <div><strong>Instructions</strong><p class="meta-line">${app.escapeHtml(task.instructions || "-")}</p></div>
          <div><strong>Measurement</strong><p class="meta-line">${app.escapeHtml(task.measurementText || "-")}</p></div>
          <div><strong>GPS</strong><p class="meta-line">${task.gps ? `${task.gps.latitude}, ${task.gps.longitude}` : "-"}</p></div>
          <div><strong>Rollback Reason</strong><p class="meta-line">${app.escapeHtml(task.rollbackReason || "-")}</p></div>
        </div>

        <div>
          <strong>Documents</strong>
          <div class="check-grid">
            ${task.documents.filter((item) => item.answer === "Yes").length
              ? task.documents.filter((item) => item.answer === "Yes").map((item) => `
                <label><input type="checkbox" data-doc-id="${item.id}" ${share.selectedDocuments.includes(item.id) ? "checked" : ""}>${app.escapeHtml(item.docType || item.storedName)}</label>
              `).join("")
              : '<span class="fine-print">No uploaded documents.</span>'}
          </div>
          <ul class="file-list">${(remoteDocuments.length ? remoteDocuments : task.documents.filter((item) => item.answer === "Yes")).map((item) => `<li>${app.escapeHtml(item.name || item.storedName)}</li>`).join("") || "<li>No uploaded documents.</li>"}</ul>
        </div>

        <div>
          <strong>Photos</strong>
          <div class="check-grid">
            ${task.photos.length
              ? task.photos.map((item, index) => `<label><input type="checkbox" data-photo-id="${item.id}" ${share.selectedPhotos.includes(item.id) ? "checked" : ""}>Photo ${index + 1}</label>`).join("")
              : '<span class="fine-print">No uploaded photos.</span>'}
          </div>
          <div class="photo-preview-grid">${(remotePhotos.length ? remotePhotos : task.photos).map((item) => item.thumbnailUrl || item.previewUrl ? `<img class="photo-preview" src="${item.thumbnailUrl || item.previewUrl}" alt="${app.escapeHtml(item.name || item.storedName)}">` : `<span class="frozen-chip">${app.escapeHtml(item.name || item.storedName)}</span>`).join("") || '<span class="fine-print">No uploaded photos.</span>'}</div>
        </div>

        <div class="check-grid">
          <label><input type="checkbox" id="includeMeasurement" ${share.includeMeasurement ? "checked" : ""}>Measurement Text</label>
          <label><input type="checkbox" id="includeMeasurementImages" ${share.includeMeasurementImages ? "checked" : ""}>Measurement Images</label>
          <label><input type="checkbox" id="includeInstructions" ${share.includeInstructions ? "checked" : ""}>Instructions</label>
          <label><input type="checkbox" id="includeGps" ${share.includeGps ? "checked" : ""}>GPS</label>
        </div>

        <div class="form-grid">
          <label><span>WO</span><input id="shareWorkOrder" type="text" value="${app.escapeHtml(share.workOrder)}"></label>
          <label><span>Billing Status</span><select id="shareBillingStatus"><option value="Yes" ${share.billingStatus === "Yes" ? "selected" : ""}>Yes</option><option value="No" ${share.billingStatus === "No" ? "selected" : ""}>No</option></select></label>
          <label><span>Invoice Number</span><input id="shareInvoiceNumber" type="text" value="${app.escapeHtml(share.invoiceNumber)}"></label>
          <label><span>Value</span><input id="shareValue" type="number" step="0.01" value="${app.escapeHtml(share.value)}"></label>
        </div>

        ${task.status === "Completed" ? `
          <div class="form-grid">
            <label class="full-span"><span>Rollback Reason</span><textarea id="rollbackReason"></textarea></label>
          </div>
          <div class="action-row">
            <button id="rollback-to-wip" class="secondary-button" type="button">Rollback To WIP</button>
            <button id="rollback-to-pending" class="secondary-button" type="button">Rollback To Pending</button>
          </div>
        ` : ""}

        <div class="action-row">
          <button id="save-share-package" class="secondary-button" type="button">Save Selection</button>
          <button id="download-share-pdf" class="primary-button" type="button">Export PDF</button>
        </div>
      </div>
    `;

    document.getElementById("save-share-package").addEventListener("click", () => {
      task.sharePackage = collectSharePackage(task.id);
      saveState("saveSharePackage", { taskId: task.id, sharePackage: task.sharePackage });
      openTaskDetailModal(task.id);
    });

    document.getElementById("download-share-pdf").addEventListener("click", () => {
      task.sharePackage = collectSharePackage(task.id);
      saveState("exportSharePdf", { taskId: task.id, sharePackage: task.sharePackage });
      exportTaskPdf(task, task.sharePackage);
    });

    if (task.status === "Completed") {
      document.getElementById("rollback-to-wip").addEventListener("click", () => rollbackTask(task.id, "WIP"));
      document.getElementById("rollback-to-pending").addEventListener("click", () => rollbackTask(task.id, "Pending"));
    }

    document.getElementById("task-detail-modal").classList.remove("hidden");
  }

  function rollbackTask(taskId, nextStatus) {
    const task = state.tasks.find((item) => item.id === taskId);
    const reason = document.getElementById("rollbackReason")?.value.trim();
    if (!reason) {
      window.alert("Please enter rollback reason.");
      return;
    }
    task.status = nextStatus;
    task.rollbackReason = reason;
    task.updatedAt = new Date().toISOString();
    saveState("rollbackTask", { taskId, nextStatus, reason });
    closeTaskDetailModal();
    refreshAll();
  }

  function closeTaskDetailModal() {
    document.getElementById("task-detail-modal").classList.add("hidden");
  }

  function resetAssignmentForm() {
    assignmentForm.reset();
    assignDate.value = new Date().toISOString().split("T")[0];
    assignLatitude.value = "";
    assignLongitude.value = "";
    currentEditTaskId = "";
    selectedDraftId = "";
    draftSelector.value = "";
    renderFrozenSummary();
    assignmentForm.querySelector('button[type="submit"]').textContent = "Assign Task";
  }

  function refreshAll() {
    state = app.readState();
    googleScriptInput.value = state.settings.master.googleScriptUrl || "";
    googleSheetInput.value = state.settings.master.googleSheetId || "";
    googleDocumentDriveInput.value = state.settings.master.googleDocumentFolderId || "";
    googlePhotoDriveInput.value = state.settings.master.googlePhotoFolderId || "";
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

  function openMap() {
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

  async function applyCoords(lat, lng) {
    assignLatitude.value = lat;
    assignLongitude.value = lng;
    const district = await app.reverseGeocodeDistrict(lat, lng);
    if (district && state.options.districts.includes(district)) {
      districtSelect.value = district;
    } else if (district) {
      pushOptionIfMissing("districts", district);
      app.writeState(state);
      app.setOptions(districtSelect, state.options.districts, "Select District");
      districtSelect.value = district;
    }
  }

  function captureCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await applyCoords(position.coords.latitude.toFixed(6), position.coords.longitude.toFixed(6));
      },
      () => window.alert("Unable to fetch current location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function syncDistrictFromInputs() {
    if (assignLatitude.value && assignLongitude.value) {
      await applyCoords(assignLatitude.value, assignLongitude.value);
    }
  }

  function loadTaskForEdit(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== "Pending") return;
    currentEditTaskId = task.id;
    selectedDraftId = task.draftId;
    renderDraftSelector();
    draftSelector.value = task.draftId;
    renderFrozenSummary();
    assignSiteId.value = task.siteId;
    assignDate.value = task.date;
    assignLocation.value = task.location;
    assignLatitude.value = task.latitude || "";
    assignLongitude.value = task.longitude || "";
    districtSelect.value = task.district || "";
    assignInstructions.value = task.instructions || "";
    assignmentForm.querySelector('button[type="submit"]').textContent = "Update Task";
    document.querySelector('[data-page-target="task-page"]').click();
  }

  function deleteTask(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== "Pending") return;
    state.tasks = state.tasks.filter((item) => item.id !== taskId);
    saveState("deleteTask", { taskId });
    if (currentEditTaskId === taskId) resetAssignmentForm();
    refreshAll();
  }

  function openSettings() {
    document.getElementById("settings-modal").classList.remove("hidden");
  }

  function closeSettings() {
    document.getElementById("settings-modal").classList.add("hidden");
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

    const draft = { id: app.uid("draft"), client, engineer, category, activity, createdAt: new Date().toISOString() };
    state.drafts.push(draft);
    saveState("saveDraft", draft);
    masterForm.reset();
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
    const duplicate = state.tasks.some((task) => task.siteId === siteId && task.id !== currentEditTaskId);
    if (duplicate) {
      window.alert("Site ID already exists.");
      return;
    }

    if (currentEditTaskId) {
      const task = state.tasks.find((item) => item.id === currentEditTaskId);
      if (!task || task.status !== "Pending") {
        window.alert("Only pending tasks can be updated.");
        return;
      }
      Object.assign(task, {
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
        updatedAt: new Date().toISOString()
      });
      saveState("updateTask", task);
    } else {
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
        rollbackReason: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.tasks.push(task);
      saveState("assignTask", task);
    }

    resetAssignmentForm();
    refreshAll();
    document.querySelector('[data-page-target="details-page"]').click();
  });

  draftSelector.addEventListener("change", () => {
    selectedDraftId = draftSelector.value;
    renderFrozenSummary();
  });

  assignLatitude.addEventListener("change", syncDistrictFromInputs);
  assignLongitude.addEventListener("change", syncDistrictFromInputs);

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      navButtons.forEach((item) => item.classList.remove("active"));
      sections.forEach((section) => section.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.pageTarget).classList.add("active");
    });
  });

  document.getElementById("capture-master-location").addEventListener("click", captureCurrentLocation);
  document.getElementById("pick-master-location").addEventListener("click", openMap);
  document.getElementById("close-map-modal").addEventListener("click", closeMap);
  document.getElementById("save-map-point").addEventListener("click", async () => {
    if (!selectedMapPoint) return;
    await applyCoords(selectedMapPoint.lat.toFixed(6), selectedMapPoint.lng.toFixed(6));
    closeMap();
  });
  document.getElementById("open-settings-modal").addEventListener("click", openSettings);
  document.getElementById("master-login-settings").addEventListener("click", openSettings);
  document.getElementById("close-settings-modal").addEventListener("click", closeSettings);
  document.getElementById("save-google-settings").addEventListener("click", () => {
    state.settings.master.googleScriptUrl = googleScriptInput.value.trim();
    state.settings.master.googleSheetId = googleSheetInput.value.trim();
    state.settings.master.googleDocumentFolderId = googleDocumentDriveInput.value.trim();
    state.settings.master.googlePhotoFolderId = googlePhotoDriveInput.value.trim();
    saveState("saveGoogleSetting", { ...state.settings.master });
    closeSettings();
  });
  document.getElementById("close-task-detail-modal").addEventListener("click", closeTaskDetailModal);
  document.getElementById("master-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const settings = state.settings.master;
    const userId = document.getElementById("master-login-user").value.trim();
    const password = document.getElementById("master-login-password").value;
    const result = await app.loginWithGoogle(settings, "master", userId, password);
    if (!result.ok) {
      window.alert(result.message || "Login failed.");
      return;
    }
    masterSession = {
      userId: result.user.userId,
      name: result.user.name || result.user.userId,
      role: result.user.role
    };
    app.saveMasterSession(masterSession);
    showMasterApp();
  });
  document.getElementById("master-logout").addEventListener("click", () => {
    masterSession = null;
    app.clearMasterSession();
    showMasterLogin();
  });

  clientMaster.addEventListener("change", () => toggleOtherField(clientMaster, clientMasterOther, "clientMasterOtherWrap", "client"));
  engineerMaster.addEventListener("change", () => toggleOtherField(engineerMaster, engineerMasterOther, "engineerMasterOtherWrap", "engineer"));
  categoryMaster.addEventListener("change", () => toggleOtherField(categoryMaster, categoryMasterOther, "categoryMasterOtherWrap", "category"));
  activityMaster.addEventListener("change", () => toggleOtherField(activityMaster, activityMasterOther, "activityMasterOtherWrap", "activity"));
  window.addEventListener("storage", refreshAll);

  (async function init() {
    try {
      state.options.districts = await app.loadDistricts();
      app.writeState(state);
    } catch (error) {
      if (!state.options.districts.length) state.options.districts = ["Bengaluru Urban"];
    }
    assignDate.value = new Date().toISOString().split("T")[0];
    refreshAll();
    if (masterSession) showMasterApp();
    else showMasterLogin();
  })();
})();
