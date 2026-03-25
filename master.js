(function () {
  const app = window.BlissTaskPro;
  const state = app.readState();

  const navButtons = document.querySelectorAll("[data-page-target]");
  const sections = document.querySelectorAll(".page-section");
  const searchInput = document.getElementById("task-search");
  const masterForm = document.getElementById("master-filter-form");
  const assignmentForm = document.getElementById("task-assignment-form");

  const clientSelects = [document.getElementById("clientMaster"), document.getElementById("assignClient")];
  const engineerSelects = [document.getElementById("engineerMaster"), document.getElementById("assignEngineer")];
  const categorySelects = [document.getElementById("categoryMaster"), document.getElementById("assignCategory")];
  const activitySelects = [document.getElementById("activityMaster"), document.getElementById("assignActivity")];
  const districtSelect = document.getElementById("assignDistrict");
  const assignSiteIdInput = document.getElementById("assignSiteId");

  function syncSelectOptions() {
    clientSelects.forEach((select) => app.setOptions(select, state.options.clients, "Select Client"));
    engineerSelects.forEach((select) => app.setOptions(select, state.options.engineers, "Select Engineer"));
    categorySelects.forEach((select) => app.setOptions(select, state.options.categories, "Select Category"));
    activitySelects.forEach((select) => app.setOptions(select, state.options.activities, "Select Activity"));
    app.setOptions(districtSelect, state.options.districts, "Select District");
  }

  function saveState() {
    app.writeState(state);
  }

  function renderStats() {
    document.getElementById("master-total-tasks").textContent = state.tasks.length;
    document.getElementById("master-wip-tasks").textContent = app.countByStatus(state.tasks, "WIP");
    document.getElementById("master-completed-tasks").textContent = app.countByStatus(state.tasks, "Completed");
  }

  function renderDrafts() {
    const host = document.getElementById("draft-list");
    if (!state.drafts.length) {
      host.innerHTML = app.emptyMarkup("No Site ID drafts yet. Create one from the Master page.");
      return;
    }

    host.innerHTML = state.drafts.slice().reverse().map((draft) => `
      <article class="stack-card">
        <div class="stack-card-header">
          <div>
            <h5>${draft.siteId}</h5>
            <p class="meta-line">${draft.client} | ${draft.engineer} | ${draft.category} | ${draft.activity}</p>
          </div>
          <span class="badge badge-outline">Draft</span>
        </div>
        <p class="meta-line">Site: ${draft.siteName}</p>
        <p class="meta-line">${draft.summary || "No summary added."}</p>
      </article>
    `).join("");
  }

  function renderQueue() {
    const host = document.getElementById("queue-list");
    if (!state.tasks.length) {
      host.innerHTML = app.emptyMarkup("No assigned tasks yet. Use the Task page to assign work.");
      return;
    }

    host.innerHTML = state.tasks.slice().reverse().map((task) => `
      <article class="stack-card">
        <div class="stack-card-header">
          <div>
            <h5>${task.siteId}</h5>
            <p class="meta-line">${task.client} | ${task.engineer}</p>
          </div>
          <span class="status-pill ${app.statusClass(task.status)}">${task.status}</span>
        </div>
        <p class="meta-line">${task.category} | ${task.activity}</p>
        <p class="meta-line">${app.formatDate(task.date)} | ${task.location}, ${task.district}</p>
      </article>
    `).join("");
  }

  function renderTaskTable() {
    const host = document.getElementById("master-task-table");
    const query = (searchInput.value || "").trim().toLowerCase();
    const rows = state.tasks.filter((task) => {
      if (!query) return true;
      return [task.siteId, task.engineer, task.client, task.category, task.activity, task.district]
        .some((value) => value.toLowerCase().includes(query));
    });

    if (!rows.length) {
      host.innerHTML = `<tr><td colspan="10"><div class="empty-state">No matching task details found.</div></td></tr>`;
      return;
    }

    host.innerHTML = rows.slice().reverse().map((task) => `
      <tr>
        <td><span class="status-pill ${app.statusClass(task.status)}">${task.status}</span></td>
        <td><strong>${task.siteId}</strong><div class="fine-print">${app.formatDate(task.date)}</div></td>
        <td>${task.engineer}</td>
        <td>${task.client}</td>
        <td>${task.category}</td>
        <td>${task.activity}</td>
        <td>${task.documents.length ? task.documents.map((doc) => doc.storedName).join("<br>") : "Awaiting upload"}</td>
        <td>${task.photos.length ? task.photos.map((photo) => photo.storedName).join("<br>") : "Awaiting upload"}</td>
        <td>${task.measurement || "Pending"}</td>
        <td>${task.gps ? `${task.gps.latitude.toFixed(5)}, ${task.gps.longitude.toFixed(5)}` : "Not captured"}</td>
      </tr>
    `).join("");
  }

  function rerender() {
    saveState();
    renderStats();
    renderDrafts();
    renderQueue();
    renderTaskTable();
  }

  function prefillAssignmentFromDraft(siteId) {
    const draft = state.drafts.find((item) => item.siteId === siteId);
    if (!draft) return;
    document.getElementById("assignClient").value = draft.client;
    document.getElementById("assignEngineer").value = draft.engineer;
    document.getElementById("assignCategory").value = draft.category;
    document.getElementById("assignActivity").value = draft.activity;
  }

  masterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(masterForm);
    const siteId = String(data.get("siteId")).trim();
    const duplicate = state.drafts.some((draft) => draft.siteId === siteId) || state.tasks.some((task) => task.siteId === siteId);
    if (duplicate) {
      window.alert("This Site ID already exists. Please enter a unique Site ID.");
      return;
    }

    state.drafts.push({
      id: app.uid("draft"),
      client: String(data.get("client")),
      engineer: String(data.get("engineer")),
      category: String(data.get("category")),
      activity: String(data.get("activity")),
      siteId,
      siteName: String(data.get("siteName")).trim(),
      summary: String(data.get("summary")).trim(),
      createdAt: new Date().toISOString()
    });

    masterForm.reset();
    syncSelectOptions();
    rerender();
    document.querySelector('[data-page-target="task-page"]').click();
    assignSiteIdInput.value = siteId;
    prefillAssignmentFromDraft(siteId);
  });

  assignmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(assignmentForm);
    const siteId = String(data.get("siteId")).trim();
    const existingTask = state.tasks.find((task) => task.siteId === siteId);
    const matchingDraftIndex = state.drafts.findIndex((draft) => draft.siteId === siteId);

    if (existingTask) {
      window.alert("A task with this Site ID is already assigned.");
      return;
    }

    state.tasks.push({
      id: app.uid("task"),
      client: String(data.get("client")),
      engineer: String(data.get("engineer")),
      category: String(data.get("category")),
      activity: String(data.get("activity")),
      date: String(data.get("date")),
      siteId,
      location: String(data.get("location")).trim(),
      district: String(data.get("district")),
      instructions: String(data.get("instructions")).trim(),
      status: "Pending",
      measurement: "",
      documents: [],
      photos: [],
      gps: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (matchingDraftIndex >= 0) state.drafts.splice(matchingDraftIndex, 1);

    assignmentForm.reset();
    syncSelectOptions();
    document.getElementById("assignDate").value = new Date().toISOString().split("T")[0];
    rerender();
    document.querySelector('[data-page-target="details-page"]').click();
  });

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      navButtons.forEach((item) => item.classList.remove("active"));
      sections.forEach((section) => section.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.pageTarget).classList.add("active");
    });
  });

  searchInput.addEventListener("input", renderTaskTable);
  assignSiteIdInput.addEventListener("change", (event) => {
    prefillAssignmentFromDraft(event.target.value.trim());
  });

  window.addEventListener("storage", () => {
    const nextState = app.readState();
    state.drafts.splice(0, state.drafts.length, ...nextState.drafts);
    state.tasks.splice(0, state.tasks.length, ...nextState.tasks);
    state.options = nextState.options;
    syncSelectOptions();
    renderStats();
    renderDrafts();
    renderQueue();
    renderTaskTable();
  });

  syncSelectOptions();
  document.getElementById("assignDate").value = new Date().toISOString().split("T")[0];
  rerender();
})();
