import ky from "ky";

export const DEFAULT_API_BASE_URL = "http://101.79.72.42:19830/api/v1";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

export function toSearchParams(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export const api = ky.create({
  prefix: API_BASE_URL,
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
