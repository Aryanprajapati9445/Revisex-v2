import { setupServer } from "msw/node";

export const server = setupServer();
export const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
