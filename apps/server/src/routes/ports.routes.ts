import type { FastifyInstance } from "fastify";
import {
  getPorts, getPortDetail, getPopularPorts, getRecentlyAddedPorts,
  getRecentlyUpdatedPorts, getPortFeatures, getPortDeps, getPortFilesList,
  getPortFile, getPortUpstream, portExists, replyNotFound, replyBadRequest, searchPorts
} from "../services/ports.service.js";
import { parseSearchQuery } from "@pkg/shared";

export async function portsRoutes(app: FastifyInstance) {
  app.get("/api/ports", async (request) => {
    const { q, sort, dir, page, pageSize } = request.query as {
      q?: string; sort?: string; dir?: string; page?: string; pageSize?: string;
    };
    const { text, filters } = parseSearchQuery(q ?? "");
    return searchPorts({
      text,
      filters,
      sort,
      sortDirection: dir,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 30,
    });
  });

  app.get("/api/ports/popular", async (request) => {
    const { page, pageSize } = request.query as { page?: string; pageSize?: string; };
    return getPopularPorts(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 30
    );
  });

  app.get("/api/ports/recently-added", async (request) => {
    const { page, pageSize } = request.query as { page?: string; pageSize?: string; };
    return getRecentlyAddedPorts(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 30
    );
  });

  app.get("/api/ports/recently-updated", async (request) => {
    const { page, pageSize } = request.query as { page?: string; pageSize?: string; };
    return getRecentlyUpdatedPorts(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 30
    );
  });

  app.get("/api/ports/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    const port = await getPortDetail(name);
    if (!port) return replyNotFound(reply, "PORT_NOT_FOUND", `Port '${name}' was not found.`);
    return port;
  });

  app.get("/api/ports/:name/v/:version", async (request, reply) => {
    const { name, version } = request.params as { name: string; version: string };
    const port = await getPortDetail(name, { version });
    if (!port) return replyNotFound(reply, "PORT_VERSION_NOT_FOUND", `Port '${name}' version '${version}' was not found.`);
    return port;
  });

  app.get("/api/ports/:name/v/:version/:portVersion", async (request, reply) => {
    const { name, version, portVersion } = request.params as { name: string; version: string; portVersion: string };
    const parsedPortVersion = Number.parseInt(portVersion, 10);
    if (Number.isNaN(parsedPortVersion) || parsedPortVersion < 0) {
      return replyBadRequest(reply, "INVALID_PORT_VERSION", `Port version '${portVersion}' must be a non-negative integer.`);
    }

    const port = await getPortDetail(name, { version, portVersion: parsedPortVersion });
    if (!port) return replyNotFound(reply, "PORT_VERSION_NOT_FOUND", `Port '${name}' version '${version}#${parsedPortVersion}' was not found.`);
    return port;
  });

  app.get("/api/ports/:name.json", async (request, reply) => {
    const { name } = request.params as { name: string };
    const port = await getPortDetail(name);
    if (!port) return replyNotFound(reply, "PORT_NOT_FOUND", `Port '${name}' was not found.`);
    reply.header("Content-Type", "application/json");
    return port;
  });

  app.get("/api/ports/:name/versions", async (request, reply) => {
    const { name } = request.params as { name: string };
    const port = await getPortDetail(name);
    if (!port) return replyNotFound(reply, "PORT_NOT_FOUND", `Port '${name}' was not found.`);
    return { versions: port.versions };
  });

  app.get("/api/ports/:name/features", async (request, reply) => {
    const { name } = request.params as { name: string };
    const port = await getPortDetail(name);
    if (!port) return replyNotFound(reply, "PORT_NOT_FOUND", `Port '${name}' was not found.`);
    return { features: port.features };
  });

  app.get("/api/ports/:name/dependencies", async (request, reply) => {
    const { name } = request.params as { name: string };
    const port = await getPortDetail(name);
    if (!port) return replyNotFound(reply, "PORT_NOT_FOUND", `Port '${name}' was not found.`);
    return { dependencies: port.dependencies };
  });

  app.get("/api/ports/:name/files", async (request, reply) => {
    const { name } = request.params as { name: string };
    const files = await getPortFilesList(name);
    return { files };
  });

  app.get("/api/ports/:name/files/:fileId", async (request, reply) => {
    const { name, fileId } = request.params as { name: string; fileId: string };
    const file = await getPortFile(name, parseInt(fileId, 10));
    if (!file) return replyNotFound(reply, "FILE_NOT_FOUND", `File not found.`);
    return file;
  });

  app.get("/api/ports/:name/upstream", async (request, reply) => {
    const { name } = request.params as { name: string };
    const upstream = await getPortUpstream(name);
    if (!upstream && !(await portExists(name))) {
      return replyNotFound(reply, "PORT_NOT_FOUND", `Port '${name}' was not found.`);
    }
    return { upstream };
  });
}
