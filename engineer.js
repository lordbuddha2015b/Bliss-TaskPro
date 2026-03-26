(function () {
  const app = window.BlissTaskPro;
  let state = app.readState();
  let activeTaskId = "";
  let currentEngineer = app.getEngineerSession();
  let engineerUserId = "";
  let map;
  let mapMarker;
  let selectedMapPoint = null;

  const loginScreen = document.getElementById("engineer-login-screen");
  const appShell = document.getElementById("engineer-app-shell");
  const engineerLoginUser = document.getElementById("engineer-login-user");
  const engineerLoginPassword = document.getElementById("engineer-login-password");
  const engineerGoogleScriptInput = document.getElementById("engineer-google-script-url");
  const engineerGoogleSheetInput = document.getElementById("engineer-google-sheet-id");
  const engineerGoogleDocumentDriveInput = document.getElementById("engineer-google-document-drive-id");
  const engineerGooglePhotoDriveInput = document.getElementById("engineer-google-photo-drive-id");

  function saveState(action, payload) {
    app.writeState(state);
    app.postGoogleSync(state, {
      app: "Bliss TaskPro",
      source: "engineer",
      userId: engineerUserId,
      action,
      payload,
      state
    });
  }

  function refreshState() {
    state = app.readState();
  }

  function getEngineerTasks() {
    return state.tasks.filter((task) => task.engineer === currentEngineer);
  }

  function renderStats(tasks) {
    document.getElementById("engineer-total-tasks").textContent = tasks.length;
    document.getElementById("engineer-wip-tasks").textContent = app.countByStatus(tasks, "WIP");
    document.getElementById("engineer-completed-tasks").textContent = app.countByStatus(tasks, "Completed");
  }

  function renderSiteList() {
    const tasks = getEngineerTasks();
    const host = document.getElementById("engineer-site-list");
    renderStats(tasks);

    if (!tasks.length) {
      host.innerHTML = app.emptyMarkup("No tasks assigned.");
      document.getElementById("engineer-task-detail").innerHTML = app.emptyMarkup("Click a Site ID to fetch task details.");
      return;
    }

    host.innerHTML = tasks.slice().reverse().map((task) => `
      <article class="site-card">
        <h5>${app.escapeHtml(task.siteId)}</h5>
        <p class="meta-line">${app.formatDate(task.date)} | ${app.escapeHtml(task.district || "-")}</p>
        <p class="meta-line">${app.escapeHtml(task.client)} | ${app.escapeHtml(task.category)} | ${app.escapeHtml(task.activity)}</p>
        <div class="action-row">
          <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
          <button class="site-link-button" data-task-id="${task.id}">Open Site ID</button>
        </div>
      </article>
    `).join("");

    host.querySelectorAll("[data-task-id]").forEach((button) => {
      button.addEventListener("click", () => {
        activeTaskId = button.dataset.taskId;
        renderTaskDetail(activeTaskId);
      });
    });

    if (!activeTaskId || !tasks.some((task) => task.id === activeTaskId)) {
      activeTaskId = tasks[0].id;
    }
    renderTaskDetail(activeTaskId);
  }

  function fileListMarkup(items, removeAction, editable) {
    if (!items.length) return "<li>No files added.</li>";
    return items.map((item, index) => `
      <li>
        ${app.escapeHtml(item.storedName || item.name || `File ${index + 1}`)}
        ${editable ? `<button class="mini-button" type="button" data-remove="${removeAction}" data-file-id="${item.id}">Remove</button>` : ""}
      </li>
    `).join("");
  }

  function imagePreviewMarkup(items, removeAction, editable) {
    if (!items.length) return '<span class="fine-print">No photos added.</span>';
    return items.map((item) => `
      <div class="preview-card">
        ${item.previewUrl ? `<img class="photo-preview" src="${item.previewUrl}" alt="${app.escapeHtml(item.storedName)}">` : `<span class="frozen-chip">${app.escapeHtml(item.storedName)}</span>`}
        ${editable ? `<button class="mini-button" type="button" data-remove="${removeAction}" data-file-id="${item.id}">Remove</button>` : ""}
      </div>
    `).join("");
  }

  function renderTaskDetail(taskId, documentAnswerOverride) {
    const task = getEngineerTasks().find((item) => item.id === taskId);
    const host = document.getElementById("engineer-task-detail");
    if (!task) {
      host.innerHTML = app.emptyMarkup("Task not found.");
      return;
    }

    const isCompleted = task.status === "Completed";
    const canEdit = task.status === "Pending" || task.status === "WIP";
    const docHasYes = task.documents.some((item) => item.answer === "Yes");
    const documentAnswer = documentAnswerOverride || (docHasYes ? "Yes" : "No");
    const showDocumentFields = documentAnswer === "Yes" && canEdit && !isCompleted;

    host.innerHTML = `
      <div class="detail-panel" data-task-id="${task.id}">
        <div class="task-hero">
          <div class="task-hero-main">
            <h4>${app.escapeHtml(task.siteId)}</h4>
            <p class="task-hero-client">${app.escapeHtml(task.client)}</p>
            <p class="meta-line">${app.escapeHtml(task.category)} | ${app.escapeHtml(task.activity)}</p>
          </div>
          <div class="task-hero-side">
            <p><strong>Date:</strong> ${app.formatDate(task.date)}</p>
            <p><strong>Location:</strong> ${app.escapeHtml(task.location)}</p>
            <p><strong>District:</strong> ${app.escapeHtml(task.district || "-")}</p>
          </div>
        </div>

        <div class="action-row action-row-top">
          ${!isCompleted ? '<button id="mark-wip" class="secondary-button" type="button">WIP</button>' : ''}
          <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
        </div>

        <section class="update-box">
          <h5>Site Engineer Name</h5>
          <label><span>Name</span><input id="siteEngineerName" type="text" value="${app.escapeHtml(task.siteEngineerName || "")}" ${isCompleted ? "disabled" : ""}></label>
          <p class="fine-print">${isCompleted ? "Completed task is frozen." : "Required before marking WIP."}</p>
        </section>

        <section class="update-box">
          <h5>Document Available</h5>
          <div class="form-grid">
            <label><span>Document Available</span>
              <select id="documentAnswer" ${isCompleted ? "disabled" : ""}>
                <option value="No" ${documentAnswer === "No" ? "selected" : ""}>No</option>
                <option value="Yes" ${documentAnswer === "Yes" ? "selected" : ""}>Yes</option>
              </select>
            </label>
            ${showDocumentFields ? `
              <label><span>Document Type</span>
                <select id="documentType">
                  <option value="DN">DN</option>
                  <option value="ESCOMDocuments">ESCOMDocuments</option>
                  <option value="Receipt">Receipt</option>
                  <option value="Electrical Inspectrate">Electrical Inspectrate</option>
                </select>
              </label>
              <label class="full-span" id="document-upload-wrap"><span>Upload Document</span><input id="documentUpload" type="file"></label>
            ` : ""}
          </div>
          <div class="action-row">
            ${showDocumentFields ? '<button id="add-document" class="secondary-button" type="button">Add Document</button>' : ''}
          </div>
          <ul class="file-list">${fileListMarkup(task.documents, "document", canEdit && !isCompleted)}</ul>
        </section>

        <section class="update-box">
          <h5>Site Photos</h5>
          <div class="doc-config-row">
            <label><span>Upload Photos</span><input id="photoUpload" type="file" accept="image/*" multiple ${!canEdit || isCompleted ? "disabled" : ""}></label>
            <label><span>Camera</span><input id="cameraUpload" type="file" accept="image/*" capture="environment" ${!canEdit || isCompleted ? "disabled" : ""}></label>
          </div>
          <div class="action-row">
            ${canEdit && !isCompleted ? '<button id="add-photos" class="secondary-button" type="button">Save Photos</button>' : ''}
          </div>
          <div class="photo-preview-grid">${imagePreviewMarkup(task.photos, "photo", canEdit && !isCompleted)}</div>
        </section>

        <section class="update-box">
          <h5>Measurement</h5>
          <div class="form-grid">
            <label class="full-span"><span>Measurement Text</span><textarea id="measurementText" ${isCompleted ? "disabled" : ""}>${app.escapeHtml(task.measurementText || "")}</textarea></label>
            <label><span>Measurement Image</span><input id="measurementUpload" type="file" accept="image/*" multiple ${!canEdit || isCompleted ? "disabled" : ""}></label>
          </div>
          <div class="action-row">
            ${canEdit && !isCompleted ? '<button id="save-measurement" class="secondary-button" type="button">Save Measurement</button>' : ''}
          </div>
          <ul class="file-list">${fileListMarkup(task.measurementImages, "measurement", canEdit && !isCompleted)}</ul>
        </section>

        <section class="update-box">
          <h5>Location Capture</h5>
          <div class="form-grid">
            <label><span>Completion Latitude</span><input id="completionLatitude" type="number" step="any" readonly value="${task.gps?.latitude || ""}"></label>
            <label><span>Completion Longitude</span><input id="completionLongitude" type="number" step="any" readonly value="${task.gps?.longitude || ""}"></label>
          </div>
          <div class="action-row">
            ${canEdit && !isCompleted ? '<button id="capture-gps" class="secondary-button" type="button">Capture GPS Location</button><button id="pick-gps-map" class="secondary-button" type="button">Open Map And Select</button>' : ''}
          </div>
        </section>

        <div class="action-row">
          ${!isCompleted ? '<button id="mark-completed" class="primary-button" type="button">Complete</button>' : ''}
        </div>
      </div>
    `;

    if (canEdit && !isCompleted) {
      document.getElementById("documentAnswer").addEventListener("change", (event) => {
        renderTaskDetail(task.id, event.target.value);
      });
      document.getElementById("add-document")?.addEventListener("click", () => addDocument(task.id));
      document.getElementById("add-photos")?.addEventListener("click", () => addPhotos(task.id));
      document.getElementById("save-measurement")?.addEventListener("click", () => saveMeasurement(task.id));
      document.getElementById("capture-gps")?.addEventListener("click", () => captureGps(task.id));
      document.getElementById("pick-gps-map")?.addEventListener("click", () => openMap(task.id));
      document.getElementById("mark-wip")?.addEventListener("click", () => markWip(task.id));
      document.getElementById("mark-completed")?.addEventListener("click", () => markCompleted(task.id));
      host.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => removeFile(task.id, button.dataset.remove, button.dataset.fileId));
      });
    }
  }

  function updateTask(taskId, updater, action) {
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return null;
    updater(task);
    task.updatedAt = new Date().toISOString();
    saveState(action, task);
    renderSiteList();
    return task;
  }

  function collectSiteEngineerName() {
    return document.getElementById("siteEngineerName")?.value.trim() || "";
  }

  function markWip(taskId) {
    const siteEngineerName = collectSiteEngineerName();
    if (!siteEngineerName) {
      window.alert("Please fill Site Engineer Name before starting WIP.");
      return;
    }
    updateTask(taskId, (task) => {
      task.siteEngineerName = siteEngineerName;
      task.status = "WIP";
    }, "markWip");
  }

  function markCompleted(taskId) {
    const siteEngineerName = collectSiteEngineerName();
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return;
    const hasMeasurement = !!task.measurementText || !!task.measurementImages.length;
    if (!siteEngineerName || !task.gps || !task.photos.length || !hasMeasurement) {
      window.alert("Please add Site Engineer Name, at least one photo, GPS, and either measurement text or measurement image before completion.");
      return;
    }
    updateTask(taskId, (current) => {
      current.siteEngineerName = siteEngineerName;
      current.status = "Completed";
    }, "markCompleted");
  }

  async function addDocument(taskId) {
    const answer = document.getElementById("documentAnswer").value;
    if (answer === "No") {
      updateTask(taskId, (task) => {
        task.documents = task.documents.filter((item) => item.answer !== "No");
        task.documents.push({
          id: app.uid("doc"),
          answer: "No",
          docType: "",
          storedName: "No Document",
          uploadedAt: new Date().toISOString()
        });
      }, "addDocumentNo");
      return;
    }

    const fileInput = document.getElementById("documentUpload");
    const type = document.getElementById("documentType").value;
    if (!fileInput.files.length) {
      window.alert("Please upload a document file.");
      return;
    }
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    const files = await app.enrichFilesWithContent(task.siteId, fileInput.files, { answer: "Yes", docType: type });
    files.forEach((file) => {
      file.storedName = `${type}_${task.siteId}_${file.originalName}`;
    });
    updateTask(taskId, (taskItem) => {
      taskItem.documents = taskItem.documents.filter((item) => !(item.answer === "No"));
      taskItem.documents = taskItem.documents.concat(files);
    }, "addDocumentYes");
  }

  function getCurrentCoords() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6)
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  async function addPhotos(taskId) {
    const galleryFiles = Array.from(document.getElementById("photoUpload").files || []);
    const cameraFiles = Array.from(document.getElementById("cameraUpload").files || []);
    const files = [...galleryFiles, ...cameraFiles];
    if (!files.length) {
      window.alert("Please choose photo files or camera photo.");
      return;
    }
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    const coords = await getCurrentCoords();
    const next = await app.enrichFilesWithContent(task.siteId, files, coords || {});
    updateTask(taskId, (taskItem) => {
      taskItem.photos = taskItem.photos.concat(next);
    }, "addPhotos");
  }

  async function saveMeasurement(taskId) {
    const measurementText = document.getElementById("measurementText").value.trim();
    const measurementFiles = document.getElementById("measurementUpload").files;
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!measurementText && !measurementFiles.length) {
      window.alert("Please enter measurement text or choose measurement image.");
      return;
    }
    const nextFiles = measurementFiles.length ? await app.enrichFilesWithContent(task.siteId, measurementFiles, {}) : [];
    updateTask(taskId, (taskItem) => {
      taskItem.measurementText = measurementText;
      if (nextFiles.length) {
        taskItem.measurementImages = taskItem.measurementImages.concat(nextFiles);
      }
    }, "saveMeasurement");
  }

  function removeFile(taskId, type, fileId) {
    updateTask(taskId, (task) => {
      if (type === "document") task.documents = task.documents.filter((item) => item.id !== fileId);
      if (type === "photo") task.photos = task.photos.filter((item) => item.id !== fileId);
      if (type === "measurement") task.measurementImages = task.measurementImages.filter((item) => item.id !== fileId);
    }, "removeFile");
  }

  function captureGps(taskId) {
    activeTaskId = taskId;
    if (!navigator.geolocation) {
      window.alert("Geolocation is not supported on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateTask(taskId, (task) => {
          task.gps = {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            capturedAt: new Date().toISOString()
          };
        }, "captureGps");
      },
      () => window.alert("Unable to capture GPS. Please allow location permission or use map select."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function openMap(taskId = activeTaskId) {
    activeTaskId = taskId || activeTaskId;
    selectedMapPoint = null;
    document.getElementById("engineer-map-modal").classList.remove("hidden");
    if (!map) {
      map = L.map("engineer-map-picker").setView([12.9716, 77.5946], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);
      map.on("click", (event) => {
        selectedMapPoint = event.latlng;
        document.getElementById("engineer-map-selected-output").textContent = `Lat: ${event.latlng.lat.toFixed(6)}, Lng: ${event.latlng.lng.toFixed(6)}`;
        if (mapMarker) map.removeLayer(mapMarker);
        mapMarker = L.marker(event.latlng).addTo(map);
      });
    }
    setTimeout(() => map.invalidateSize(), 120);
  }

  function closeMap() {
    document.getElementById("engineer-map-modal").classList.add("hidden");
  }

  function applyMapGps() {
    if (!selectedMapPoint || !activeTaskId) {
      window.alert("Please select a point on the map.");
      return;
    }
    updateTask(activeTaskId, (task) => {
      task.gps = {
        latitude: Number(selectedMapPoint.lat.toFixed(6)),
        longitude: Number(selectedMapPoint.lng.toFixed(6)),
        capturedAt: new Date().toISOString(),
        source: "map"
      };
    }, "pickGpsOnMap");
    closeMap();
  }

  function showApp() {
    loginScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    document.getElementById("engineer-user-eyebrow").textContent = currentEngineer
      ? `Engineer Workspace | ${currentEngineer}`
      : "Engineer Workspace";
    engineerGoogleScriptInput.value = state.settings.engineer.googleScriptUrl || "";
    engineerGoogleSheetInput.value = state.settings.engineer.googleSheetId || "";
    engineerGoogleDocumentDriveInput.value = state.settings.engineer.googleDocumentFolderId || "";
    engineerGooglePhotoDriveInput.value = state.settings.engineer.googlePhotoFolderId || "";
    renderSiteList();
  }

  function showLogin() {
    loginScreen.classList.remove("hidden");
    appShell.classList.add("hidden");
    document.getElementById("engineer-user-eyebrow").textContent = "Engineer Workspace";
  }

  function openSettings() {
    engineerGoogleScriptInput.value = state.settings.engineer.googleScriptUrl || "";
    engineerGoogleSheetInput.value = state.settings.engineer.googleSheetId || "";
    engineerGoogleDocumentDriveInput.value = state.settings.engineer.googleDocumentFolderId || "";
    engineerGooglePhotoDriveInput.value = state.settings.engineer.googlePhotoFolderId || "";
    document.getElementById("engineer-settings-modal").classList.remove("hidden");
  }

  function closeSettings() {
    document.getElementById("engineer-settings-modal").classList.add("hidden");
  }

  document.getElementById("engineer-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const debug = document.getElementById("engineer-login-debug");
    const userId = engineerLoginUser.value.trim();
    const password = engineerLoginPassword.value;
    const result = await app.loginWithGoogle(state.settings.engineer, "engineer", userId, password);
    if (!result.ok) {
      debug.textContent = result.message || "Login failed.";
      debug.classList.remove("hidden");
      return;
    }
    debug.classList.add("hidden");
    currentEngineer = result.user.name || result.user.userId;
    engineerUserId = result.user.userId || "";
    app.saveEngineerSession(currentEngineer);
    showApp();
  });

  document.getElementById("engineer-logout").addEventListener("click", () => {
    currentEngineer = "";
    engineerUserId = "";
    activeTaskId = "";
    app.clearEngineerSession();
    showLogin();
  });

  document.getElementById("close-engineer-map-modal").addEventListener("click", closeMap);
  document.getElementById("save-engineer-map-point").addEventListener("click", applyMapGps);
  document.getElementById("engineer-open-settings-modal").addEventListener("click", openSettings);
  document.getElementById("engineer-login-settings").addEventListener("click", openSettings);
  document.getElementById("close-engineer-settings-modal").addEventListener("click", closeSettings);
  document.getElementById("engineer-save-google-settings").addEventListener("click", () => {
    state.settings.engineer.googleScriptUrl = engineerGoogleScriptInput.value.trim();
    state.settings.engineer.googleSheetId = engineerGoogleSheetInput.value.trim();
    state.settings.engineer.googleDocumentFolderId = engineerGoogleDocumentDriveInput.value.trim();
    state.settings.engineer.googlePhotoFolderId = engineerGooglePhotoDriveInput.value.trim();
    saveState("saveGoogleSetting", { ...state.settings.engineer });
    closeSettings();
  });

  window.addEventListener("storage", () => {
    refreshState();
    if (currentEngineer) renderSiteList();
  });

  (function init() {
    refreshState();
    if (currentEngineer) showApp();
    else showLogin();
  })();
})();
