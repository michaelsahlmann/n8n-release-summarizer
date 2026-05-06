const state = {
  versions: [],
  selectedVersions: new Set(),
  provider: "",
  models: [],
  model: "",
  userDirection: "",
  summary: "",
  summaryMeta: null,
  fetchLog: [],
  fetchResult: [],
  modelPicker: {
    open: false,
    search: "",
    expandedProvider: "",
    loadingProvider: "",
    modelsByProvider: {},
    errors: {},
  },
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
    chats: {},
    chat: {
      open: false,
      activeKey: null,
    },
  },
};

const elements = {
  releaseList: document.getElementById("release-list"),
  releaseStatus: document.getElementById("release-status"),
  selectionCount: document.getElementById("selection-count"),
  providerSelect: document.getElementById("provider-select"),
  modelSelect: document.getElementById("model-select"),
  summaryDirection: document.getElementById("summary-direction"),
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
  releaseChatPanel: document.getElementById("release-chat-panel"),
  releaseChatTitle: document.getElementById("release-chat-title"),
  releaseChatItem: document.querySelector("#release-chat-panel .release-chat-item"),
  releaseChatCloseButton: document.querySelector("#release-chat-panel .release-chat-close-btn"),
  chatModelPicker: document.getElementById("chat-model-picker"),
  chatModelPickerButton: document.getElementById("chat-model-picker-btn"),
  chatModelPickerLabel: document.getElementById("chat-model-picker-label"),
  chatModelPickerMenu: document.getElementById("chat-model-picker-menu"),
  chatModelSearch: document.getElementById("chat-model-search"),
  chatModelOptions: document.getElementById("chat-model-options"),
  releaseChatStatus: document.getElementById("release-chat-status"),
  releaseChatMessages: document.getElementById("release-chat-messages"),
  releaseChatForm: document.getElementById("release-chat-form"),
  releaseChatInput: document.getElementById("release-chat-input"),
  releaseChatSend: document.getElementById("release-chat-send"),
};

let copyResetTimer = null;

const AI_PROVIDER_OPTIONS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
];

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

function renderModelSelect(select) {
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

function renderModels() {
  elements.providerSelect.value = state.provider;
  renderModelSelect(elements.modelSelect);
  renderModelPicker();
}

function getProviderLabel(provider) {
  return AI_PROVIDER_OPTIONS.find((option) => option.id === provider)?.label || provider;
}

function getActiveModelLabel() {
  if (!state.provider || !state.model) {
    return "Select model";
  }

  return state.model;
}

function getPickerModels(provider) {
  if (provider === state.provider && state.models.length > 0) {
    state.modelPicker.modelsByProvider[provider] = state.models;
  }

  return state.modelPicker.modelsByProvider[provider] || [];
}

function renderModelPicker() {
  if (!elements.chatModelPickerButton) {
    return;
  }

  const needsModel = state.modal.chat.open && !state.modelPicker.open && (!state.provider || !state.model);
  elements.chatModelPickerLabel.textContent = getActiveModelLabel();
  elements.chatModelPickerButton.setAttribute("aria-expanded", String(state.modelPicker.open));
  elements.chatModelPickerButton.classList.toggle("has-selection", Boolean(state.provider && state.model));
  elements.chatModelPickerButton.classList.toggle("needs-selection", needsModel);
  elements.chatModelPickerMenu.hidden = !state.modelPicker.open;

  if (document.activeElement !== elements.chatModelSearch) {
    elements.chatModelSearch.value = state.modelPicker.search;
  }

  renderModelPickerOptions();
}

function renderModelPickerOptions() {
  const search = state.modelPicker.search.trim().toLowerCase();
  const groups = AI_PROVIDER_OPTIONS.map((provider) => {
    const isExpanded = state.modelPicker.expandedProvider === provider.id || Boolean(search);
    const isLoading = state.modelPicker.loadingProvider === provider.id;
    const error = state.modelPicker.errors[provider.id] || "";
    const models = getPickerModels(provider.id);
    const matchingModels = search
      ? models.filter((modelName) => modelName.toLowerCase().includes(search))
      : models;

    let body = "";
    if (isExpanded) {
      if (isLoading) {
        body = `<div class="chat-model-row chat-model-row-muted"><span class="inline-loader" aria-hidden="true"></span><span>Loading models...</span></div>`;
      } else if (error) {
        body = `<div class="chat-model-row chat-model-row-error">${escapeHtml(error)}</div>`;
      } else if (models.length === 0) {
        body = `<div class="chat-model-row chat-model-row-muted">No models loaded yet.</div>`;
      } else if (matchingModels.length === 0) {
        body = `<div class="chat-model-row chat-model-row-muted">No matching models.</div>`;
      } else {
        body = matchingModels
          .map((modelName) => {
            const isSelected = provider.id === state.provider && modelName === state.model;
            return `
              <button
                class="chat-model-option${isSelected ? " is-selected" : ""}"
                type="button"
                role="menuitemradio"
                aria-checked="${isSelected}"
                data-provider="${provider.id}"
                data-model="${escapeHtml(modelName)}"
              >
                <span class="chat-model-check" aria-hidden="true">${isSelected ? "&#10003;" : ""}</span>
                <span class="chat-model-name">${escapeHtml(modelName)}</span>
              </button>
            `;
          })
          .join("");
      }
    }

    return `
      <div class="chat-model-provider">
        <button
          class="chat-model-provider-btn${isExpanded ? " is-expanded" : ""}"
          type="button"
          data-provider-toggle="${provider.id}"
          aria-expanded="${isExpanded}"
        >
          <span class="chat-model-provider-chevron" aria-hidden="true"></span>
          <span>${provider.label}</span>
          ${isLoading ? '<span class="chat-model-provider-state">Loading</span>' : ""}
        </button>
        ${body ? `<div class="chat-model-provider-body">${body}</div>` : ""}
      </div>
    `;
  }).join("");

  elements.chatModelOptions.innerHTML = groups;
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
    state.modelPicker.modelsByProvider[provider] = state.models;
    state.modelPicker.errors[provider] = "";

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
    state.modelPicker.errors[provider] = state.errors.models;
    setStatus(elements.modelStatus, state.errors.models, "error");
  } finally {
    state.loading.models = false;
    renderModels();
    updateGenerateAvailability();
    renderChat();
    maybeStartPendingChatExplanation();
  }
}

async function loadPickerProviderModels(provider) {
  if (!provider || state.modelPicker.loadingProvider === provider) {
    return;
  }

  if (getPickerModels(provider).length > 0) {
    renderModelPicker();
    return;
  }

  state.modelPicker.loadingProvider = provider;
  state.modelPicker.errors[provider] = "";
  renderModelPicker();

  try {
    const response = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load models");
    }

    state.modelPicker.modelsByProvider[provider] = Array.isArray(data.models) ? data.models : [];
  } catch (error) {
    state.modelPicker.errors[provider] = error.message || "Unable to load models";
  } finally {
    state.modelPicker.loadingProvider = "";
    renderModelPicker();
  }
}

async function selectProvider(provider) {
  state.provider = provider;
  state.errors.models = "";

  if (!provider) {
    state.models = [];
    state.model = "";
    renderModels();
    renderChat();
    setStatus(elements.modelStatus, "", "");
    updateGenerateAvailability();
    return;
  }

  await loadModels(provider);
}

function selectModel(model) {
  state.model = model;
  if (state.provider && state.models.length > 0) {
    state.modelPicker.modelsByProvider[state.provider] = state.models;
  }
  renderModels();
  renderChat();
  updateGenerateAvailability();
  maybeStartPendingChatExplanation();
}

function openModelPicker() {
  state.modelPicker.open = true;
  if (!state.modelPicker.expandedProvider) {
    state.modelPicker.expandedProvider = state.provider || "gemini";
  }
  renderModelPicker();
  window.setTimeout(() => elements.chatModelSearch.focus(), 0);
  void loadPickerProviderModels(state.modelPicker.expandedProvider);
}

function closeModelPicker() {
  state.modelPicker.open = false;
  renderModelPicker();
}

function toggleModelPicker() {
  if (state.modelPicker.open) {
    closeModelPicker();
  } else {
    openModelPicker();
  }
}

function togglePickerProvider(provider) {
  if (state.modelPicker.expandedProvider === provider) {
    state.modelPicker.expandedProvider = "";
    renderModelPicker();
    return;
  }

  state.modelPicker.expandedProvider = provider;
  renderModelPicker();
  void loadPickerProviderModels(provider);
}

function selectChatModel(provider, model) {
  const models = getPickerModels(provider);
  state.provider = provider;
  state.models = models.length > 0 ? models : [model];
  state.model = model;
  state.errors.models = "";
  setStatus(
    elements.modelStatus,
    `${getProviderLabel(provider)} model selected from the chat picker.`,
    "success",
  );
  closeModelPicker();
  renderModels();
  renderChat();
  updateGenerateAvailability();
  maybeStartPendingChatExplanation();
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
    const userDirection = state.userDirection.trim();
    const response = await fetch("/api/social-summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        versions,
        provider: state.provider,
        model: state.model,
        userDirection,
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
  await selectProvider(event.target.value);
});

elements.modelSelect.addEventListener("change", (event) => {
  selectModel(event.target.value);
});

elements.summaryDirection.addEventListener("input", (event) => {
  state.userDirection = event.target.value;
});

elements.generateButton.addEventListener("click", handleGenerate);
elements.fetchButton.addEventListener("click", handleFetch);
elements.copyButton.addEventListener("click", handleCopy);
elements.releaseChatCloseButton.addEventListener("click", closeReleaseChat);
elements.chatModelPickerButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleModelPicker();
});
elements.chatModelPickerMenu.addEventListener("click", (event) => {
  event.stopPropagation();
});
elements.chatModelSearch.addEventListener("input", (event) => {
  state.modelPicker.search = event.target.value;
  renderModelPickerOptions();
});
elements.chatModelOptions.addEventListener("click", (event) => {
  event.stopPropagation();
  const target = event.target;
  if (!(target instanceof Element)) return;

  const providerToggle = target.closest("[data-provider-toggle]");
  if (providerToggle) {
    togglePickerProvider(providerToggle.dataset.providerToggle);
    return;
  }

  const option = target.closest("[data-provider][data-model]");
  if (option) {
    selectChatModel(option.dataset.provider, option.dataset.model);
  }
});
elements.releaseChatForm.addEventListener("submit", handleChatSubmit);
elements.releaseChatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.releaseChatForm.requestSubmit();
  }
});
document.addEventListener("click", (event) => {
  if (!state.modelPicker.open) return;
  const target = event.target;
  if (target instanceof Element && elements.chatModelPicker.contains(target)) {
    return;
  }

  closeModelPicker();
});

// --- Modal ---

function getChatKey(prNumber, commitSha) {
  return `${prNumber || "no-pr"}-${commitSha || "no-sha"}`;
}

function getActiveChat() {
  const key = state.modal.chat.activeKey;
  return key ? state.modal.chats[key] : null;
}

function findModalItemForChat(record) {
  if (!record) return null;
  return [...elements.modalSections.querySelectorAll(".modal-item")].find((item) => {
    const pr = item.dataset.pr ? Number.parseInt(item.dataset.pr, 10) : null;
    const sha = item.dataset.sha || null;
    return pr === record.prNumber && sha === record.commitSha;
  });
}

function setChatPanelOpen(isOpen) {
  state.modal.chat.open = isOpen;
  elements.releaseChatPanel.hidden = !isOpen;
  elements.modal.dataset.chatOpen = isOpen ? "true" : "false";
}

function updateActiveChatItemHighlight() {
  const activeKey = state.modal.chat.open ? state.modal.chat.activeKey : null;
  elements.modalSections.querySelectorAll(".modal-item").forEach((item) => {
    const pr = item.dataset.pr ? Number.parseInt(item.dataset.pr, 10) : null;
    const sha = item.dataset.sha || null;
    item.classList.toggle("is-chat-active", activeKey === getChatKey(pr, sha));
  });
}

function renderChatMessage(message) {
  const isAssistant = message.role === "assistant";
  return `
    <div class="release-chat-message release-chat-message-${isAssistant ? "assistant" : "user"}">
      <div class="release-chat-message-label">${isAssistant ? "AI" : "You"}</div>
      <div class="release-chat-message-body">${escapeHtml(message.content)}</div>
    </div>
  `;
}

function renderChatMessages(record) {
  if (!record) {
    elements.releaseChatMessages.innerHTML = "";
    return;
  }

  const messages = record.messages.map((message) => renderChatMessage(message));

  if (record.loading) {
    messages.push(`
      <div class="release-chat-message release-chat-message-assistant">
        <div class="release-chat-message-label">AI</div>
        <div class="release-chat-message-body release-chat-loading">
          <span class="inline-loader" aria-hidden="true"></span>
          <span>Thinking...</span>
        </div>
      </div>
    `);
  }

  if (messages.length === 0) {
    const emptyText = record.error
      ? "The first explanation could not be generated."
      : state.provider && state.model
      ? "Preparing the first explanation..."
      : "Choose a provider and model to start.";
    elements.releaseChatMessages.innerHTML = `<div class="release-chat-empty">${emptyText}</div>`;
    return;
  }

  elements.releaseChatMessages.innerHTML = messages.join("");
}

function scrollChatToBottom() {
  elements.releaseChatMessages.scrollTop = elements.releaseChatMessages.scrollHeight;
}

function renderChat() {
  renderModels();

  if (!state.modal.chat.open) {
    elements.releaseChatPanel.hidden = true;
    elements.modal.dataset.chatOpen = "false";
    updateActiveChatItemHighlight();
    return;
  }

  elements.releaseChatPanel.hidden = false;
  elements.modal.dataset.chatOpen = "true";

  const record = getActiveChat();
  if (!record) {
    elements.releaseChatTitle.textContent = "Ask about this change";
    elements.releaseChatItem.textContent = "";
    renderChatMessages(null);
    setStatus(elements.releaseChatStatus, "", "");
    elements.releaseChatInput.disabled = true;
    elements.releaseChatSend.disabled = true;
    return;
  }

  elements.releaseChatTitle.textContent = "Ask about this change";
  elements.releaseChatItem.textContent = [
    record.component,
    record.prNumber ? `PR #${record.prNumber}` : "",
    record.commitSha || "",
  ].filter(Boolean).join(" · ") || record.description;

  renderChatMessages(record);

  if (state.loading.models) {
    setStatus(elements.releaseChatStatus, "Loading models...", "loading");
  } else if (state.errors.models) {
    setStatus(elements.releaseChatStatus, state.errors.models, "error");
  } else if (!state.provider || !state.model) {
    setStatus(elements.releaseChatStatus, "", "");
  } else if (record.error) {
    setStatus(elements.releaseChatStatus, record.error, "error");
  } else {
    setStatus(elements.releaseChatStatus, "", "");
  }

  const inputDisabled = record.loading || !state.provider || !state.model;
  elements.releaseChatInput.disabled = inputDisabled;
  elements.releaseChatSend.disabled = inputDisabled;
  elements.releaseChatForm.setAttribute("aria-busy", record.loading ? "true" : "false");
  setButtonLoading(elements.releaseChatSend, record.loading);
  updateActiveChatItemHighlight();
}

async function startInitialExplanation(record) {
  if (!record || record.loading || !record.pendingInitial || !state.provider || !state.model) {
    return;
  }

  record.pendingInitial = false;
  record.loading = true;
  record.error = "";

  const button = findModalItemForChat(record)?.querySelector(".modal-explain-btn");
  if (button) setButtonLoading(button, true);
  renderChat();

  try {
    const res = await fetch("/api/explain-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: state.modal.version,
        prNumber: record.prNumber || null,
        commitSha: record.commitSha || null,
        provider: state.provider,
        model: state.model,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate explanation");

    record.messages = [{ role: "assistant", content: data.explanation || "" }];
  } catch (err) {
    record.error = err.message || "Failed to generate explanation";
    record.pendingInitial = true;
  } finally {
    record.loading = false;
    if (button) setButtonLoading(button, false);
    renderChat();
    scrollChatToBottom();
  }
}

function maybeStartPendingChatExplanation() {
  const record = getActiveChat();
  if (record?.pendingInitial) {
    void startInitialExplanation(record);
  }
}

function openReleaseChatForItem(prNumber, commitSha, itemEl) {
  const key = getChatKey(prNumber, commitSha);
  if (!state.modal.chats[key]) {
    state.modal.chats[key] = {
      prNumber,
      commitSha,
      component: itemEl.dataset.component || "",
      description: itemEl.dataset.description || "Selected change",
      messages: [],
      pendingInitial: true,
      loading: false,
      error: "",
    };
  }

  state.modal.chat.activeKey = key;
  setChatPanelOpen(true);
  renderChat();
  maybeStartPendingChatExplanation();
}

function closeReleaseChat() {
  setChatPanelOpen(false);
  state.modal.chat.activeKey = null;
  state.modelPicker.open = false;
  renderChat();
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const record = getActiveChat();
  if (!record || record.loading) return;

  if (!state.provider || !state.model) {
    setStatus(elements.releaseChatStatus, "Choose a provider and model first.", "info");
    return;
  }

  const question = elements.releaseChatInput.value.trim();
  if (!question) return;

  record.messages.push({ role: "user", content: question });
  record.error = "";
  record.loading = true;
  elements.releaseChatInput.value = "";
  renderChat();
  scrollChatToBottom();

  try {
    const res = await fetch("/api/release-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: state.modal.version,
        prNumber: record.prNumber || null,
        commitSha: record.commitSha || null,
        provider: state.provider,
        model: state.model,
        messages: record.messages.slice(-20),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to answer question");

    record.messages.push({ role: "assistant", content: data.answer || "" });
  } catch (err) {
    record.error = err.message || "Failed to answer question";
  } finally {
    record.loading = false;
    renderChat();
    scrollChatToBottom();
  }
}

function renderModalItem(item) {
  const prUrl = item.prNumber ? `https://github.com/n8n-io/n8n/issues/${item.prNumber}` : null;
  const commitUrl = item.commitSha ? `https://github.com/n8n-io/n8n/commit/${item.commitSha}` : null;
  const componentHtml = item.component
    ? `<span class="modal-item-component">${escapeHtml(item.component)}</span>`
    : "";

  return `
    <div
      class="modal-item"
      data-pr="${item.prNumber || ""}"
      data-sha="${item.commitSha || ""}"
      data-component="${escapeHtml(item.component || "")}"
      data-description="${escapeHtml(item.description)}"
    >
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
  state.modal.chats = {};
  state.modal.chat = {
    open: false,
    activeKey: null,
  };
  state.modelPicker.open = false;
  state.modelPicker.search = "";

  elements.modal.hidden = false;
  document.body.style.overflow = "hidden";
  renderChat();
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
  state.modal.chats = {};
  state.modal.chat = {
    open: false,
    activeKey: null,
  };
  state.modelPicker.open = false;
  state.modelPicker.search = "";
  elements.modal.hidden = true;
  document.body.style.overflow = "";
  renderChat();
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
  if (event.key === "Escape" && state.modelPicker.open) {
    closeModelPicker();
    return;
  }

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
  openReleaseChatForItem(pr, sha, item);
});

renderSelectionCount();
renderModels();
renderSummary();
renderFetchDetails();
updateGenerateAvailability();
void loadReleases();
