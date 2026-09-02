import { config as loadDotenv } from "dotenv";

// Must run before any test file imports src/config/env.ts, since that module
// calls its own loadDotenv() (default .env) at import time — dotenv does not
// override already-set process.env values, so setting these first means the
// test values win without editing config/env.ts for a test-only concern.
loadDotenv({ path: ".env.test" });
