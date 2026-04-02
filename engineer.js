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
  let remoteTaskCache = {};
  let uploadStateByTaskId = {};

  const loginScreen = document.getElementById("engineer-login-screen");
  const appShell = document.getElementById("engineer-app-shell");
  const engineerLoginUser = document.getElementById("engineer-login-user");
  const engineerLoginPassword = document.getElementById("engineer-login-password");
  const engineerGoogleScriptInput = document.getElementById("engineer-google-script-url");
  const engineerAutoSyncInput = document.getElementById("engineer-auto-sync");
  const engineerSyncButton = document.getElementById("engineer-sync-button");

  function captureActiveFormState() {
    if (!activeTaskId) return null;
    return {
      taskId: activeTaskId,
      siteEngineerName: document.getElementById("siteEngineerName")?.value ?? null,
      measurementText: document.getElementById("measurementText")?.value ?? null,
      documentAnswer: document.getElementById("documentAnswer")?.value ?? null
    };
  }

  function applyActiveFormState(snapshot) {
    if (!snapshot || snapshot.taskId !== activeTaskId) return;
    const siteEngineerInput = document.getElementById("siteEngineerName");
    const measurementInput = document.getElementById("measurementText");
    const documentAnswerInput = document.getElementById("documentAnswer");
    if (siteEngineerInput && snapshot.siteEngineerName !== null) {
      siteEngineerInput.value = snapshot.siteEngineerName;
    }
    if (measurementInput && snapshot.measurementText !== null) {
      measurementInput.value = snapshot.measurementText;
    }
    if (documentAnswerInput && snapshot.documentAnswer !== null) {
      documentAnswerInput.value = snapshot.documentAnswer;
    }
  }

  function applyRemoteState(remoteState) {
    if (!remoteState) return;
    const activeFormSnapshot = captureActiveFormState();
    state.options = { ...state.options, ...(remoteState.options || {}) };
    if (Array.isArray(remoteState.tasks)) {
      if (activeTaskId) {
        const localActiveTask = state.tasks.find((task) => task.id === activeTaskId);
        state.tasks = remoteState.tasks.map((task) => {
          if (task.id !== activeTaskId || !localActiveTask) return task;
          return { ...localActiveTask };
        });
      } else {
        state.tasks = remoteState.tasks;
      }
    }
    app.writeState(state);
    renderSiteList();
    applyActiveFormState(activeFormSnapshot);
  }

  function mergeDriveFiles(localItems, remoteItems, extra = {}) {
    const map = new Map();
    (localItems || []).forEach((item) => {
      const key = String(item.id || item.storedName || item.name || "");
      if (!key) return;
      map.set(key, { ...item, ...extra });
    });
    (remoteItems || []).forEach((item) => {
      const key = String(item.id || item.storedName || item.name || "");
      if (!key) return;
      map.set(key, {
        ...(map.get(key) || {}),
        ...item,
        storedName: item.storedName || item.name || map.get(key)?.storedName || "",
        ...extra
      });
    });
    return Array.from(map.values());
  }

  function mergeRemoteTaskAssets(task, remoteTask) {
    if (!task || !remoteTask?.ok) return task;
    const merged = {
      ...task,
      documents: mergeDriveFiles(task.documents, remoteTask.documents || []),
      photos: mergeDriveFiles(task.photos, remoteTask.photos || []),
      measurementImages: mergeDriveFiles(task.measurementImages, remoteTask.measurementImages || []),
      measurementText: remoteTask.latestRow?.["Measurement Text"] || task.measurementText,
      gps: remoteTask.latestRow?.["GPS Latitude"] || remoteTask.latestRow?.["GPS Longitude"]
        ? {
            latitude: remoteTask.latestRow["GPS Latitude"] || "",
            longitude: remoteTask.latestRow["GPS Longitude"] || ""
          }
        : task.gps,
      rollbackReason: remoteTask.latestRow?.["Rollback Reason"] || task.rollbackReason,
      updatedAt: new Date().toISOString()
    };
    const taskIndex = state.tasks.findIndex((item) => item.id === task.id && item.engineer === currentEngineer);
    if (taskIndex >= 0) {
      state.tasks[taskIndex] = merged;
      app.writeState(state);
    }
    remoteTaskCache[task.id] = remoteTask;
    return merged;
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

  function refreshState() {
    state = app.readState();
  }

  function getEngineerTasks() {
    const taskMap = new Map();
    state.tasks
      .filter((task) => task.engineer === currentEngineer)
      .forEach((task) => {
        const key = `${task.siteId || ""}::${task.baseTaskId || app.extractTaskBaseId(task.id) || task.id}`;
        const existing = taskMap.get(key);
        const nextStamp = String(task.updatedAt || task.createdAt || "");
        const existingStamp = String(existing?.updatedAt || existing?.createdAt || "");
        if (!existing || nextStamp >= existingStamp) {
          taskMap.set(key, task);
        }
      });
    return Array.from(taskMap.values());
  }

  function getUploadState(taskId) {
    return uploadStateByTaskId[taskId] || { busy: false, section: "", message: "", progressText: "" };
  }

  function setUploadState(taskId, nextState) {
    uploadStateByTaskId = {
      ...uploadStateByTaskId,
      [taskId]: {
        ...getUploadState(taskId),
        ...nextState
      }
    };
    if (activeTaskId === taskId) renderTaskDetail(taskId);
  }

  function clearUploadState(taskId) {
    if (!uploadStateByTaskId[taskId]) return;
    uploadStateByTaskId = { ...uploadStateByTaskId };
    delete uploadStateByTaskId[taskId];
    if (activeTaskId === taskId) renderTaskDetail(taskId);
  }

  function isUploadBusy(taskId = activeTaskId) {
    return !!getUploadState(taskId).busy;
  }

  function renderStats(tasks) {
    document.getElementById("engineer-total-tasks").textContent = tasks.length;
    document.getElementById("engineer-wip-tasks").textContent = app.countByStatus(tasks, "WIP");
    document.getElementById("engineer-completed-tasks").textContent = app.countByStatus(tasks, "Completed");
  }

  function renderSiteList() {
    const tasks = getEngineerTasks();
    const host = document.getElementById("engineer-site-list");
    const detailHost = document.getElementById("engineer-task-detail");
    renderStats(tasks);

    if (!tasks.length) {
      host.innerHTML = '<tr><td colspan="8"><div class="empty-state">No tasks assigned.</div></td></tr>';
      activeTaskId = "";
      detailHost.innerHTML = app.emptyMarkup("Click a Site ID to fetch task details.");
      return;
    }

    host.innerHTML = tasks.slice().reverse().map((task, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><button class="site-link-button" data-task-id="${task.id}">${app.escapeHtml(task.siteId)}</button></td>
        <td>${app.escapeHtml(task.engineer)}</td>
        <td>${app.escapeHtml(task.siteEngineerName || "-")}</td>
        <td>${app.escapeHtml(task.district || "-")}</td>
        <td>${task.documents.filter((item) => item.answer === "Yes").length}</td>
        <td>${task.photos.length}</td>
        <td><button class="secondary-button status-action-button" data-task-id="${task.id}">${task.status}</button></td>
      </tr>
    `).join("");

    host.querySelectorAll("[data-task-id]").forEach((button) => {
      button.addEventListener("click", () => {
        activeTaskId = button.dataset.taskId;
        renderTaskDetail(activeTaskId);
      });
    });

    if (!activeTaskId) {
      detailHost.innerHTML = app.emptyMarkup("Click a Site ID to open task details.");
      return;
    }
    if (!tasks.some((task) => task.id === activeTaskId)) {
      activeTaskId = "";
      detailHost.innerHTML = app.emptyMarkup("Click a Site ID to open task details.");
      return;
    }
    renderTaskDetail(activeTaskId);
  }

  function fileListMarkup(items, removeAction, editable, disabled = false) {
    if (!items.length) return "<li>No files added.</li>";
    return items.map((item, index) => `
      <li class="file-card-item">
        <div class="preview-card">
          ${isImageFile(item) && (item.previewUrl || item.thumbnailUrl)
            ? `<img class="photo-preview" src="${item.previewUrl || item.thumbnailUrl}" alt="${app.escapeHtml(item.storedName || item.name || `File ${index + 1}`)}">`
            : `<span class="frozen-chip">${app.escapeHtml(item.docType || "File")}</span>`}
          <span class="preview-name">${app.escapeHtml(item.storedName || item.name || `File ${index + 1}`)}</span>
          ${editable ? `<button class="mini-button" type="button" data-remove="${removeAction}" data-file-id="${item.id}" ${disabled ? "disabled" : ""}>Remove</button>` : ""}
        </div>
      </li>
    `).join("");
  }

  function imagePreviewMarkup(items, removeAction, editable, disabled = false) {
    if (!items.length) return '<span class="fine-print">No photos added.</span>';
    return items.map((item) => `
      <div class="preview-card">
        ${item.previewUrl || item.thumbnailUrl ? `<img class="photo-preview" src="${item.previewUrl || item.thumbnailUrl}" alt="${app.escapeHtml(item.storedName)}">` : `<span class="frozen-chip">${app.escapeHtml(item.storedName)}</span>`}
        <span class="preview-name">${app.escapeHtml(item.storedName || item.name || "Photo")}</span>
        ${editable ? `<button class="mini-button" type="button" data-remove="${removeAction}" data-file-id="${item.id}" ${disabled ? "disabled" : ""}>Remove</button>` : ""}
      </div>
    `).join("");
  }

  function isImageFile(item) {
    const fileType = String(item?.type || item?.mimeType || "").toLowerCase();
    const fileName = String(item?.storedName || item?.name || "").toLowerCase();
    return fileType.startsWith("image/")
      || /\.(png|jpe?g|gif|bmp|webp|svg)$/.test(fileName);
  }

  async function renderTaskDetail(taskId, documentAnswerOverride) {
    let task = getEngineerTasks().find((item) => item.id === taskId);
    const host = document.getElementById("engineer-task-detail");
    if (!task) {
      host.innerHTML = app.emptyMarkup("Task not found.");
      return;
    }
    const uploadState = getUploadState(task.id);
    if (!uploadState.busy) {
      host.innerHTML = app.emptyMarkup("Loading Site ID details...");
      const remoteTask = await app.fetchGoogleTask(state.settings.engineer, task.siteId, engineerSession);
      if (remoteTask?.sessionExpired) {
        forceLogout("This Engineer login was used on another device. Please login again.");
        return;
      }
      task = mergeRemoteTaskAssets(task, remoteTask);
    }

    const isCompleted = task.status === "Completed";
    const canEdit = task.status === "WIP";
    const canStartWip = task.status === "Pending";
    const isUploading = !!uploadState.busy;
    const disableActions = isUploading || isCompleted;
    const sectionProgress = (section) => uploadState.section === section && uploadState.progressText
      ? `<p class="fine-print">${app.escapeHtml(uploadState.progressText)}</p>`
      : "";
    const sectionMessage = (section) => uploadState.section === section && uploadState.message
      ? `<p class="fine-print">${app.escapeHtml(uploadState.message)}</p>`
      : "";
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
            <p><strong>Latitude:</strong> ${app.escapeHtml(task.latitude || task.gps?.latitude || "-")}</p>
            <p><strong>Longitude:</strong> ${app.escapeHtml(task.longitude || task.gps?.longitude || "-")}</p>
            <p><strong>District:</strong> ${app.escapeHtml(task.district || "-")}</p>
          </div>
        </div>

        <div class="action-row action-row-top">
          ${canStartWip ? `<button id="mark-wip" class="secondary-button" type="button" ${isUploading ? "disabled" : ""}>WIP</button>` : ''}
          <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
        </div>
        ${isUploading ? `<div class="update-box"><p class="fine-print">${app.escapeHtml(uploadState.message || "Uploading files...")}</p><p class="fine-print">${app.escapeHtml(uploadState.progressText || "Saving to Google Drive...")}</p></div>` : ""}

        <section class="update-box">
          <h5>Site Engineer Name</h5>
          <label><span>Name</span><input id="siteEngineerName" type="text" value="${app.escapeHtml(task.siteEngineerName || "")}" ${disableActions ? "disabled" : ""}></label>
          <p class="fine-print">${isCompleted ? "Completed task is frozen." : "Required before marking WIP."}</p>
        </section>

        <section class="update-box">
          <h5>Document Available</h5>
          <div class="form-grid">
            <label><span>Document Available</span>
              <select id="documentAnswer" ${!canEdit || disableActions ? "disabled" : ""}>
                <option value="No" ${documentAnswer === "No" ? "selected" : ""}>No</option>
                <option value="Yes" ${documentAnswer === "Yes" ? "selected" : ""}>Yes</option>
              </select>
            </label>
            ${showDocumentFields ? `
              <label><span>Document Type</span>
                <select id="documentType" ${isUploading ? "disabled" : ""}>
                  <option value="DN">DN</option>
                  <option value="ESCOMDocuments">ESCOMDocuments</option>
                  <option value="Receipt">Receipt</option>
                  <option value="Electrical Inspectrate">Electrical Inspectrate</option>
                </select>
              </label>
              <label class="full-span" id="document-upload-wrap"><span>Upload Document</span><input id="documentUpload" type="file" ${isUploading ? "disabled" : ""}></label>
            ` : ""}
          </div>
          <div class="action-row">
            ${showDocumentFields ? `<button id="add-document" class="secondary-button" type="button" ${isUploading ? "disabled" : ""}>Add Document</button>` : ''}
          </div>
          ${sectionMessage("document")}
          ${sectionProgress("document")}
          <ul class="file-list">${fileListMarkup(task.documents, "document", canEdit && !isCompleted, isUploading)}</ul>
        </section>

        <section class="update-box">
          <h5>Site Photos</h5>
          <div class="doc-config-row">
            <label><span>Select Photos</span><input id="photoUpload" type="file" accept="image/*" multiple ${!canEdit || disableActions ? "disabled" : ""}></label>
          </div>
          <div class="action-row">
            ${canEdit && !isCompleted ? `<button id="add-photos" class="secondary-button" type="button" ${isUploading ? "disabled" : ""}>Save Photos</button>` : ''}
          </div>
          ${sectionMessage("photo")}
          ${sectionProgress("photo")}
          <div class="photo-preview-grid">${imagePreviewMarkup(task.photos, "photo", canEdit && !isCompleted, isUploading)}</div>
        </section>

        <section class="update-box">
          <h5>Measurement</h5>
          <div class="form-grid">
            <label class="full-span"><span>Measurement Text</span><textarea id="measurementText" ${disableActions ? "disabled" : ""}>${app.escapeHtml(task.measurementText || "")}</textarea></label>
            <label><span>Measurement Image</span><input id="measurementUpload" type="file" accept="image/*" multiple ${!canEdit || disableActions ? "disabled" : ""}></label>
          </div>
          <div class="action-row">
            ${canEdit && !isCompleted ? `<button id="save-measurement" class="secondary-button" type="button" ${isUploading ? "disabled" : ""}>Save Measurement</button>` : ''}
          </div>
          ${sectionMessage("measurement")}
          ${sectionProgress("measurement")}
          <ul class="file-list">${fileListMarkup(task.measurementImages, "measurement", canEdit && !isCompleted, isUploading)}</ul>
        </section>

        <section class="update-box">
          <h5>Location Capture</h5>
          <div class="action-row">
            ${canEdit && !isCompleted ? `<button id="capture-gps" class="secondary-button" type="button" ${isUploading ? "disabled" : ""}>Capture GPS Location</button><button id="pick-gps-map" class="secondary-button" type="button" ${isUploading ? "disabled" : ""}>Open Map And Select</button><button id="clear-gps" class="secondary-button" type="button" ${isUploading ? "disabled" : ""}>Clear Location</button>` : ''}
          </div>
          <div class="form-grid">
            <label><span>Completion Latitude</span><input id="completionLatitude" type="number" step="any" readonly value="${task.gps?.latitude || ""}"></label>
            <label><span>Completion Longitude</span><input id="completionLongitude" type="number" step="any" readonly value="${task.gps?.longitude || ""}"></label>
            <label><span>District</span><input id="completionDistrict" type="text" readonly value="${app.escapeHtml(task.district || "-")}"></label>
          </div>
        </section>

        <div class="action-row">
          ${canEdit && !isCompleted ? `<button id="mark-completed" class="primary-button" type="button" ${isUploading ? "disabled" : ""}>Complete</button>` : ''}
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
      document.getElementById("clear-gps")?.addEventListener("click", () => clearGps(task.id));
      document.getElementById("mark-completed")?.addEventListener("click", () => markCompleted(task.id));
      document.getElementById("siteEngineerName")?.addEventListener("change", () => scheduleLiveTaskUpdate(task.id));
      document.getElementById("measurementText")?.addEventListener("change", () => scheduleLiveTaskUpdate(task.id));
      host.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => removeFile(task.id, button.dataset.remove, button.dataset.fileId));
      });
    }
    document.getElementById("mark-wip")?.addEventListener("click", () => markWip(task.id));
  }

  async function saveState(action, payload, options = {}) {
    const {
      statusMessage = "Saving data to Google Sheet and Drive...",
      successMessage = "Saved to Google Sheet and Drive successfully.",
      skippedMessage = "Saved locally. Add Apps Script settings to enable cloud sync.",
      showStatus = true
    } = options;
    app.writeState(state);
    if (!engineerSession?.userId || !engineerSession?.sessionToken) return { skipped: true };
    if (showStatus && statusMessage) app.showSyncStatus(statusMessage, "working", true);
    const result = await app.postGoogleSync(state, {
      app: "Bliss TaskPro",
      source: "engineer",
      userId: engineerUserId,
      sessionToken: engineerSession?.sessionToken || "",
      action,
      payload,
      state
    });
    if (result?.sessionExpired) {
      forceLogout("This Engineer login was used on another device. Please login again.");
      return result;
    }
    if (result?.error) {
      if (showStatus) app.showSyncStatus(result.error.message || "Sync failed. Data is still cached on this device.", "error");
      return result;
    }
    if (result?.skipped) {
      if (showStatus) app.showSyncStatus(skippedMessage, "idle");
      return result;
    }
    if (showStatus && successMessage) app.showSyncStatus(successMessage, "success");
    return result;
  }

  async function updateTask(taskId, updater, action, options = {}) {
    const { skipSave = false, skipRender = false, saveOptions = {} } = options;
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return null;
    const previousTaskId = task.id;
    updater(task);
    task.updatedAt = new Date().toISOString();
    if (task.id && task.id !== previousTaskId) {
      activeTaskId = task.id;
    }
    app.writeState(state);
    if (!skipSave) {
      await saveState(action, task, saveOptions);
    }
    if (!skipRender) renderSiteList();
    return task;
  }

  function collectSiteEngineerName() {
    return document.getElementById("siteEngineerName")?.value.trim() || "";
  }

  function scheduleLiveTaskUpdate(taskId) {
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task || task.status !== "WIP" || isUploadBusy(taskId)) return;
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
    if (isUploadBusy(taskId)) return;
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
    if (isUploadBusy(taskId)) return;
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

  function syncActiveInputsToTask(taskId) {
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return null;
    const siteEngineerName = document.getElementById("siteEngineerName")?.value.trim();
    const measurementText = document.getElementById("measurementText")?.value.trim();
    const documentAnswer = document.getElementById("documentAnswer")?.value;
    if (typeof siteEngineerName === "string") task.siteEngineerName = siteEngineerName;
    if (typeof measurementText === "string") task.measurementText = measurementText;
    if (typeof documentAnswer === "string" && documentAnswer === "No") {
      task.documents = task.documents.filter((item) => item.answer !== "No");
    }
    app.writeState(state);
    return task;
  }

  function replaceTaskCollection(task, collectionName, items, extraUpdater) {
    task[collectionName] = items.slice();
    if (typeof extraUpdater === "function") extraUpdater(task);
  }

  async function persistQueuedFile(taskId, action) {
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return { ok: false, message: "Task not found." };
    const result = await saveState(action, task, {
      statusMessage: "Saving to Google Drive...",
      successMessage: "",
      showStatus: false
    });
    if (result?.error || result?.sessionExpired) return result;
    return { ok: !result?.skipped, skipped: !!result?.skipped };
  }

  async function uploadItemsSequentially(taskId, section, items, applyFile) {
    if (!items.length) return true;
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return false;
    setUploadState(taskId, {
      busy: true,
      section,
      message: "Uploading files...",
      progressText: `Uploading 0 of ${items.length} files`
    });
    for (let index = 0; index < items.length; index += 1) {
      const total = items.length;
      const currentCount = index + 1;
      const originalTask = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
      const originalDocuments = [...(originalTask?.documents || [])];
      const originalPhotos = [...(originalTask?.photos || [])];
      const originalMeasurements = [...(originalTask?.measurementImages || [])];
      const originalMeasurementText = originalTask?.measurementText || "";
      const originalSiteEngineerName = originalTask?.siteEngineerName || "";
      setUploadState(taskId, {
        busy: true,
        section,
        message: "Uploading files...",
        progressText: `Uploading ${currentCount} of ${total} files`
      });
      let uploaded = false;
      let failureMessage = "Upload failed. Please retry.";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        syncActiveInputsToTask(taskId);
        const activeTask = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
        if (!activeTask) break;
        applyFile(activeTask, items[index]);
        app.writeState(state);
        renderSiteList();
        const result = await persistQueuedFile(taskId, section === "document" ? "addDocumentYes" : section === "photo" ? "addPhotos" : "saveMeasurement");
        if (result?.ok) {
          uploaded = true;
          break;
        }
        failureMessage = result?.error?.message || failureMessage;
        replaceTaskCollection(activeTask, "documents", originalDocuments);
        replaceTaskCollection(activeTask, "photos", originalPhotos);
        replaceTaskCollection(activeTask, "measurementImages", originalMeasurements, (taskItem) => {
          taskItem.measurementText = originalMeasurementText;
          taskItem.siteEngineerName = originalSiteEngineerName;
        });
        app.writeState(state);
        renderSiteList();
        if (attempt < 2) {
          setUploadState(taskId, {
            busy: true,
            section,
            message: "Upload failed. Retrying...",
            progressText: `Uploading ${currentCount} of ${total} files`
          });
          await app.delay(2000);
        }
      }
      if (!uploaded) {
        clearUploadState(taskId);
        app.showSyncStatus(failureMessage || "Upload failed. Please retry.", "error");
        return false;
      }
    }
    clearUploadState(taskId);
    app.showSyncStatus("Saved to Google Sheet and Drive successfully.", "success");
    renderSiteList();
    return true;
  }

  async function addDocument(taskId) {
    if (isUploadBusy(taskId)) return;
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
    const rawFiles = Array.from(fileInput.files || []);
    const enrichedFiles = [];
    for (const rawFile of rawFiles) {
      const [enriched] = await app.enrichFilesWithContent(task.siteId, [rawFile], { answer: "Yes", docType: type });
      enriched.storedName = `${type}_${task.siteId}_${enriched.originalName}`;
      enrichedFiles.push(enriched);
    }
    await uploadItemsSequentially(taskId, "document", enrichedFiles, (taskItem, file) => {
      taskItem.documents = taskItem.documents.filter((item) => item.answer !== "No");
      taskItem.documents = taskItem.documents.concat(file);
    });
    fileInput.value = "";
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
    if (isUploadBusy(taskId)) return;
    const files = Array.from(document.getElementById("photoUpload").files || []);
    if (!files.length) {
      window.alert("Please choose photo files.");
      return;
    }
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    const coords = await getCurrentCoords();
    const enrichedFiles = [];
    for (const rawFile of files) {
      const [enriched] = await app.enrichFilesWithContent(task.siteId, [rawFile], coords || {});
      enriched.storedName = coords
        ? `${task.siteId}_${coords.latitude}_${coords.longitude}_${enriched.originalName}`
        : `${task.siteId}_${enriched.originalName}`;
      enrichedFiles.push(enriched);
    }
    await uploadItemsSequentially(taskId, "photo", enrichedFiles, (taskItem, file) => {
      taskItem.photos = taskItem.photos.concat(file);
    });
    document.getElementById("photoUpload").value = "";
  }

  async function saveMeasurement(taskId) {
    if (isUploadBusy(taskId)) return;
    const measurementText = document.getElementById("measurementText").value.trim();
    const measurementFiles = document.getElementById("measurementUpload").files;
    if (!measurementText && !measurementFiles.length) {
      window.alert("Please enter measurement text or choose measurement image.");
      return;
    }
    if (!measurementFiles.length) {
      await updateTask(taskId, (taskItem) => {
        taskItem.measurementText = measurementText;
      }, "saveMeasurement");
      return;
    }
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    const enrichedFiles = [];
    for (const rawFile of Array.from(measurementFiles)) {
      const [enriched] = await app.enrichFilesWithContent(task.siteId, [rawFile], {});
      enrichedFiles.push(enriched);
    }
    const existingText = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer)?.measurementText || "";
    const nextText = measurementText || existingText;
    const uploaded = await uploadItemsSequentially(taskId, "measurement", enrichedFiles, (taskItem, file) => {
      taskItem.measurementText = nextText;
      taskItem.measurementImages = taskItem.measurementImages.concat(file);
    });
    if (uploaded) {
      const currentTask = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
      if (currentTask && currentTask.measurementText !== nextText) {
        await updateTask(taskId, (taskItem) => {
          taskItem.measurementText = nextText;
        }, "saveMeasurement");
      }
    }
    document.getElementById("measurementUpload").value = "";
  }

  function removeFile(taskId, type, fileId) {
    if (isUploadBusy(taskId)) return;
    const task = state.tasks.find((item) => item.id === taskId && item.engineer === currentEngineer);
    if (!task) return;
    app.showSyncStatus("Deleting file from Site ID Drive folder...", "working", true);
    app.deleteDriveFile(state.settings.engineer, engineerSession, { siteId: task.siteId, fileId }).then((result) => {
      if (!result?.ok) {
        app.showSyncStatus(result?.message || "Unable to delete Drive file.", "error");
        return;
      }
      updateTask(taskId, (taskItem) => {
        if (type === "document") taskItem.documents = taskItem.documents.filter((item) => item.id !== fileId);
        if (type === "photo") taskItem.photos = taskItem.photos.filter((item) => item.id !== fileId);
        if (type === "measurement") taskItem.measurementImages = taskItem.measurementImages.filter((item) => item.id !== fileId);
      }, "removeFile");
      app.showSyncStatus("File deleted from Drive and task.", "success");
      renderTaskDetail(taskId);
    });
  }

  function clearGps(taskId) {
    if (isUploadBusy(taskId)) return;
    updateTask(taskId, (task) => {
      task.gps = null;
      task.district = "";
    }, "clearGps");
  }

  function captureGps(taskId) {
    if (isUploadBusy(taskId)) return;
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
    if (isUploadBusy(activeTaskId)) return;
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
      }, "pickGpsOnMap");
      closeMap();
    });
  }

  function showApp() {
    loginScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    document.getElementById("engineer-user-eyebrow").textContent = currentEngineer || "Engineer Workspace";
    engineerGoogleScriptInput.value = state.settings.engineer.googleScriptUrl || "";
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
    stopCrossDeviceSync();
    if (!state.settings.engineer.googleScriptUrl || !engineerSession?.userId || !engineerSession?.sessionToken) return;
    if (state.settings.engineer.autoSyncEnabled === false) return;
    sessionTimer = setInterval(() => {
      validateActiveSession({ silent: true });
    }, 15000);
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
    engineerAutoSyncInput.checked = state.settings.engineer.autoSyncEnabled !== false;
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
  document.getElementById("engineer-login-settings").addEventListener("click", openSettings);
  document.getElementById("engineer-advanced-settings-toggle").addEventListener("click", () => {
    document.getElementById("engineer-advanced-settings").classList.toggle("hidden");
  });
  document.getElementById("engineer-clear-cache").addEventListener("click", clearCacheAndReset);
  document.getElementById("close-engineer-settings-modal").addEventListener("click", closeSettings);
  document.getElementById("engineer-save-google-settings").addEventListener("click", () => {
    state.settings.engineer = app.mergeGoogleSettings(state.settings.engineer, {
      googleScriptUrl: engineerGoogleScriptInput.value,
      autoSyncEnabled: engineerAutoSyncInput.checked
    });
    app.writeState(state);
    stopCrossDeviceSync();
    autofillEngineerSettings().finally(() => {
      refreshState();
      saveState("saveGoogleSetting", { ...state.settings.engineer });
      if (state.settings.engineer.autoSyncEnabled !== false) {
        syncFromGoogleState({ silent: false });
        startCrossDeviceSync();
      }
      closeSettings();
    });
  });

  window.addEventListener("storage", () => {
    refreshState();
    if (currentEngineer) renderSiteList();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !engineerSession) return;
    if (state.settings.engineer.autoSyncEnabled === false) return;
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
