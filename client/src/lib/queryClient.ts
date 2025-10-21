import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Global token getter function (set by Kinde authentication)
let getAccessToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(tokenGetter: () => Promise<string | null>) {
  getAccessToken = tokenGetter;
  console.log("🔑 Token getter set successfully");
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  console.log("🔑 getAuthHeaders: Getting token, getter exists:", !!getAccessToken);
  
  if (!getAccessToken) {
    console.warn("⚠️ getAuthHeaders: Token getter not initialized yet");
    return {};
  }

  const token = await getAccessToken();
  console.log("🔑 getAuthHeaders: Got token:", token ? `${token.substring(0, 20)}...` : "null");

  if (token) {
    return {
      "Authorization": `Bearer ${token}`,
    };
  }

  console.warn("⚠️ getAuthHeaders: No token available");
  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  console.log(`🌐 API Request: ${method} ${url}`);
  
  const authHeaders = await getAuthHeaders();
  const headers = {
    ...authHeaders,
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  console.log(`🌐 Request headers:`, Object.keys(headers));

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  console.log(`🌐 Response status: ${res.status}`);
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = await getAuthHeaders();

    const res = await fetch(queryKey.join("/") as string, {
      headers: authHeaders,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
