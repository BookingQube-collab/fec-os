"use client";

import { useCallback, useMemo, useState } from "react";
import { Code2, Loader2, Play, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  API_CATEGORIES,
  API_ENDPOINTS,
  API_ENDPOINT_COUNT,
  type ApiEndpoint,
  type HttpMethod,
} from "@/lib/api-catalog";
import { useUserRoles } from "@/hooks/use-auth";
import { canAccessApiExplorer } from "@/lib/rbac";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const METHOD_VARIANT: Record<HttpMethod, "default" | "secondary" | "destructive" | "outline"> = {
  GET: "secondary",
  POST: "default",
  PUT: "outline",
  PATCH: "outline",
  DELETE: "destructive",
};

const AUTH_LABELS = {
  session: "Session",
  api_key: "API Key",
  cron_secret: "CRON_SECRET",
  none: "None",
} as const;

interface TryState {
  method: HttpMethod;
  path: string;
  query: string;
  headers: string;
  body: string;
}

interface ApiResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  error?: string;
}

function defaultTryState(endpoint: ApiEndpoint): TryState {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...endpoint.exampleRequest?.headers,
  };
  const query = endpoint.exampleRequest?.query
    ? new URLSearchParams(endpoint.exampleRequest.query).toString()
    : "";

  return {
    method: endpoint.method,
    path: endpoint.path,
    query,
    headers: JSON.stringify(headers, null, 2),
    body:
      endpoint.exampleRequest?.body !== undefined
        ? JSON.stringify(endpoint.exampleRequest.body, null, 2)
        : endpoint.method === "GET" || endpoint.method === "DELETE"
          ? ""
          : "{}",
  };
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function ApiExplorerPage() {
  const roles = useUserRoles();
  const allowed = canAccessApiExplorer(roles);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState(API_ENDPOINTS[0]?.id ?? "");
  const [tryState, setTryState] = useState<TryState | null>(null);
  const [response, setResponse] = useState<ApiResponseState | null>(null);
  const [sending, setSending] = useState(false);

  const selected = useMemo(
    () => API_ENDPOINTS.find((e) => e.id === selectedId) ?? API_ENDPOINTS[0],
    [selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return API_ENDPOINTS.filter((e) => {
      if (categoryFilter !== "all" && e.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return (
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.authDetail.toLowerCase().includes(q) ||
        e.categoryLabel.toLowerCase().includes(q)
      );
    });
  }, [search, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>();
    for (const ep of filtered) {
      const list = map.get(ep.categoryId) ?? [];
      list.push(ep);
      map.set(ep.categoryId, list);
    }
    return API_CATEGORIES.filter((c) => map.has(c.id)).map((c) => ({
      ...c,
      endpoints: map.get(c.id) ?? [],
    }));
  }, [filtered]);

  const activeTry = tryState ?? (selected ? defaultTryState(selected) : null);

  const selectEndpoint = useCallback((ep: ApiEndpoint) => {
    setSelectedId(ep.id);
    setTryState(defaultTryState(ep));
    setResponse(null);
  }, []);

  const sendRequest = async () => {
    if (!activeTry) return;
    setSending(true);
    setResponse(null);
    const started = performance.now();

    try {
      let headers: Record<string, string> = {};
      if (activeTry.headers.trim()) {
        headers = JSON.parse(activeTry.headers) as Record<string, string>;
      }

      const url = new URL(activeTry.path, window.location.origin);
      if (activeTry.query.trim()) {
        const params = new URLSearchParams(activeTry.query);
        params.forEach((v, k) => url.searchParams.set(k, v));
      }

      const init: RequestInit = {
        method: activeTry.method,
        credentials: "include",
        headers,
      };

      if (activeTry.method !== "GET" && activeTry.method !== "DELETE" && activeTry.body.trim()) {
        init.body = activeTry.body;
      }

      const res = await fetch(url.toString(), init);
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });

      const raw = await res.text();
      const body = raw ? formatJson(raw) : "";

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body,
        durationMs: Math.round(performance.now() - started),
      });
    } catch (e) {
      setResponse({
        status: 0,
        statusText: "Error",
        headers: {},
        body: "",
        durationMs: Math.round(performance.now() - started),
        error: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setSending(false);
    }
  };

  if (!allowed) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        API Explorer requires CEO, COO, Regional Ops, or admin access.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Code2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">API Explorer</h1>
          <p className="text-xs text-muted-foreground">
            Browse and test all {API_ENDPOINT_COUNT} FEC-OS API endpoints. Session auth uses your
            current login; paste API keys and CRON_SECRET from your environment — never commit
            secrets.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 space-y-3 lg:w-[22rem] xl:w-[26rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search path, method, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {API_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto rounded-lg border border-border bg-card">
            {grouped.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No endpoints match your filters.</p>
            ) : (
              grouped.map((group) => (
                <div key={group.id} className="border-b border-border last:border-b-0">
                  <div className="sticky top-0 z-10 bg-muted/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {group.label} ({group.endpoints.length})
                  </div>
                  <ul>
                    {group.endpoints.map((ep) => (
                      <li key={ep.id}>
                        <button
                          type="button"
                          onClick={() => selectEndpoint(ep)}
                          className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/60 ${
                            selected?.id === ep.id ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={METHOD_VARIANT[ep.method]} className="font-mono text-[10px]">
                              {ep.method}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {AUTH_LABELS[ep.authType]}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate font-mono text-xs">{ep.path}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {ep.description}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          {selected && activeTry ? (
            <>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={METHOD_VARIANT[selected.method]}>{selected.method}</Badge>
                  <code className="text-sm font-medium">{selected.path}</code>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p>
                <p className="mt-1 text-xs">
                  <span className="font-medium">Auth:</span> {selected.authDetail}
                </p>
              </div>

              <Tabs defaultValue="try">
                <TabsList>
                  <TabsTrigger value="try">Try it</TabsTrigger>
                  <TabsTrigger value="response">Response</TabsTrigger>
                </TabsList>

                <TabsContent value="try" className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="api-method">Method</Label>
                      <Select
                        value={activeTry.method}
                        onValueChange={(v) =>
                          setTryState((s) => ({ ...(s ?? activeTry), method: v as HttpMethod }))
                        }
                      >
                        <SelectTrigger id="api-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="api-path">Path</Label>
                      <Input
                        id="api-path"
                        className="font-mono text-sm"
                        value={activeTry.path}
                        onChange={(e) =>
                          setTryState((s) => ({ ...(s ?? activeTry), path: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="api-query">Query string</Label>
                    <Input
                      id="api-query"
                      className="font-mono text-sm"
                      placeholder="period=week&locationId=..."
                      value={activeTry.query}
                      onChange={(e) =>
                        setTryState((s) => ({ ...(s ?? activeTry), query: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="api-headers">Headers (JSON)</Label>
                    <Textarea
                      id="api-headers"
                      className="min-h-[100px] font-mono text-xs"
                      value={activeTry.headers}
                      onChange={(e) =>
                        setTryState((s) => ({ ...(s ?? activeTry), headers: e.target.value }))
                      }
                    />
                  </div>

                  {activeTry.method !== "GET" && activeTry.method !== "DELETE" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="api-body">Request body (JSON)</Label>
                      <Textarea
                        id="api-body"
                        className="min-h-[180px] font-mono text-xs"
                        value={activeTry.body}
                        onChange={(e) =>
                          setTryState((s) => ({ ...(s ?? activeTry), body: e.target.value }))
                        }
                      />
                    </div>
                  )}

                  <Button onClick={() => void sendRequest()} disabled={sending}>
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Send request
                  </Button>
                </TabsContent>

                <TabsContent value="response" className="rounded-lg border border-border bg-card p-4">
                  {!response ? (
                    <p className="text-sm text-muted-foreground">
                      Send a request to see status, headers, and body here.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {response.error ? (
                        <p className="text-sm text-destructive">{response.error}</p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={response.status >= 400 ? "destructive" : "secondary"}>
                            {response.status} {response.statusText}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{response.durationMs} ms</span>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Headers</p>
                        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
                          {JSON.stringify(response.headers, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Body</p>
                        <pre className="max-h-[28rem] overflow-auto rounded-md bg-muted p-3 text-xs">
                          {response.body || "(empty)"}
                        </pre>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select an endpoint from the catalog.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ApiExplorerPage;
