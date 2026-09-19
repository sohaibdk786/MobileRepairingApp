import { api } from "../api";

/**
 * Print orchestration ported from frontend/printing.js.
 * Three print methods (Tools > Printer), independent of Test/Live mode:
 * QZ Tray, the browser's native print dialog (default printer), or a
 * saved PDF.
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

function printPdfDialog(pdfUrl) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.onload = () => {
      frame.contentWindow.print();
      resolve();
      // The print dialog can stay open a while after this -- removing
      // the frame too soon cancels it on some browsers, so it's left in
      // place well past any realistic dialog interaction instead.
      setTimeout(() => frame.remove(), 60000);
    };
    frame.onerror = () => reject(new Error("Could not load the receipt PDF"));
    document.body.appendChild(frame);
    frame.src = pdfUrl;
  });
}

function downloadAndOpenPdf(pdfUrl) {
  const link = document.createElement("a");
  link.href = pdfUrl;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.open(pdfUrl, "_blank");
}

export async function deliverReceipt(payload) {
  if (payload.method === "qz") {
    await printEscposBytes(payload.escpos_base64);
  } else if (payload.method === "default_printer") {
    await printPdfDialog(payload.pdf_url);
  } else {
    downloadAndOpenPdf(payload.pdf_url);
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

/** Only checks QZ Tray when it's actually the selected print method;
 * returns an error message or null. */
export async function checkQzTrayIfSelected() {
  try {
    const status = await api.get("/api/status");
    if (status.print_method !== "qz") return null;
    await withTimeout(connectQz(), 4000);
    return null;
  } catch {
    return "Printer service not running — start QZ Tray.";
  }
}
