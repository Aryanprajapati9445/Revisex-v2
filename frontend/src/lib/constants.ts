// Kept in sync with backend/src/modules/notes/notes.service.ts's
// PREVIEW_MAX_BYTES. Checked here first so the UI never even requests a
// preview URL for an oversized file — no wasted round trip, and no chance of
// handing the browser something large enough to choke rendering an
// <img>/<iframe> on. The backend re-checks the same limit server-side so a
// direct API call can't bypass this.
export const PREVIEW_MAX_BYTES = 20 * 1024 * 1024; // 20MB
