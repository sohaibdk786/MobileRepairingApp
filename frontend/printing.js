// Shared print orchestration (spec: "keep the current connectAndPrint
// pattern... connects to QZ Tray once on open and stays connected").
//
// Test mode opens the generated PDF in a new tab; Live mode sends the
// exact ESC/POS bytes to the printer via QZ Tray. This is the ONE place
// either mode gets triggered from, so every print button (repair, sale,
// voucher, reprint, test print) goes through the same path.
//
// Depends on qz-tray.js being loaded (as a global `qz`) on any page that
// calls printReceipt() or checkQzTrayIfLive().

let qzConnectPromise = null;
let qzSecurityConfigured = false;

// Signs every connection with a real certificate instead of connecting
// "anonymously" -- an anonymous connection gives QZ Tray no stable
// identity to remember, which is why its "Remember this decision"
// checkbox didn't actually stick (kept reappearing every session/reload).
// The private key itself never reaches the browser -- these two calls
// just fetch the public certificate and ask the server to sign whatever
// QZ Tray hands over, per request (see app/routes/qz.py). If neither
// credential file exists on the server, these calls simply fail with a
// 404 each time QZ Tray asks -- same as today's anonymous behaviour,
// not a harder failure.
//
// "SHA512" here must match app.qz_signing.SIGNATURE_HASH on the backend
// exactly, or QZ Tray silently rejects every signature as invalid.
function configureQzSecurity() {
  if (qzSecurityConfigured || typeof qz === "undefined") return;
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

function connectQz() {
  if (typeof qz === "undefined") {
    return Promise.reject(new Error("QZ Tray library did not load (check your internet connection)"));
  }
  // Re-checks isActive() on every call, not just when qzConnectPromise
  // is still unset -- QZ Tray can close an idle connection on its own
  // (its own "Connection Idle Timeout" notification) well after a page
  // first connected. Without this check, every later print attempt on
  // that same page would keep reusing the old, now-dead cached promise
  // and silently fail instead of reconnecting -- e.g. the counter sits
  // on one page for a while between customers, then someone tries to
  // print.
  if (!qzConnectPromise || !qz.websocket.isActive()) {
    configureQzSecurity();
    qzConnectPromise = qz.websocket.connect();
  }
  return qzConnectPromise;
}

async function printEscposBytes(base64Bytes) {
  const settings = await api.get("/api/tools/shop-settings");
  if (!settings.printer_name) {
    throw new Error("No printer selected yet -- pick one in Tools first.");
  }
  await connectQz();
  const printer = await qz.printers.find(settings.printer_name);
  const config = qz.configs.create(printer);
  // ESC/POS control bytes and the £ fix (app/escpos.py) need to reach the
  // printer completely unchanged -- sending them as 'raw'/'base64' lets
  // QZ Tray decode the exact bytes itself, rather than trusting a JS
  // string's own text encoding (that mismatch was the original £ bug --
  // see app/escpos.py's docstring).
  await qz.print(config, [{ type: "raw", format: "base64", data: base64Bytes }]);
}

// Delivers whatever a /print or /paste-print endpoint returned.
async function deliverReceipt(payload) {
  if (payload.mode === "test") {
    window.open(payload.pdf_url, "_blank");
  } else {
    await printEscposBytes(payload.escpos_base64);
  }
}

async function printReceipt(url) {
  const payload = await api.post(url);
  await deliverReceipt(payload);
}

// Live-mode-only QZ Tray "is it running" check (spec section 10.A),
// skipped entirely in Test mode since Test mode never talks to a
// printer. Non-blocking: shows a small banner rather than stopping the
// rest of the app from working.
//
// Bounded to a few seconds -- qz-tray's own connect() can retry
// internally for a long time before finally giving up when QZ Tray
// isn't actually running, which made this "non-blocking" background
// check feel like the whole page was hanging on load. This is only a
// background health check, not a real print attempt, so it's fine (and
// much better) to fail fast and show the banner rather than wait out
// however long qz-tray's own retries take.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("QZ Tray check timed out")), ms)),
  ]);
}

async function checkQzTrayIfLive() {
  try {
    const status = await api.get("/api/status");
    if (status.mode !== "live") return;
    await withTimeout(connectQz(), 4000);
  } catch (err) {
    const banner = document.createElement("div");
    banner.className = "banner-msg error";
    banner.style.margin = "0.75rem 1.5rem";
    banner.textContent = "Printer service not running — start QZ Tray.";
    document.querySelector("main")?.prepend(banner);
  }
}

document.addEventListener("DOMContentLoaded", checkQzTrayIfLive);
