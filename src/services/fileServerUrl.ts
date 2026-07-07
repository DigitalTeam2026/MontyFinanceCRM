// Base URL of the document file server (tools/file-server).
//
// Default: the same-origin path `/files`, which IIS reverse-proxies to the file
// server on localhost:4000 (see public/web.config → ProxyToFileServer). Going
// through the same origin means the browser NEVER connects to a separate port:
// it works from any client PC, under any IP/hostname/domain, and over HTTPS,
// with no CORS. Talking to `http://<host>:4000` directly failed for remote users
// because port 4000 isn't reachable across the network (ERR_CONNECTION_TIMED_OUT)
// even though the app on port 80 is.
//
// An explicit VITE_FILE_SERVER_URL still wins, for setups that reach the file
// server directly (e.g. local dev with `npm run dev`, where set it to
// http://localhost:4000).
const explicit = (import.meta.env.VITE_FILE_SERVER_URL as string | undefined)?.trim();

export const FILE_SERVER_URL = (explicit && explicit.length > 0)
  ? explicit.replace(/\/$/, '')
  : `${window.location.origin}/files`;
