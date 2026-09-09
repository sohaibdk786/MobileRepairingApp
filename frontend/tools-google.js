// Tools > Google Connection (spec section 10). Upload/replace/remove the
// service-account key, set the Sheet/Drive IDs, and see the sync queue.

(function () {
  const statusLine = document.getElementById("key-status-line");
  if (!statusLine) return; // not on this page

  const statusDetail = document.getElementById("key-status-detail");
  const guidance = document.getElementById("key-guidance");
  const fileInput = document.getElementById("key-file-input");
  const uploadBtn = document.getElementById("key-upload-btn");
  const deleteBtn = document.getElementById("key-delete-btn");
  const keyConfirmationEl = document.getElementById("key-confirmation");
  const keyErrorEl = document.getElementById("key-error");

  const settingsForm = document.getElementById("cloud-settings-form");
  const settingsConfirmationEl = document.getElementById("cloud-settings-confirmation");
  const settingsErrorEl = document.getElementById("cloud-settings-error");

  const queueCountEl = document.getElementById("queue-pending-count");

  function renderKeyStatus(key) {
    if (key.valid) {
      statusLine.textContent = `Connected as ${key.client_email}`;
      statusDetail.classList.add("hidden");
      guidance.classList.add("hidden");
    } else if (key.present) {
      statusLine.textContent = "Key file found, but not working";
      statusDetail.textContent = key.error || "";
      statusDetail.classList.remove("hidden");
      guidance.classList.remove("hidden");
    } else {
      statusLine.textContent = "Google connection key not found";
      statusDetail.classList.add("hidden");
      guidance.classList.remove("hidden");
    }
  }

  async function loadStatus() {
    const status = await api.get("/api/cloud/status");
    renderKeyStatus(status.key);
    queueCountEl.textContent = status.sync_queue_pending;

    const form = settingsForm;
    form.elements.namedItem("repairs_sheet_id").value = status.repairs_sheet_id;
    form.elements.namedItem("sales_sheet_id").value = status.sales_sheet_id;
    form.elements.namedItem("drive_folder_id").value = status.drive_folder_id;
  }

  uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) {
      keyErrorEl.textContent = "Choose a .json key file first";
      keyErrorEl.classList.remove("hidden");
      return;
    }
    uploadBtn.disabled = true;
    keyErrorEl.classList.add("hidden");
    keyConfirmationEl.classList.add("hidden");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cloud/key", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      renderKeyStatus(data);
      keyConfirmationEl.textContent = "Key uploaded.";
      keyConfirmationEl.classList.remove("hidden");
      fileInput.value = "";
    } catch (err) {
      keyErrorEl.textContent = err.message;
      keyErrorEl.classList.remove("hidden");
    } finally {
      uploadBtn.disabled = false;
    }
  });

  deleteBtn.addEventListener("click", () => {
    showModal({
      title: "Remove the Google key?",
      message: "Sync and backup will stop working until a new key is uploaded.",
      buttons: [
        {
          label: "Remove",
          className: "danger",
          onClick: async () => {
            const status = await api.del("/api/cloud/key");
            renderKeyStatus(status);
          },
        },
        { label: "Cancel", className: "secondary" },
      ],
    });
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    settingsConfirmationEl.classList.add("hidden");
    settingsErrorEl.classList.add("hidden");
    const formData = new FormData(settingsForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      await api.put("/api/cloud/settings", payload);
      settingsConfirmationEl.textContent = "Saved.";
      settingsConfirmationEl.classList.remove("hidden");
    } catch (err) {
      settingsErrorEl.textContent = err.message;
      settingsErrorEl.classList.remove("hidden");
    }
  });

  loadStatus();
})();
