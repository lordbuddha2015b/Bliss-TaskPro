(function () {
  const app = window.BlissTaskPro;
  let state = app.readState();
  let activeTaskId = "";
  let engineerSession = app.getEngineerSession();
  let currentEngineer = engineerSession?.name || "";
  let engineerUserId = engineerSession?.userId || "";
  let map;
  let mapMarker;
  let selectedMapPoint = null;
  let liveSaveTimer = null;
  let syncTimer = null;
  let sessionTimer = null;

  const loginScreen = document.getElementById("engineer-login-screen");
  const appShell = document.getElementById("engineer-app-shell");
  const engineerLoginUser = document.getElementById("engineer-login-user");
  const engineerLoginPassword = document.getElementById("engineer-login-password");
  const engineerGoogleScriptInput = document.getElementById("engineer-google-script-url");
  const engineerGoogleSheetInput = document.getElementById("engineer-google-sheet-id");
  const engineerGoogleDocumentDriveInput = document.getElementById("engineer-google-document-drive-id");
  const engineerGooglePhotoDriveInput = document.getElementById("engineer-google-photo-drive-id");
  const engineerAutoSyncInput = document.getElementById("engineer-auto-sync");
  const engineerSyncButton = document.getElementById("engineer-sync-button");

  function applyRemoteState(remoteState) {
    if (!remoteState) return;
    state.options = { ...state.options, ...(remoteState.options || {}) };
    state.drafts = Array.isArray(remoteState.drafts) ? remoteState.drafts : state.drafts;
    state.tasks = Array.isArray(remoteState.tasks) ? remoteState.tasks : state.tasks;
    app.writeState(state);
    renderSiteList();
  }

  function forceLogout(message) {
    currentEngineer = "";
    engineerUserId = "";
    engineerSession = null;
    activeTaskId = "";
    app.clearEngineerSession();
    stopCrossDeviceSync();
    if (message) {
      app.showSyncStatus(message, "error");
      window.alert(message);
    }
    showLogin();
  }

  function saveState(action, payload) {
    app.writeState(state);
    if (!engineerSession?.userId || !engineerSession?.sessionToken) return;
    app.showSyncStatus("Saving data to Google Sheet and Drive...", "working", true);
    app.postGoogleSync(state, {
      app: "Bliss TaskPro",
      source: "engineer",
      userId: engineerUserId,
      sessionToken: engineerSession?.sessionToken || "",
      action,
      payload,
      state
    }).then((result) => {
      if (result?.sessionExpired) {
        forceLogout("This Engineer login was used on another device. Please login again.");
        return;
      }
      if (result?.error) {
        app.showSyncStatus(result.error.message || "Sync failed. Data is still cached on this device.", "error");
        return;
      }
      if (result?.skipped) {
        app.showSyncStatus("Saved locally. Add Apps Script settings to enable cloud sync.", "idle");
        return;
      }
      app.showSyncStatus("Saved to Google Sheet and Drive successfully.", "success");
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
      <li class="file-card-item">
        <div class="preview-card">
          ${isImageFile(item) && (item.previewUrl || item.thumbnailUrl)
            ? `<img class="photo-preview" src="${item.previewUrl || item.thumbnailUrl}" alt="${app.escapeHtml(item.storedName || item.name || `File ${index + 1}`)}">`
            : `<span class="frozen-chip">${app.escapeHtml(item.docType || "File")}</span>`}
          <span class="preview-name">${app.escapeHtml(item.storedName || item.name || `File ${index + 1}`)}</span>
          ${editable ? `<button class="mini-button" type="button" data-remove="${removeAction}" data-file-id="${item.id}">Remove</button>` : ""}
        </div>
      </li>
    `).join("");
  }

  function imagePreviewMarkup(items, removeAction, editable) {
    if (!items.length) return '<span class="fine-print">No photos added.</span>';
    return items.map((item) => `
      <div class="preview-card">
        ${item.previewUrl || item.thumbnailUrl ? `<img class="photo-preview" src="${item.previewUrl || item.thumbnailUrl}" alt="${app.escapeHtml(item.storedName)}">` : `<span class="frozen-chip">${app.escapeHtml(item.storedName)}</span>`}
        <span class="preview-name">${app.escapeHtml(item.storedName || item.name || "Photo")}</span>
        ${editable ? `<button class="mini-button" type="button" data-remove="${removeAction}" data-file-id="${item.id}">Remove</button>` : ""}
      </div>
    `).join("");
  }

  function isImageFile(item) {
    const fileType = String(item?.type || item?.mimeType || "").toLowerCase();
    const fileName = String(item?.storedName || item?.name || "").toLowerCase();
    return fileType.startsWith("image/")
      || /\.(png|jpe?g|gif|bmp|webp|svg)$/.test(fileName);
  }

  function renderTaskDetail(taskId, documentAnswerOverride) {
    const task = getEngineerTasks().find((item) => item.id === taskId);
    const host = document.getElementById("engineer-task-detail");
    if (!task) {
      host.innerHTML = app.emptyMarkup("Task not found.");
      return;
    }

    const isCompleted = task.status === "Completed";
    const canEdit = task.status === "WIP";
    const canStartWip = task.status === "Pending";
    const docHasYes = task.documents.some((item) => item.answer === "Yes");
    const documentAnswer = documentAnswerOverride || (docHasYes ? "Yes" : "No");
    const showDocumentFields = documentAnswer === "Yes" && canEdit && !isCompleted;

    host.innerHTML = `
      <div class="detail-panel" data-task-id="${task.id}">
        <div class="task-hero">
          <div class="task-hero-main">
            <h4>Site ID: ${app.escapeHtml(task.siteId)}</h4>
            <p class="task-hero-client">Client: ${app.escapeHtml(task.client)}</p>
            <p class="meta-line"><strong>Category:</strong> ${app.escapeHtml(task.category)}</p>
            <p class="meta-line"><strong>Activity:</strong> ${app.escapeHtml(task.activity)}</p>
          </div>
          <div class="task-hero-side">
            <p><strong>Date:</strong> ${app.formatDate(task.date)}</p>
            <p><strong>Location:</strong> ${app.escapeHtml(task.location)}</p>
            <p><strong>District:</strong> ${app.escapeHtml(task.district || "-")}</p>
          </div>
        </div>

        <div class="action-row action-row-top">
          ${canStartWip ? '<button id="mark-wip" class="secondary-button" type="button">WIP</button>' : ''}
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
              <select id="documentAnswer" ${!canEdit || isCompleted ? "disabled" : ""}>
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
          <div class="action-row">
            ${canEdit && !isCompleted ? '<button id="capture-gps" class="secondary-button" type="button">Capture GPS Location</button><button id="pick-gps-map" class="secondary-button" type="button">Open Map And Select</button><button id="clear-gps" class="secondary-button" type="button">Clear Location</button>' : ''}
          </div>
          <div class="form-grid">
            <label><span>Completion Latitude</span><input id="completionLatitude" type="number" step="any" readonly value="${task.gps?.latitude || ""}"></label>
            <label><span>Completion Longitude</span><input id="completionLongitude" type="number" step="any" readonly value="${task.gps?.longitude || ""}"></label>
            <label><span>District</span><select id="completionDistrict" ${!canEdit || isCompleted ? "disabled" : ""}></select></label>
          </div>
        </section>

        <div class="action-row">
          ${canEdit && !isCompleted ? '<button id="mark-completed" class="primary-button" type="button">Complete</button>' : ''}
        </div>
      </div>
    `;

    app.setOptions(document.getElementById("completionDistrict"), state.options.districts, "Select District");
    document.getElementById("completionDistrict").value = task.district || "";

    if (canEdit && !isCompleted) {
      document.getElementById("documentAnswer").addEventListener("change", (event) => {
        renderTaskDetail(task.id, event.target.value);
      });
      document.getElementById("add-document")?.addEventListener("click", () => addDocument(task.id));
      document.getElementById("add-photos")?.addEventListener("click", () => addPhotos(task.id));
      document.getElementById("save-measurement")?.addEventListener("click", () => saveMeasurement(task.id));
      document.getElementById("capture-gps")?.addEventListener("click", () => captureGps(task.id));
      document.getElementById("pick-gps-map")?.addEventListener("click", () => openMap(task.id));
      document.getElementById("clear-gps")?.addEventListener("click", () => clearGps(task.id));
      document.getElementById("mark-completed")?.addEventListener("click", () => markCompleted(task.id));
      document.getElementById("siteEngineerName")?.addEventListener("change", () => scheduleLiveTaskUpdate(task.id));
      document.getElementById("measurementText")?.addEventListener("change", () => scheduleLiveTaskUpdate(task.id));
      document.getElementById("completionDistrict")?.addEventListener("change", (event) => {
        updateTask(task.id, (taskItem) => {
          taskItem.district = String(event.target.value || "");
        }, "updateDistrict");
      });
      host.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => removeFile(task.id, button.dataset.remove, button.dataset.fileId));
      });
    }
    document.getElementById("mark-wip")?.addEventListener("click", () => markWip(task.id));
  }

  function updateTask(taskId, updater, action) {
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return null;
    const previousTaskId = task.id;
    updater(task);
    task.updatedAt = new Date().toISOString();
    if (task.id && task.id !== previousTaskId) {
      activeTaskId = task.id;
    }
    saveState(action, task);
    renderSiteList();
    return task;
  }

  function collectSiteEngineerName() {
    return document.getElementById("siteEngineerName")?.value.trim() || "";
  }

  function scheduleLiveTaskUpdate(taskId) {
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task || task.status !== "WIP") return;
    clearTimeout(liveSaveTimer);
    liveSaveTimer = setTimeout(() => {
      updateTask(taskId, (taskItem) => {
        taskItem.siteEngineerName = collectSiteEngineerName();
        const measurementText = document.getElementById("measurementText")?.value.trim();
        if (typeof measurementText === "string") {
          taskItem.measurementText = measurementText;
        }
      }, "liveWipUpdate");
    }, 350);
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
      task.id = app.toLifecycleTaskId(task.id || task.baseTaskId || task.draftId, "WIP");
      task.baseTaskId = app.extractTaskBaseId(task.id);
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
      current.id = app.toLifecycleTaskId(current.id || current.baseTaskId || current.draftId, "Completed");
      current.baseTaskId = app.extractTaskBaseId(current.id);
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
    next.forEach((file) => {
      file.storedName = coords
        ? `${task.siteId}_${coords.latitude}_${coords.longitude}_${file.originalName}`
        : `${task.siteId}_${file.originalName}`;
    });
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

  function clearGps(taskId) {
    updateTask(taskId, (task) => {
      task.gps = null;
      task.district = "";
    }, "clearGps");
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
          task.district = document.getElementById("completionDistrict")?.value || task.district || "";
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
    app.reverseGeocodeDistrict(selectedMapPoint.lat.toFixed(6), selectedMapPoint.lng.toFixed(6)).then((district) => {
      updateTask(activeTaskId, (task) => {
        task.gps = {
          latitude: Number(selectedMapPoint.lat.toFixed(6)),
          longitude: Number(selectedMapPoint.lng.toFixed(6)),
          capturedAt: new Date().toISOString(),
          source: "map"
        };
        task.district = district || task.district || "";
      }, "pickGpsOnMap");
      closeMap();
    });
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
    engineerAutoSyncInput.checked = state.settings.engineer.autoSyncEnabled !== false;
    renderSiteList();
  }

  async function syncFromGoogleState(options = {}) {
    const { silent = false } = options;
    if (!engineerSession?.userId || !engineerSession?.sessionToken) return;
    if (engineerSyncButton) {
      engineerSyncButton.disabled = true;
      engineerSyncButton.textContent = "Syncing...";
    }
    if (!silent) app.showSyncStatus("Fetching latest updates from Google Sheets and Drive...", "working", true);
    const remoteState = await app.fetchGoogleState(state.settings.engineer, engineerSession);
    if (remoteState?.sessionExpired) {
      forceLogout("This Engineer login was used on another device. Please login again.");
      return;
    }
    if (remoteState?.ok && remoteState.state) {
      applyRemoteState(remoteState.state);
      if (!silent) app.showSyncStatus("Latest updates synced on this device.", "success");
    } else if (!silent && !remoteState) {
      app.showSyncStatus("Unable to reach Google right now. Cached data is still available.", "error");
    }
    if (engineerSyncButton) {
      engineerSyncButton.disabled = false;
      engineerSyncButton.textContent = "Sync";
    }
  }

  async function validateActiveSession(options = {}) {
    const { silent = true } = options;
    if (!engineerSession?.userId || !engineerSession?.sessionToken) {
      if (engineerSession) forceLogout("Session expired. Please login again.");
      return false;
    }
    const result = await app.validateGoogleSession(state.settings.engineer, engineerSession);
    if (result?.ok) return true;
    if (result?.sessionExpired) {
      forceLogout("This Engineer login was used on another device. Please login again.");
      return false;
    }
    if (!silent) {
      app.showSyncStatus(result?.message || "Unable to validate session right now.", "error");
    }
    return true;
  }

  function startCrossDeviceSync() {
    clearInterval(syncTimer);
    clearInterval(sessionTimer);
    if (!state.settings.engineer.googleScriptUrl || !engineerSession?.userId || !engineerSession?.sessionToken) return;
    sessionTimer = setInterval(() => {
      validateActiveSession({ silent: true });
    }, 15000);
    if (state.settings.engineer.autoSyncEnabled === false) return;
    syncTimer = setInterval(() => {
      syncFromGoogleState({ silent: true });
    }, 10000);
  }

  function stopCrossDeviceSync() {
    clearInterval(syncTimer);
    clearInterval(sessionTimer);
    syncTimer = null;
    sessionTimer = null;
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

  function clearCacheAndReset() {
    const confirmed = window.confirm("Clear all cached Bliss TaskPro data on this device and logout?");
    if (!confirmed) return;
    stopCrossDeviceSync();
    app.clearLocalCache();
    engineerSession = null;
    currentEngineer = "";
    engineerUserId = "";
    state = app.readState();
    app.showSyncStatus("Cache cleared on this device.", "success");
    window.location.reload();
  }

  async function autofillEngineerSettings() {
    const config = await app.fetchGoogleConfig(state.settings.engineer);
    if (!config) return;
    state.settings.engineer = app.mergeGoogleSettings(state.settings.engineer, config);
    app.writeState(state);
  }

  async function runPostLoginRefresh(options = {}) {
    const { silent = false } = options;
    await autofillEngineerSettings();
    refreshState();
    renderSiteList();
    await syncFromGoogleState({ silent });
    if (engineerSession) startCrossDeviceSync();
  }

  document.getElementById("engineer-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const debug = document.getElementById("engineer-login-debug");
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const userId = engineerLoginUser.value.trim();
    const password = engineerLoginPassword.value;
    debug.classList.add("hidden");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Signing In...";
    }
    app.showSyncStatus("Checking Engineer login...", "working", true);
    const result = await app.loginWithGoogle(state.settings.engineer, "engineer", userId, password);
    if (!result.ok) {
      debug.textContent = app.formatLoginFailure(result);
      debug.classList.remove("hidden");
      app.showSyncStatus(app.formatLoginFailure(result), "error");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Login To Engineer App";
      }
      return;
    }
    debug.classList.add("hidden");
    engineerSession = {
      userId: result.user.userId || "",
      name: result.user.name || result.user.userId,
      role: "engineer",
      sessionToken: result.sessionToken || "",
      sessionUpdatedAt: result.sessionUpdatedAt || ""
    };
    currentEngineer = engineerSession.name;
    engineerUserId = engineerSession.userId;
    app.saveEngineerSession(engineerSession);
    refreshState();
    showApp();
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Login To Engineer App";
    }
    app.showSyncStatus("Engineer login success. Fetching latest data in background...", "working");
    runPostLoginRefresh({ silent: false });
  });

  document.getElementById("engineer-logout").addEventListener("click", () => {
    forceLogout("");
  });

  document.getElementById("close-engineer-map-modal").addEventListener("click", closeMap);
  document.getElementById("save-engineer-map-point").addEventListener("click", applyMapGps);
  engineerSyncButton?.addEventListener("click", syncFromGoogleState);
  document.getElementById("engineer-open-settings-modal").addEventListener("click", openSettings);
  document.getElementById("engineer-login-settings").addEventListener("click", openSettings);
  document.getElementById("engineer-advanced-settings-toggle").addEventListener("click", () => {
    document.getElementById("engineer-advanced-settings").classList.toggle("hidden");
  });
  document.getElementById("engineer-clear-cache").addEventListener("click", clearCacheAndReset);
  document.getElementById("close-engineer-settings-modal").addEventListener("click", closeSettings);
  document.getElementById("engineer-save-google-settings").addEventListener("click", () => {
    state.settings.engineer = app.mergeGoogleSettings(state.settings.engineer, {
      googleScriptUrl: engineerGoogleScriptInput.value,
      googleSheetId: engineerGoogleSheetInput.value,
      googleDocumentFolderId: engineerGoogleDocumentDriveInput.value,
      googlePhotoFolderId: engineerGooglePhotoDriveInput.value,
      autoSyncEnabled: engineerAutoSyncInput.checked
    });
    app.writeState(state);
    autofillEngineerSettings().finally(() => {
      refreshState();
      saveState("saveGoogleSetting", { ...state.settings.engineer });
      syncFromGoogleState({ silent: false });
      startCrossDeviceSync();
      closeSettings();
    });
  });

  window.addEventListener("storage", () => {
    refreshState();
    if (currentEngineer) renderSiteList();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !engineerSession) return;
    validateActiveSession({ silent: true }).then((isValid) => {
      if (isValid) syncFromGoogleState({ silent: true });
    });
  });

  (async function init() {
    refreshState();
    if (!state.options.districts.length) {
      app.loadDistricts().then((districts) => {
        state.options.districts = districts;
        app.writeState(state);
      }).catch(() => {});
    }
    if (engineerSession) {
      const isValid = await validateActiveSession({ silent: true });
      if (!isValid) return;
      await syncFromGoogleState({ silent: true });
      startCrossDeviceSync();
      showApp();
    } else showLogin();
  })();
})();
