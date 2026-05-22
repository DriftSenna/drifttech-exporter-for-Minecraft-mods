import { useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

const BASE_URL = process.env["EXPO_PUBLIC_API_URL"] ?? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`;

export function useApi() {
  const { token } = useAuth();

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const get = useCallback(
    async <T = unknown>(path: string): Promise<T> => {
      const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed`);
      return data as T;
    },
    [authHeaders]
  );

  const post = useCallback(
    async <T = unknown>(path: string, body?: unknown): Promise<T> => {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed`);
      return data as T;
    },
    [authHeaders]
  );

  const del = useCallback(
    async <T = unknown>(path: string): Promise<T> => {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed`);
      return data as T;
    },
    [authHeaders]
  );

  return { get, post, del, baseUrl: BASE_URL };
}
