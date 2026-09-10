import { api } from "../api";

/**
 * Print orchestration ported from frontend/printing.js.
 * Test mode opens PDF; Live mode sends ESC/POS via QZ Tray.
 */

let qzConnectPromise = null;
let qzSecurityConfigured = false;

function getQz() {
  return typeof window !== "undefined" ? window.qz : undefined;
}

function configureQzSecurity() {
  const qz = getQz();
  if (qzSecurityConfigured || !qz) return;
  qzSecurityConfigured = true;
  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setCertificatePromise(function (resolve, reject) {
    api.get("/api/qz/certificate").then((data) => resolve(data.certificate)).catch(reject);
  });
  qz.security.setSignaturePromise(function (toSign) {
    return function (resolve, reject) {
      api.post("/api/qz/sign", { data: toSign }).then((data) => resolve(data.signature)).catch(reject);
    };
  });
}

export function connectQz() {
  const qz = getQz();
  if (!qz) {
    return Promise.reject(
      new Error("QZ Tray library did not load (check your internet connection)")
    );
  }
  if (!qzConnectPromise || !qz.websocket.isActive()) {
    configureQzSecurity();
    qzConnectPromise = qz.websocket.connect();
  }
  return qzConnectPromise;
}

async function printEscposBytes(base64Bytes) {
  const qz = getQz();
  const settings = await api.get("/api/tools/shop-settings");
  if (!settings.printer_name) {
    throw new Error("No printer selected yet -- pick one in Tools first.");
  }
  await connectQz();
  const printer = await qz.printers.find(settings.printer_name);
  const config = qz.configs.create(printer);
  await qz.print(config, [{ type: "raw", format: "base64", data: base64Bytes }]);
}

export async function deliverReceipt(payload) {
  if (payload.mode === "test") {
    window.open(payload.pdf_url, "_blank");
  } else {
    await printEscposBytes(payload.escpos_base64);
  }
}

export async function printReceipt(url) {
  const payload = await api.post(url);
  await deliverReceipt(payload);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("QZ Tray check timed out")), ms)
    ),
  ]);
}

/** Live-mode-only health check; returns an error message or null. */
export async function checkQzTrayIfLive() {
  try {
    const status = await api.get("/api/status");
    if (status.mode !== "live") return null;
    await withTimeout(connectQz(), 4000);
    return null;
  } catch {
    return "Printer service not running — start QZ Tray.";
  }
}
