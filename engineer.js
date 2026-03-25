(function () {
  const app = window.BlissTaskPro;
  let state = app.readState();
  let activeTaskId = "";
  let currentEngineer = app.getEngineerSession();
  let map;
  let mapMarker;
  let selectedMapPoint = null;

  const loginScreen = document.getElementById("engineer-login-screen");
  const appShell = document.getElementById("engineer-app-shell");
  const loginSelect = document.getElementById("engineer-login-select");
  const engineerGoogleScriptInput = document.getElementById("engineer-google-script-url");
  const engineerGoogleSheetInput = document.getElementById("engineer-google-sheet-id");
  const engineerGoogleDriveInput = document.getElementById("engineer-google-drive-id");

  function saveState(action, payload) {
    app.writeState(state);
    app.postGoogleSync(state, {
      app: "Bliss TaskPro",
      source: "engineer",
      action,
      payload,
      state
    });
  }

  function refreshState() {
    state = app.readState();
  }

  function renderLoginOptions() {
    app.setOptions(loginSelect, state.options.engineers, "Select Engineer");
    if (currentEngineer && state.options.engineers.includes(currentEngineer)) {
      loginSelect.value = currentEngineer;
    }
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
        <p class="meta-line">${app.formatDate(task.date)} | ${app.escapeHtml(task.district)}</p>
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

  function renderTaskDetail(taskId) {
    const task = getEngineerTasks().find((item) => item.id === taskId);
    const host = document.getElementById("engineer-task-detail");
    if (!task) {
      host.innerHTML = app.emptyMarkup("Task not found.");
      return;
    }

    const docHasYes = task.documents.some((item) => item.answer === "Yes");

    host.innerHTML = `
      <div class="detail-panel" data-task-id="${task.id}">
        <div>
          <h4>${app.escapeHtml(task.siteId)}</h4>
          <p class="meta-line">${app.escapeHtml(task.client)} | ${app.escapeHtml(task.category)} | ${app.escapeHtml(task.activity)}</p>
          <p class="meta-line">${app.formatDate(task.date)} | ${app.escapeHtml(task.location)} | ${app.escapeHtml(task.district)}</p>
          <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
        </div>

        <div class="form-grid">
          <label><span>Site Engineer Name</span><input id="siteEngineerName" type="text" value="${app.escapeHtml(task.siteEngineerName || "")}"></label>
          <label><span>Document Available</span>
            <select id="documentAnswer">
              <option value="No" ${!docHasYes ? "selected" : ""}>No</option>
              <option value="Yes" ${docHasYes ? "selected" : ""}>Yes</option>
            </select>
          </label>
        </div>

        <div id="document-config-block" class="${docHasYes ? "" : "hidden"}">
          <div class="doc-config-row">
            <label>
              <span>Document Type</span>
              <select id="documentType">
                <option value="DN">DN</option>
                <option value="ESCOMDocuments">ESCOMDocuments</option>
                <option value="Receipt">Receipt</option>
                <option value="Electrical Inspectrate">Electrical Inspectrate</option>
              </select>
            </label>
            <label>
              <span>Upload Document</span>
              <input id="documentUpload" type="file">
            </label>
            <button id="add-document" class="secondary-button" type="button">Add Document</button>
          </div>
          <ul class="file-list">${task.documents.length ? task.documents.map((item) => `<li>${app.escapeHtml(item.docType || "-")} - ${app.escapeHtml(item.storedName)} (${app.escapeHtml(item.answer)})</li>`).join("") : "<li>No documents added.</li>"}</ul>
        </div>

        <div>
          <div class="doc-config-row">
            <label><span>Upload Photos</span><input id="photoUpload" type="file" accept="image/*" multiple></label>
            <label><span>Camera</span><input id="cameraUpload" type="file" accept="image/*" capture="environment"></label>
            <button id="add-photos" class="secondary-button" type="button">Save Photos</button>
          </div>
          <ul class="file-list">${task.photos.length ? task.photos.map((item) => `<li>${app.escapeHtml(item.storedName)}${item.latitude ? ` - ${item.latitude}, ${item.longitude}` : ""}</li>`).join("") : "<li>No photos added.</li>"}</ul>
        </div>

        <div class="form-grid">
          <label class="full-span"><span>Measurement</span><textarea id="measurementText">${app.escapeHtml(task.measurementText || "")}</textarea></label>
          <label><span>Measurement Image</span><input id="measurementUpload" type="file" accept="image/*" multiple></label>
          <button id="save-measurement" class="secondary-button" type="button">Save Measurement</button>
        </div>
        <ul class="file-list">${task.measurementImages.length ? task.measurementImages.map((item) => `<li>${app.escapeHtml(item.storedName)}</li>`).join("") : "<li>No measurement images added.</li>"}</ul>

        <div class="form-grid">
          <label><span>Completion Latitude</span><input id="completionLatitude" type="number" step="any" readonly value="${task.gps?.latitude || ""}"></label>
          <label><span>Completion Longitude</span><input id="completionLongitude" type="number" step="any" readonly value="${task.gps?.longitude || ""}"></label>
        </div>
        <div class="action-row">
          <button id="capture-gps" class="secondary-button" type="button">Capture GPS Location</button>
          <button id="pick-gps-map" class="secondary-button" type="button">Open Map And Select</button>
        </div>

        <div class="action-row">
          <button id="mark-wip" class="secondary-button" type="button">WIP</button>
          <button id="mark-completed" class="primary-button" type="button">Complete</button>
        </div>
      </div>
    `;

    document.getElementById("documentAnswer").addEventListener("change", (event) => {
      document.getElementById("document-config-block").classList.toggle("hidden", event.target.value !== "Yes");
    });

    document.getElementById("add-document").addEventListener("click", () => addDocument(task.id));
    document.getElementById("add-photos").addEventListener("click", () => addPhotos(task.id));
    document.getElementById("save-measurement").addEventListener("click", () => saveMeasurement(task.id));
    document.getElementById("capture-gps").addEventListener("click", () => captureGps(task.id));
    document.getElementById("pick-gps-map").addEventListener("click", openMap);
    document.getElementById("mark-wip").addEventListener("click", () => markWip(task.id));
    document.getElementById("mark-completed").addEventListener("click", () => markCompleted(task.id));
  }

  function updateTask(taskId, updater, action) {
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return null;
    updater(task);
    task.updatedAt = new Date().toISOString();
    saveState(action, task);
    refreshState();
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
    if (!siteEngineerName || !task.gps || !task.photos.length || !task.measurementText) {
      window.alert("Please add Site Engineer Name, photos, measurement, and GPS before completion.");
      return;
    }
    updateTask(taskId, (current) => {
      current.siteEngineerName = siteEngineerName;
      current.status = "Completed";
    }, "markCompleted");
  }

  function addDocument(taskId) {
    const answer = document.getElementById("documentAnswer").value;
    if (answer === "No") {
      updateTask(taskId, (task) => {
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

    updateTask(taskId, (task) => {
      const files = app.ensurePrefixedFiles(task.siteId, fileInput.files, { answer: "Yes", docType: type });
      task.documents = task.documents.concat(files);
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
    const galleryFiles = document.getElementById("photoUpload").files;
    const cameraFiles = document.getElementById("cameraUpload").files;
    const files = [...galleryFiles, ...cameraFiles];
    if (!files.length) {
      window.alert("Please choose photo files or camera photo.");
      return;
    }

    const coords = await getCurrentCoords();
    updateTask(taskId, (task) => {
      const next = app.ensurePrefixedFiles(task.siteId, files, coords || {});
      task.photos = task.photos.concat(next);
    }, "addPhotos");
  }

  function saveMeasurement(taskId) {
    const measurementText = document.getElementById("measurementText").value.trim();
    const measurementFiles = document.getElementById("measurementUpload").files;
    updateTask(taskId, (task) => {
      task.measurementText = measurementText;
      if (measurementFiles.length) {
        task.measurementImages = task.measurementImages.concat(app.ensurePrefixedFiles(task.siteId, measurementFiles, {}));
      }
    }, "saveMeasurement");
  }

  function captureGps(taskId) {
    if (!navigator.geolocation) {
      window.alert("Geolocation not supported.");
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
      () => window.alert("Unable to capture GPS."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function openMap() {
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
    document.getElementById("logged-in-engineer").textContent = currentEngineer;
    engineerGoogleScriptInput.value = state.settings.googleScriptUrl || "";
    engineerGoogleSheetInput.value = state.settings.googleSheetId || "";
    engineerGoogleDriveInput.value = state.settings.googleDriveFolderId || "";
    renderSiteList();
  }

  function showLogin() {
    loginScreen.classList.remove("hidden");
    appShell.classList.add("hidden");
    renderLoginOptions();
  }

  function openSettings() {
    engineerGoogleScriptInput.value = state.settings.googleScriptUrl || "";
    engineerGoogleSheetInput.value = state.settings.googleSheetId || "";
    engineerGoogleDriveInput.value = state.settings.googleDriveFolderId || "";
    document.getElementById("engineer-settings-modal").classList.remove("hidden");
  }

  function closeSettings() {
    document.getElementById("engineer-settings-modal").classList.add("hidden");
  }

  document.getElementById("engineer-login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    currentEngineer = loginSelect.value;
    if (!currentEngineer) {
      window.alert("Please select engineer name.");
      return;
    }
    app.saveEngineerSession(currentEngineer);
    showApp();
  });

  document.getElementById("engineer-logout").addEventListener("click", () => {
    currentEngineer = "";
    activeTaskId = "";
    app.clearEngineerSession();
    showLogin();
  });

  document.getElementById("close-engineer-map-modal").addEventListener("click", closeMap);
  document.getElementById("save-engineer-map-point").addEventListener("click", applyMapGps);
  document.getElementById("engineer-open-settings-modal").addEventListener("click", openSettings);
  document.getElementById("close-engineer-settings-modal").addEventListener("click", closeSettings);
  document.getElementById("engineer-save-google-settings").addEventListener("click", () => {
    state.settings.googleScriptUrl = engineerGoogleScriptInput.value.trim();
    state.settings.googleSheetId = engineerGoogleSheetInput.value.trim();
    state.settings.googleDriveFolderId = engineerGoogleDriveInput.value.trim();
    saveState("saveGoogleSetting", { ...state.settings });
    closeSettings();
    window.alert("Google settings saved.");
  });
  window.addEventListener("storage", () => {
    refreshState();
    if (currentEngineer) renderSiteList();
  });

  (function init() {
    refreshState();
    renderLoginOptions();
    if (currentEngineer) {
      showApp();
    } else {
      showLogin();
    }
  })();
})();
