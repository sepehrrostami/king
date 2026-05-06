const TARGET_BASE = (Netlify.env.get("DOMAIN") || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "cf-connecting-ip",
  "cf-ray",
  "cdn-loop",
]);

const FETCH_TIMEOUT = 25000;
const RETRY_STATUS = new Set([500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function copyRequestHeaders(request) {
  const headers = new Headers();

  let clientIp = null;

  for (const [key, value] of request.headers.entries()) {
    const k = key.toLowerCase();

    if (STRIP_HEADERS.has(k)) continue;
    if (k.startsWith("x-nf-")) continue;
    if (k.startsWith("x-netlify-")) continue;

    if (k === "x-real-ip") {
      clientIp = value;
      continue;
    }

    if (k === "x-forwarded-for") {
      if (!clientIp) {
        clientIp = value.split(",")[0].trim();
      }
      continue;
    }

    headers.set(key, value);
  }

  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
    headers.set("x-real-ip", clientIp);
  }

  headers.set("accept-encoding", "gzip, deflate, br");

  return headers;
}

async function fetchWithRetry(url, options, retries = 1) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!RETRY_STATUS.has(response.status)) {
        return response;
}