import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`college-notes-backend listening on :${env.PORT} (${env.NODE_ENV})`);
});
