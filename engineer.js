(function () {
  const app = window.BlissTaskPro;
  const engineerSelect = document.getElementById("engineer-view-select");
  let state = app.readState();

  function saveState() {
    app.writeState(state);
  }

  function refreshState() {
    state = app.readState();
  }

  function renderStats(tasks) {
    document.getElementById("engineer-total-tasks").textContent = tasks.length;
    document.getElementById("engineer-wip-tasks").textContent = app.countByStatus(tasks, "WIP");
    document.getElementById("engineer-completed-tasks").textContent = app.countByStatus(tasks, "Completed");
  }

  function renderEngineerSelect() {
    const current = engineerSelect.value;
    app.setOptions(engineerSelect, state.options.engineers, "Select Engineer");
    if (current && state.options.engineers.includes(current)) {
      engineerSelect.value = current;
    } else {
      engineerSelect.value = state.options.engineers[0] || "";
    }
  }

  function updateTask(taskId, patch) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    saveState();
    renderTaskCards();
  }

  function captureGps(taskId, button) {
    if (!navigator.geolocation) {
      window.alert("Geolocation is not supported on this device/browser.");
      return;
    }

    button.disabled = true;
    button.textContent = "Capturing GPS...";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateTask(taskId, {
          gps: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date().toISOString()
          }
        });
      },
      () => {
        window.alert("Unable to capture GPS. Please allow location permission and try again.");
        renderTaskCards();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function createUploadItemsMarkup(items, emptyText) {
    if (!items.length) return `<p class="fine-print">${emptyText}</p>`;
    return `<ul class="upload-list">${items.map((item) => `<li>${item.storedName}</li>`).join("")}</ul>`;
  }

  function renderTaskCards() {
    refreshState();
    renderEngineerSelect();

    const selectedEngineer = engineerSelect.value;
    const tasks = state.tasks.filter((task) => task.engineer === selectedEngineer);
    renderStats(tasks);

    const host = document.getElementById("engineer-task-list");
    if (!selectedEngineer) {
      host.innerHTML = app.emptyMarkup("Select an engineer to view assigned tasks.");
      return;
    }

    if (!tasks.length) {
      host.innerHTML = app.emptyMarkup("No tasks assigned to this engineer yet.");
      return;
    }

    host.innerHTML = tasks.slice().reverse().map((task) => `
      <article class="task-card" data-task-id="${task.id}">
        <div class="task-card-header">
          <div>
            <h4>${task.siteId}</h4>
            <p class="fine-print">${task.client} | ${task.category} | ${task.activity}</p>
          </div>
          <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
        </div>
        <div class="task-card-body">
          <section>
            <div class="task-meta">
              <p><strong>Date:</strong> ${app.formatDate(task.date)}</p>
              <p><strong>District:</strong> ${task.district}</p>
            </div>
            <p class="meta-line"><strong>Location:</strong> ${task.location}</p>
            <p class="meta-line"><strong>Instructions:</strong> ${task.instructions || "No instructions added."}</p>
          </section>
          <section>
            <h5>Work Progress</h5>
            <div class="action-row">
              <button class="secondary-button" data-action="mark-wip">Mark WIP</button>
              <button class="primary-button" data-action="mark-complete">Mark Completed</button>
            </div>
            <p class="fine-print">Completed status should be used after uploads, measurement entry, and GPS capture.</p>
          </section>
          <section>
            <h5>Documents</h5>
            <label><span>Upload Document Files</span><input type="file" data-action="document-upload" multiple></label>
            ${createUploadItemsMarkup(task.documents, "No documents uploaded yet.")}
          </section>
          <section>
            <h5>Photos</h5>
            <label><span>Upload Site Photos</span><input type="file" accept="image/*" data-action="photo-upload" multiple></label>
            ${createUploadItemsMarkup(task.photos, "No photos uploaded yet.")}
          </section>
          <section>
            <h5>Measurement</h5>
            <label><span>Measurement / Text Field 50</span><textarea data-action="measurement-input" placeholder="Enter measurement values or remarks">${task.measurement || ""}</textarea></label>
            <div class="form-actions"><button class="secondary-button" data-action="save-measurement">Save Measurement</button></div>
          </section>
          <section>
            <h5>Completion GPS</h5>
            <div class="chip-row">
              <button class="secondary-button" data-action="capture-gps">Capture GPS Location</button>
              <span class="badge badge-outline">${task.gps ? `${task.gps.latitude.toFixed(5)}, ${task.gps.longitude.toFixed(5)}` : "GPS not captured"}</span>
            </div>
          </section>
        </div>
      </article>
    `).join("");

    host.querySelectorAll(".task-card").forEach((card) => {
      const taskId = card.dataset.taskId;

      card.querySelector('[data-action="mark-wip"]').addEventListener("click", () => {
        updateTask(taskId, { status: "WIP" });
      });

      card.querySelector('[data-action="mark-complete"]').addEventListener("click", () => {
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task.measurement || !task.gps || !task.documents.length || !task.photos.length) {
          window.alert("Please upload documents and photos, save measurement, and capture GPS before marking this task completed.");
          return;
        }
        updateTask(taskId, { status: "Completed" });
      });

      card.querySelector('[data-action="document-upload"]').addEventListener("change", (event) => {
        const task = state.tasks.find((item) => item.id === taskId);
        const files = app.ensurePrefixedFiles(task.siteId, event.target.files);
        updateTask(taskId, { documents: task.documents.concat(files) });
      });

      card.querySelector('[data-action="photo-upload"]').addEventListener("change", (event) => {
        const task = state.tasks.find((item) => item.id === taskId);
        const files = app.ensurePrefixedFiles(task.siteId, event.target.files);
        updateTask(taskId, { photos: task.photos.concat(files) });
      });

      card.querySelector('[data-action="save-measurement"]').addEventListener("click", () => {
        const textarea = card.querySelector('[data-action="measurement-input"]');
        updateTask(taskId, { measurement: textarea.value.trim() });
      });

      card.querySelector('[data-action="capture-gps"]').addEventListener("click", (event) => {
        captureGps(taskId, event.currentTarget);
      });
    });
  }

  engineerSelect.addEventListener("change", renderTaskCards);
  window.addEventListener("storage", renderTaskCards);

  renderEngineerSelect();
  renderTaskCards();
})();
