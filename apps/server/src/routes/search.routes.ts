import type { FastifyInstance } from "fastify";
import { searchPorts } from "../services/ports.service.js";
import { parseSearchQuery } from "@pkg/shared";

export async function searchRoutes(app: FastifyInstance) {
  app.get("/api/search", async (request) => {
    const { q, sort, page, pageSize } = request.query as {
      q?: string; sort?: string; page?: string; pageSize?: string;
    };

    const parsed = q ? parseSearchQuery(q) : { text: undefined, filters: [] };

    return searchPorts({
      text: parsed.text,
      filters: parsed.filters,
      sort,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 30,
    });
  });
}
