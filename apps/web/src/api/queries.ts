import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: api.getMeta });
}

export function usePorts(params?: { q?: string; sort?: string; dir?: string; page?: string; pageSize?: string }) {
  return useQuery({
    queryKey: ["ports", params],
    queryFn: ({ signal }) => api.getPorts(params, signal),
    placeholderData: (previousData) => previousData,
  });
}

export function usePortDetail(name: string) {
  return useQuery({ queryKey: ["port", name], queryFn: () => api.getPortDetail(name), enabled: !!name });
}

export function useResolvedPortDetail(params: { name: string; version?: string; portVersion?: number }) {
  const { name, version, portVersion } = params;
  return useQuery({
    queryKey: ["port", name, version ?? "current", portVersion ?? 0],
    queryFn: () => (
      version
        ? api.getPortVersionDetail(name, version, portVersion)
        : api.getPortDetail(name)
    ),
    enabled: !!name,
  });
}

export function usePortVersions(name: string) {
  return useQuery({ queryKey: ["port", name, "versions"], queryFn: () => api.getPortVersions(name), enabled: !!name });
}

export function usePortDependencies(name: string) {
  return useQuery({ queryKey: ["port", name, "dependencies"], queryFn: () => api.getPortDependencies(name), enabled: !!name });
}

export function usePortFeatures(name: string) {
  return useQuery({ queryKey: ["port", name, "features"], queryFn: () => api.getPortFeatures(name), enabled: !!name });
}

export function usePortFiles(name: string) {
  return useQuery({ queryKey: ["port", name, "files"], queryFn: () => api.getPortFiles(name), enabled: !!name });
}

export function usePortFile(name: string, fileId: number) {
  return useQuery({ queryKey: ["port", name, "files", fileId], queryFn: () => api.getPortFile(name, fileId), enabled: !!name && !!fileId });
}

export function usePortUpstream(name: string) {
  return useQuery({ queryKey: ["port", name, "upstream"], queryFn: () => api.getPortUpstream(name), enabled: !!name });
}

export function usePopularPorts(params?: { page?: string; pageSize?: string }) {
  return useQuery({ queryKey: ["ports", "popular", params], queryFn: () => api.getPopularPorts(params) });
}

export function useRecentlyAddedPorts(params?: { page?: string; pageSize?: string }) {
  return useQuery({ queryKey: ["ports", "recently-added", params], queryFn: () => api.getRecentlyAddedPorts(params) });
}

export function useRecentlyUpdatedPorts(params?: { page?: string; pageSize?: string }) {
  return useQuery({ queryKey: ["ports", "recently-updated", params], queryFn: () => api.getRecentlyUpdatedPorts(params) });
}

export function useTriplets() {
  return useQuery({ queryKey: ["triplets"], queryFn: api.getTriplets });
}

export function useTripletPorts(triplet: string, params?: { page?: string; pageSize?: string }) {
  return useQuery({ queryKey: ["triplets", triplet, "ports", params], queryFn: () => api.getTripletPorts(triplet, params), enabled: !!triplet });
}

export function useReleases() {
  return useQuery({ queryKey: ["releases"], queryFn: api.getReleases });
}
