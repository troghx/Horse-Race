export const ADMIN_PIN_STORAGE_KEY = "grand_prix_admin_pin_v1";

export function getStoredAdminPin() {
  return sessionStorage.getItem(ADMIN_PIN_STORAGE_KEY) || "";
}

export function storeAdminPin(pin) {
  const cleanPin = String(pin || "").trim();
  if (!cleanPin) return "";
  sessionStorage.setItem(ADMIN_PIN_STORAGE_KEY, cleanPin);
  return cleanPin;
}

export function clearStoredAdminPin() {
  sessionStorage.removeItem(ADMIN_PIN_STORAGE_KEY);
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Error de red");
    error.statusCode = response.status;
    error.current = payload.current || null;
    throw error;
  }
  return payload;
}

export async function verifyAdminPin(pin, { persist = true } = {}) {
  const cleanPin = String(pin || "").trim();
  if (!cleanPin) {
    const error = new Error("Ingresa el codigo de administracion.");
    error.statusCode = 400;
    throw error;
  }

  const payload = await requestJson("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: cleanPin }),
  });

  if (persist) {
    storeAdminPin(cleanPin);
  }

  return payload;
}

export async function validateStoredAdminPin() {
  const pin = getStoredAdminPin();
  if (!pin) return false;

  try {
    await verifyAdminPin(pin);
    return true;
  } catch {
    clearStoredAdminPin();
    return false;
  }
}

export async function requestAdminJson(url, options = {}, { onAuthRequired, retry = true } = {}) {
  let pin = getStoredAdminPin();
  if (!pin && onAuthRequired) {
    pin = await onAuthRequired({ reason: "missing" });
  }

  if (!pin) {
    throw new Error("Se requiere acceso admin para continuar.");
  }

  try {
    return await requestJson(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "x-admin-pin": pin,
      },
    });
  } catch (error) {
    if (error.statusCode === 403 && retry) {
      clearStoredAdminPin();
      if (onAuthRequired) {
        const freshPin = await onAuthRequired({ reason: "invalid" });
        if (freshPin) {
          return requestAdminJson(url, options, { onAuthRequired, retry: false });
        }
      }
    }

    throw error;
  }
}

export function createAdminAuthModal({
  overlaySelector = "#adminAuthModal",
  titleSelector = "#adminAuthTitle",
  descriptionSelector = "#adminAuthDescription",
  formSelector = "#adminAuthForm",
  fieldSelector = ".admin-auth-field",
  inputSelector = "#adminPinInput",
  feedbackSelector = "#adminAuthFeedback",
  cancelSelector = "#adminAuthCancel",
  closeSelector = "#adminAuthClose",
  submitSelector = "#adminAuthSubmit",
} = {}) {
  const overlay = document.querySelector(overlaySelector);
  const title = document.querySelector(titleSelector);
  const description = document.querySelector(descriptionSelector);
  const form = document.querySelector(formSelector);
  const field = document.querySelector(fieldSelector);
  const input = document.querySelector(inputSelector);
  const feedback = document.querySelector(feedbackSelector);
  const cancelButton = document.querySelector(cancelSelector);
  const closeButton = document.querySelector(closeSelector);
  const submitButton = document.querySelector(submitSelector);

  if (!overlay || !form || !input || !submitButton) {
    return {
      prompt: async () => "",
      close() {},
      isOpen() {
        return false;
      },
    };
  }

  let pendingResolver = null;
  let activeOptions = null;

  function setFeedback(message = "", tone = "") {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.tone = tone;
    feedback.hidden = !message;
  }

  function setBusy(isBusy) {
    submitButton.disabled = isBusy;
    input.disabled = isBusy;
    if (cancelButton) cancelButton.disabled = isBusy;
    if (closeButton) closeButton.disabled = isBusy;
  }

  function close(result = "") {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    setFeedback("", "");
    setBusy(false);
    form.reset();
    activeOptions = null;
    if (pendingResolver) {
      pendingResolver(result);
      pendingResolver = null;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (activeOptions?.mode === "choice") {
      close(activeOptions.primaryValue);
      return;
    }

    const pin = String(input.value || "").trim();
    if (!pin) {
      setFeedback("Ingresa el codigo de administracion.", "warning");
      input.focus();
      return;
    }

    setBusy(true);
    setFeedback("Validando acceso...", "");

    try {
      await verifyAdminPin(pin);
      close(pin);
    } catch (error) {
      setBusy(false);
      setFeedback(error.message || "No se pudo validar el acceso.", "warning");
      input.focus();
      input.select();
    }
  }

  form.addEventListener("submit", handleSubmit);

  cancelButton?.addEventListener("click", () => {
    if (activeOptions?.allowCancel === false) return;
    close(activeOptions?.mode === "choice" ? activeOptions.secondaryValue : "");
  });

  closeButton?.addEventListener("click", () => {
    if (activeOptions?.allowCancel === false) return;
    close("");
  });

  overlay.addEventListener("click", (event) => {
    if (event.target !== overlay || activeOptions?.allowCancel === false) return;
    close("");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !overlay.classList.contains("is-open")) return;
    if (activeOptions?.allowCancel === false) return;
    close("");
  });

  return {
    isOpen() {
      return overlay.classList.contains("is-open");
    },
    close,
    prompt(options = {}) {
      if (pendingResolver) {
        close("");
      }

      activeOptions = {
        mode: options.mode === "choice" ? "choice" : "pin",
        title: options.title || "Acceso admin",
        description: options.description || "Ingresa el codigo para continuar.",
        submitLabel: options.submitLabel || "Continuar",
        cancelLabel: options.cancelLabel || "Cancelar",
        allowCancel: options.allowCancel !== false,
        primaryValue: options.primaryValue || "confirm",
        secondaryValue: options.secondaryValue || "",
        feedbackMessage: options.feedbackMessage || "",
        feedbackTone: options.feedbackTone || "",
      };

      if (title) title.textContent = activeOptions.title;
      if (description) description.textContent = activeOptions.description;
      submitButton.textContent = activeOptions.submitLabel;
      if (field) field.hidden = activeOptions.mode === "choice";
      if (cancelButton) {
        cancelButton.textContent = activeOptions.cancelLabel;
        cancelButton.hidden = !activeOptions.allowCancel;
      }
      if (closeButton) closeButton.hidden = !activeOptions.allowCancel;
      setFeedback(activeOptions.feedbackMessage, activeOptions.feedbackTone);
      setBusy(false);
      form.reset();
      overlay.classList.add("is-open");
      overlay.setAttribute("aria-hidden", "false");

      requestAnimationFrame(() => {
        if (activeOptions.mode === "choice") {
          submitButton.focus();
        } else {
          input.focus();
        }
      });

      return new Promise((resolve) => {
        pendingResolver = resolve;
      });
    },
  };
}
