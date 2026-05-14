import type {
  PortDetailDto,
  PortSummaryListDto,
  MetaResponse,
  TripletResponse,
  JobRunListDto,
  UpstreamDto,
  ReleaseListDto,
  PortFileDto,
} from "@pkg/shared";

const BASE_URL = "/api";

async function fetchJson<T>(path: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  getMeta: () => fetchJson<MetaResponse>(`${BASE_URL}/meta`),

  getPorts: (params?: { q?: string; sort?: string; dir?: string; page?: string; pageSize?: string }, signal?: AbortSignal) =>
    fetchJson<PortSummaryListDto>(`${BASE_URL}/ports`, params, signal),

  getPortDetail: (name: string) =>
    fetchJson<PortDetailDto>(`${BASE_URL}/ports/${encodeURIComponent(name)}`),

  getPortVersionDetail: (name: string, version: string, portVersion?: number) =>
    fetchJson<PortDetailDto>(
      portVersion && portVersion > 0
        ? `${BASE_URL}/ports/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/${portVersion}`
        : `${BASE_URL}/ports/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}`
    ),

  getPortVersions: (name: string) =>
    fetchJson<{ versions: PortDetailDto["versions"] }>(`${BASE_URL}/ports/${encodeURIComponent(name)}/versions`),

  getPortDependencies: (name: string) =>
    fetchJson<{ dependencies: PortDetailDto["dependencies"] }>(`${BASE_URL}/ports/${encodeURIComponent(name)}/dependencies`),

  getPortFeatures: (name: string) =>
    fetchJson<{ features: PortDetailDto["features"] }>(`${BASE_URL}/ports/${encodeURIComponent(name)}/features`),

  getPortFiles: (name: string) =>
    fetchJson<{ files: PortDetailDto["files"] }>(`${BASE_URL}/ports/${encodeURIComponent(name)}/files`),

  getPortFile: (name: string, fileId: number) =>
    fetchJson<PortFileDto>(`${BASE_URL}/ports/${encodeURIComponent(name)}/files/${fileId}`),

  getPortUpstream: (name: string) =>
    fetchJson<{ upstream: UpstreamDto | null }>(`${BASE_URL}/ports/${encodeURIComponent(name)}/upstream`),

  getPopularPorts: (params?: { page?: string; pageSize?: string }) =>
    fetchJson<PortSummaryListDto>(`${BASE_URL}/ports/popular`, params),

  getRecentlyAddedPorts: (params?: { page?: string; pageSize?: string }) =>
    fetchJson<PortSummaryListDto>(`${BASE_URL}/ports/recently-added`, params),

  getRecentlyUpdatedPorts: (params?: { page?: string; pageSize?: string }) =>
    fetchJson<PortSummaryListDto>(`${BASE_URL}/ports/recently-updated`, params),

  getTriplets: () => fetchJson<TripletResponse>(`${BASE_URL}/triplets`),

  getTripletPorts: (triplet: string, params?: { page?: string; pageSize?: string }) =>
    fetchJson<PortSummaryListDto>(`${BASE_URL}/triplets/${encodeURIComponent(triplet)}/ports`, params),

  getReleases: () => fetchJson<ReleaseListDto>(`${BASE_URL}/releases`),

  getJobRuns: () => fetchJson<JobRunListDto>(`${BASE_URL}/jobs/runs`),
};
