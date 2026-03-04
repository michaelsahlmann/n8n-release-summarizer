const state = {
  versions: [],
  selectedVersions: new Set(),
  provider: "",
  models: [],
  model: "",
  summary: "",
  summaryMeta: null,
  fetchLog: [],
  fetchResult: [],
  loading: {
    releases: false,
    models: false,
    fetch: false,
    generate: false,
  },
  errors: {
    releases: "",
    models: "",
    fetch: "",
    generate: "",
  },
  modal: {
    open: false,
    version: null,
    data: null,
    loading: false,
    error: "",
    explanations: {},
  },
};

const elements = {
  releaseList: document.getElementById("release-list"),
  releaseStatus: document.getElementById("release-status"),
  selectionCount: document.getElementById("selection-count"),
  providerSelect: document.getElementById("provider-select"),
  modelSelect: document.getElementById("model-select"),
  modelStatus: document.getElementById("model-status"),
  generateButton: document.getElementById("generate-btn"),
  generateStatus: document.getElementById("generate-status"),
  fetchCount: document.getElementById("fetch-count"),
  fetchButton: document.getElementById("fetch-btn"),
  fetchStatus: document.getElementById("fetch-status"),
  fetchDetails: document.getElementById("fetch-details"),
  summaryPanel: document.getElementById("summary-panel"),
  summaryMeta: document.getElementById("summary-meta"),
  summaryText: document.getElementById("summary-text"),
  copyButton: document.getElementById("copy-btn"),
  summaryStatus: document.getElementById("summary-status"),
  modal: document.getElementById("release-modal"),
  modalTitle: document.querySelector("#release-modal .modal-title"),
  modalDate: document.querySelector("#release-modal .modal-date"),
  modalGithubLink: document.querySelector("#release-modal .modal-github-link"),
  modalCloseBtn: document.querySelector("#release-modal .modal-close-btn"),
  modalLoading: document.querySelector("#release-modal .modal-loading"),
  modalError: document.querySelector("#release-modal .modal-error"),
  modalSections: document.querySelector("#release-modal .modal-sections"),
};

let copyResetTimer = null;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.hidden = !message;
  if (type) {
    element.dataset.state = type;
  } else {
    delete element.dataset.state;
  }
}

function setButtonLoading(button, isLoading) {
  button.dataset.loading = isLoading ? "true" : "false";
  if (isLoading) {
    button.setAttribute("aria-busy", "true");
  } else {
    button.removeAttribute("aria-busy");
  }
}

function renderSelectionCount() {
  const count = state.selectedVersions.size;
  const noun = count === 1 ? "release" : "releases";
  elements.selectionCount.textContent = `${count} ${noun} selected`;
}

function updateGenerateAvailability() {
  const canGenerate =
    state.selectedVersions.size > 0 &&
    Boolean(state.provider) &&
    Boolean(state.model) &&
    !state.loading.models &&
    !state.loading.generate &&
    !state.loading.releases;

  elements.generateButton.disabled = !canGenerate;
  elements.copyButton.disabled = !state.summary;
}

function getVersionNames() {
  return state.versions.map((release) => release.version);
}

function renderReleases() {
  elements.releaseList.setAttribute("aria-busy", state.loading.releases ? "true" : "false");

  if (state.loading.releases && state.versions.length === 0) {
    elements.releaseList.innerHTML = `
      <div class="release-placeholder">
        <span class="inline-loader" aria-hidden="true"></span>
        <span>Loading local release summaries...</span>
      </div>
    `;
    return;
  }

  if (state.errors.releases) {
    elements.releaseList.innerHTML = `
      <div class="release-placeholder">
        <span>Release summaries could not be loaded.</span>
      </div>
    `;
    return;
  }

  if (state.versions.length === 0) {
    elements.releaseList.innerHTML = `
      <div class="release-placeholder">
        <span>No release summaries found yet. Fetch a batch below to populate this list.</span>
      </div>
    `;
    return;
  }

  const markup = state.versions
    .map((release) => {
      const checked = state.selectedVersions.has(release.version);
      const safeVersion = escapeHtml(release.version);
      const badges = [];
      if (release.isPrerelease) {
        badges.push('<span class="release-badge release-badge-prerelease">Pre-release</span>');
      }
      if (release.isLatest) {
        badges.push('<span class="release-badge release-badge-latest">Latest</span>');
      }
      const badgeMarkup = badges.length
        ? `<div class="release-badges" aria-label="Release status">${badges.join("")}</div>`
        : "";
      return `
        <div class="release-item${checked ? " is-selected" : ""}" data-version="${safeVersion}">
          <input type="checkbox" id="rel-${safeVersion}" value="${safeVersion}" ${checked ? "checked" : ""}>
          <div class="release-label">
            <div class="release-meta">
              <button type="button" class="release-version-btn" data-version="${safeVersion}">${safeVersion}</button>
              ${badgeMarkup}
            </div>
            <span class="release-note">${checked ? "Included in the next summary run" : "Check to include this release"}</span>
          </div>
        </div>
      `;
    })
    .join("");

  elements.releaseList.innerHTML = markup;
}

function renderModels() {
  const select = elements.modelSelect;

  if (!state.provider) {
    select.innerHTML = '<option value="">Select a provider first</option>';
    select.disabled = true;
    return;
  }

  if (state.loading.models) {
    select.innerHTML = '<option value="">Loading models...</option>';
    select.disabled = true;
    return;
  }

  if (state.errors.models) {
    select.innerHTML = '<option value="">Unable to load models</option>';
    select.disabled = true;
    return;
  }

  if (state.models.length === 0) {
    select.innerHTML = '<option value="">No models found</option>';
    select.disabled = true;
    return;
  }

  select.innerHTML = state.models
    .map((modelName) => {
      const selected = modelName === state.model ? "selected" : "";
      return `<option value="${escapeHtml(modelName)}" ${selected}>${escapeHtml(modelName)}</option>`;
    })
    .join("");
  select.disabled = false;
}

function renderSummary() {
  elements.summaryPanel.setAttribute("aria-busy", state.loading.generate ? "true" : "false");

  if (state.summaryMeta) {
    const versionLabel = state.summaryMeta.versions.join(", ");
    elements.summaryMeta.textContent = `Built from ${versionLabel} using ${state.summaryMeta.provider} / ${state.summaryMeta.model}.`;
  } else if (state.loading.generate) {
    elements.summaryMeta.textContent = "Preparing the next summary...";
  } else {
    elements.summaryMeta.textContent = "No summary generated yet.";
  }

  if (state.summary) {
    elements.summaryText.textContent = state.summary;
    elements.summaryText.className = "summary-copy";
    if (state.loading.generate) {
      elements.summaryMeta.textContent = `${elements.summaryMeta.textContent} Refreshing with the latest selection...`;
    }
    return;
  }

  if (state.loading.generate) {
    elements.summaryText.textContent = "Generating a summary from the selected releases. This panel stays visible while the request is running.";
    elements.summaryText.className = "summary-copy summary-loading";
    return;
  }

  if (state.errors.generate) {
    elements.summaryText.textContent = state.errors.generate;
    elements.summaryText.className = "summary-copy summary-error";
    return;
  }

  elements.summaryText.textContent =
    "Select one or more releases, choose a provider and model, then generate a summary. The result will stay visible here while you adjust the next run.";
  elements.summaryText.className = "summary-copy summary-empty";
}

function formatVersionList(versions) {
  return versions.join(", ");
}

function formatFetchStatusMessage(results) {
  const count = results.length;
  if (count === 0) {
    return "No new releases were found. The local library is already up to date.";
  }

  const versions = results.map((item) => item.version);
  if (count === 1) {
    return `Fetched 1 new release: ${versions[0]}. The library has been refreshed.`;
  }

  if (count <= 4) {
    return `Fetched ${count} new releases: ${formatVersionList(versions)}. The library has been refreshed.`;
  }

  const preview = versions.slice(0, 3).join(", ");
  return `Fetched ${count} new releases, including ${preview}, and ${count - 3} more. The library has been refreshed.`;
}

function renderFetchDetails() {
  const container = elements.fetchDetails;

  if (state.loading.fetch) {
    container.innerHTML = `
      <p class="fetch-details-title">Behind the scenes</p>
      <p class="fetch-details-copy">
        The server is requesting release metadata from GitHub, skipping versions already cached in <code>output</code>, processing each newly discovered release, writing JSON snapshots to <code>data</code>, and then refreshing the release list.
      </p>
    `;
    container.dataset.state = "loading";
    container.hidden = false;
    return;
  }

  const results = state.fetchResult;
  const logLines = state.fetchLog;

  if (results.length === 0 && logLines.length === 0) {
    container.hidden = true;
    delete container.dataset.state;
    container.innerHTML = "";
    return;
  }

  const versions = results.map((item) => item.version);
  const summaryMarkup = results.length
    ? `
      <div class="fetch-details-section">
        <p class="fetch-details-title">Processed versions</p>
        <p class="fetch-details-copy">${escapeHtml(formatVersionList(versions))}</p>
      </div>
      <div class="fetch-details-section">
        <p class="fetch-details-title">Release breakdown</p>
        <ul class="fetch-breakdown">
          ${results
            .map((item) => {
              const prLabel = `${item.prCount} PR${item.prCount === 1 ? "" : "s"}`;
              const commitLabel = `${item.commitCount} commit${item.commitCount === 1 ? "" : "s"}`;
              return `<li><strong>${escapeHtml(item.version)}</strong>: ${escapeHtml(prLabel)}, ${escapeHtml(commitLabel)}</li>`;
            })
            .join("")}
        </ul>
      </div>
    `
    : "";

  const logMarkup = logLines.length
    ? `
      <div class="fetch-details-section">
        <p class="fetch-details-title">Behind the scenes</p>
        <pre class="fetch-log">${escapeHtml(logLines.join(""))}</pre>
      </div>
    `
    : `
      <div class="fetch-details-section">
        <p class="fetch-details-title">Behind the scenes</p>
        <p class="fetch-details-copy">No backend progress details were returned for this request.</p>
      </div>
    `;

  container.innerHTML = `${summaryMarkup}${logMarkup}`;
  container.dataset.state = state.errors.fetch ? "error" : "success";
  container.hidden = false;
}

async function loadReleases() {
  state.loading.releases = true;
  state.errors.releases = "";
  renderReleases();
  setStatus(elements.releaseStatus, "Loading release summaries from local output...", "loading");
  updateGenerateAvailability();

  try {
    const response = await fetch("/api/releases");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load releases");
    }

    state.versions = Array.isArray(data.versions)
      ? data.versions
          .filter((release) => release && typeof release.version === "string")
          .map((release) => ({
            version: release.version,
            isPrerelease: release.isPrerelease === true,
            isLatest: release.isLatest === true,
          }))
      : [];
    const availableVersions = new Set(getVersionNames());
    state.selectedVersions = new Set(
      [...state.selectedVersions].filter((version) => availableVersions.has(version)),
    );

    if (state.versions.length === 0) {
      setStatus(elements.releaseStatus, "No summaries found yet. Fetch a batch to get started.", "info");
    } else {
      setStatus(elements.releaseStatus, `${state.versions.length} release summaries are ready to use.`, "success");
    }
  } catch (error) {
    state.errors.releases = error.message || "Unable to load releases";
    setStatus(elements.releaseStatus, state.errors.releases, "error");
  } finally {
    state.loading.releases = false;
    renderSelectionCount();
    renderReleases();
    updateGenerateAvailability();
  }
}

async function loadModels(provider) {
  state.loading.models = true;
  state.errors.models = "";
  state.provider = provider;
  state.models = [];
  state.model = "";
  renderModels();
  setStatus(elements.modelStatus, "Loading available models...", "loading");
  updateGenerateAvailability();

  try {
    const response = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load models");
    }

    state.models = Array.isArray(data.models) ? data.models : [];
    state.model = state.models[0] || "";

    if (state.models.length === 0) {
      setStatus(elements.modelStatus, "No models were returned for this provider.", "info");
    } else {
      setStatus(
        elements.modelStatus,
        `${state.models.length} model${state.models.length === 1 ? "" : "s"} loaded.`,
        "success",
      );
    }
  } catch (error) {
    state.errors.models = error.message || "Unable to load models";
    state.models = [];
    state.model = "";
    setStatus(elements.modelStatus, state.errors.models, "error");
  } finally {
    state.loading.models = false;
    renderModels();
    updateGenerateAvailability();
  }
}

async function handleGenerate() {
  if (state.loading.generate) {
    return;
  }

  const versions = [...state.selectedVersions];
  if (versions.length === 0 || !state.provider || !state.model) {
    return;
  }

  state.loading.generate = true;
  state.errors.generate = "";
  setButtonLoading(elements.generateButton, true);
  setStatus(elements.generateStatus, "Generating a social summary...", "loading");
  setStatus(elements.summaryStatus, "", "");
  renderSummary();
  updateGenerateAvailability();

  try {
    const response = await fetch("/api/social-summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        versions,
        provider: state.provider,
        model: state.model,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to generate summary");
    }

    state.summary = data.summary || "";
    state.summaryMeta = {
      versions,
      provider: state.provider,
      model: state.model,
    };
    setStatus(elements.generateStatus, `Summary ready for ${versions.join(", ")}.`, "success");
  } catch (error) {
    state.errors.generate = error.message || "Unable to generate summary";
    setStatus(elements.generateStatus, state.errors.generate, "error");
  } finally {
    state.loading.generate = false;
    setButtonLoading(elements.generateButton, false);
    renderSummary();
    updateGenerateAvailability();
  }
}

async function handleFetch() {
  if (state.loading.fetch) {
    return;
  }

  const count = Number.parseInt(elements.fetchCount.value, 10);
  if (Number.isNaN(count) || count < 1 || count > 50) {
    setStatus(elements.fetchStatus, "Enter a valid release count between 1 and 50.", "error");
    return;
  }

  state.loading.fetch = true;
  state.errors.fetch = "";
  state.fetchLog = [];
  state.fetchResult = [];
  setButtonLoading(elements.fetchButton, true);
  setStatus(elements.fetchStatus, "Fetching the next unseen releases from GitHub...", "loading");
  renderFetchDetails();

  try {
    const response = await fetch("/api/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ count }),
    });
    const data = await response.json();
    state.fetchLog = Array.isArray(data.log) ? data.log : [];

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Unable to fetch releases");
    }

    state.fetchResult = Array.isArray(data.fetched) ? data.fetched : [];
    setStatus(elements.fetchStatus, formatFetchStatusMessage(state.fetchResult), "success");
    renderFetchDetails();
    await loadReleases();
  } catch (error) {
    state.errors.fetch = error.message || "Unable to fetch releases";
    setStatus(elements.fetchStatus, state.errors.fetch, "error");
    renderFetchDetails();
  } finally {
    state.loading.fetch = false;
    setButtonLoading(elements.fetchButton, false);
    renderFetchDetails();
  }
}

async function handleCopy() {
  if (!state.summary) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.summary);
    const label = elements.copyButton.querySelector(".button-label");
    if (copyResetTimer) {
      window.clearTimeout(copyResetTimer);
    }
    if (label) {
      label.textContent = "Copied";
    }
    setStatus(elements.summaryStatus, "Summary copied to the clipboard.", "success");
    copyResetTimer = window.setTimeout(() => {
      if (label) {
        label.textContent = "Copy to Clipboard";
      }
      copyResetTimer = null;
    }, 1500);
  } catch (error) {
    setStatus(
      elements.summaryStatus,
      `Clipboard copy failed: ${error.message || "copy is not available in this browser."}`,
      "error",
    );
  }
}

elements.releaseList.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return;
  }

  if (target.checked) {
    state.selectedVersions.add(target.value);
  } else {
    state.selectedVersions.delete(target.value);
  }

  const row = target.closest(".release-item");
  const note = row?.querySelector(".release-note");
  if (row) {
    row.classList.toggle("is-selected", target.checked);
  }
  if (note) {
    note.textContent = target.checked ? "Included in the next summary run" : "Check to include this release";
  }

  renderSelectionCount();
  updateGenerateAvailability();
});

elements.providerSelect.addEventListener("change", async (event) => {
  const provider = event.target.value;
  state.provider = provider;
  state.errors.models = "";

  if (!provider) {
    state.models = [];
    state.model = "";
    renderModels();
    setStatus(elements.modelStatus, "", "");
    updateGenerateAvailability();
    return;
  }

  await loadModels(provider);
});

elements.modelSelect.addEventListener("change", (event) => {
  state.model = event.target.value;
  updateGenerateAvailability();
});

elements.generateButton.addEventListener("click", handleGenerate);
elements.fetchButton.addEventListener("click", handleFetch);
elements.copyButton.addEventListener("click", handleCopy);

// --- Modal ---

function renderModalItem(item) {
  const prUrl = item.prNumber ? `https://github.com/n8n-io/n8n/issues/${item.prNumber}` : null;
  const commitUrl = item.commitSha ? `https://github.com/n8n-io/n8n/commit/${item.commitSha}` : null;
  const componentHtml = item.component
    ? `<span class="modal-item-component">${escapeHtml(item.component)}</span>`
    : "";

  return `
    <div class="modal-item" data-pr="${item.prNumber || ""}" data-sha="${item.commitSha || ""}">
      <div class="modal-item-header">
        ${componentHtml}
        <span class="modal-item-description">${escapeHtml(item.description)}</span>
      </div>
      <div class="modal-item-actions">
        ${prUrl ? `<a class="button button-ghost button-small" href="${prUrl}" target="_blank" rel="noopener"><span class="button-label">PR #${item.prNumber}</span></a>` : ""}
        ${commitUrl ? `<a class="button button-ghost button-small" href="${commitUrl}" target="_blank" rel="noopener"><span class="button-label">${escapeHtml(item.commitSha)}</span></a>` : ""}
        <button class="button button-secondary button-small modal-explain-btn" type="button">
          <span class="button-loader" aria-hidden="true"></span>
          <span class="button-label">AI Explain</span>
        </button>
      </div>
      <div class="modal-item-explanation" hidden></div>
    </div>
  `;
}

function renderModalSection(section, index) {
  const sectionId = `modal-section-${index}`;
  const itemCount = section.items.length;
  const itemLabel = `${itemCount} item${itemCount === 1 ? "" : "s"}`;

  return `
    <div class="modal-section">
      <h3 class="modal-section-heading">
        <button
          class="modal-section-toggle"
          type="button"
          aria-expanded="true"
          aria-controls="${sectionId}"
          aria-label="Toggle ${escapeHtml(section.title)} section"
        >
          <span class="modal-section-toggle-icon" aria-hidden="true"></span>
          <span class="modal-section-title">${escapeHtml(section.title)}</span>
          <span class="modal-section-count">${itemLabel}</span>
        </button>
      </h3>
      <div class="modal-items" id="${sectionId}">
        ${section.items.map((item) => renderModalItem(item)).join("")}
      </div>
    </div>
  `;
}

function renderModal() {
  const { data, loading, error, version } = state.modal;

  elements.modalTitle.textContent = version || "";
  elements.modalLoading.hidden = !loading;
  elements.modalError.hidden = !error;
  elements.modalSections.innerHTML = "";

  if (error) {
    elements.modalError.textContent = error;
    elements.modalError.hidden = false;
    return;
  }
  if (loading || !data) return;

  elements.modalDate.textContent = data.publishedAt
    ? `Released ${new Date(data.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
    : "";
  if (data.htmlUrl) {
    elements.modalGithubLink.href = data.htmlUrl;
    elements.modalGithubLink.hidden = false;
  } else {
    elements.modalGithubLink.hidden = true;
  }

  if (data.sections.length === 0) {
    elements.modalSections.innerHTML = `<p class="modal-empty">No structured release items found for this version.</p>`;
    return;
  }

  elements.modalSections.innerHTML = data.sections
    .map((section, index) => renderModalSection(section, index))
    .join("");
}

async function openModal(version) {
  state.modal.open = true;
  state.modal.version = version;
  state.modal.data = null;
  state.modal.loading = true;
  state.modal.error = "";
  state.modal.explanations = {};

  elements.modal.hidden = false;
  document.body.style.overflow = "hidden";
  renderModal();

  try {
    const res = await fetch(`/api/release-data/${encodeURIComponent(version)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load release data");
    state.modal.data = data;
  } catch (err) {
    state.modal.error = err.message;
  } finally {
    state.modal.loading = false;
    renderModal();
  }
}

function closeModal() {
  state.modal.open = false;
  elements.modal.hidden = true;
  document.body.style.overflow = "";
}

async function handleExplainItem(prNumber, commitSha, button, itemEl) {
  const key = `${prNumber}-${commitSha}`;
  const explanationEl = itemEl.querySelector(".modal-item-explanation");

  // Toggle visibility if already explained
  if (state.modal.explanations[key]?.text) {
    explanationEl.hidden = !explanationEl.hidden;
    return;
  }

  // Check that provider/model are selected
  if (!state.provider || !state.model) {
    explanationEl.hidden = false;
    explanationEl.textContent = "Select a provider and model in the Summary Studio panel first.";
    explanationEl.dataset.state = "info";
    return;
  }

  setButtonLoading(button, true);
  explanationEl.hidden = false;
  explanationEl.textContent = "Generating explanation...";
  explanationEl.dataset.state = "loading";

  try {
    const res = await fetch("/api/explain-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: state.modal.version,
        prNumber: prNumber || null,
        commitSha: commitSha || null,
        provider: state.provider,
        model: state.model,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate explanation");

    state.modal.explanations[key] = { text: data.explanation };
    explanationEl.textContent = data.explanation;
    explanationEl.dataset.state = "success";
  } catch (err) {
    explanationEl.textContent = err.message;
    explanationEl.dataset.state = "error";
  } finally {
    setButtonLoading(button, false);
  }
}

// Open the release modal when any non-checkbox part of a row is clicked
elements.releaseList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest('input[type="checkbox"]')) {
    return;
  }

  const item = target.closest(".release-item");
  if (!item) return;
  event.preventDefault();
  openModal(item.dataset.version);
});

// Close modal on overlay click or close button
elements.modal.addEventListener("click", (event) => {
  if (event.target === elements.modal || event.target.closest(".modal-close-btn")) {
    closeModal();
  }
});

// Close modal on Escape key
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modal.open) {
    closeModal();
  }
});

// AI Explain button (delegated from modal sections)
elements.modalSections.addEventListener("click", (event) => {
  const sectionToggle = event.target.closest(".modal-section-toggle");
  if (sectionToggle) {
    const section = sectionToggle.closest(".modal-section");
    const sectionItems = section?.querySelector(".modal-items");
    if (!sectionItems) return;

    const isExpanded = sectionToggle.getAttribute("aria-expanded") === "true";
    sectionToggle.setAttribute("aria-expanded", String(!isExpanded));
    sectionItems.hidden = isExpanded;
    return;
  }

  const btn = event.target.closest(".modal-explain-btn");
  if (!btn) return;
  const item = btn.closest(".modal-item");
  const pr = item.dataset.pr ? parseInt(item.dataset.pr, 10) : null;
  const sha = item.dataset.sha || null;
  handleExplainItem(pr, sha, btn, item);
});

renderSelectionCount();
renderModels();
renderSummary();
renderFetchDetails();
updateGenerateAvailability();
void loadReleases();
