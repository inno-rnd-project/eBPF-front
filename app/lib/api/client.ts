import ky from "ky";

export const DEFAULT_API_BASE_URL = "http://101.79.72.42:19830/api/v1";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

export const api = ky.create({
  prefixUrl: API_BASE_URL,
  headers: {
    accept: "application/json",
  },
  timeout: 10_000,
  retry: {
    limit: 2,
    methods: ["get"],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
  },
});
