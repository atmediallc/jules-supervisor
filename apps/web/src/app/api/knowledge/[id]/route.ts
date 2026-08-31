import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import { getDatabase, RepositoryKnowledgeRepository } from "@jules/db";
import { normalizeRepositoryId } from "@jules/shared";

/**
 * P1: single knowledge entry operations (repository-scoped).
 * GET    /api/knowledge/[id]?repository=owner/repo → single entry
 * DELETE /api/knowledge/[id]?repository=owner/repo → tombstone delete
 */

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const url = new URL(req.url);
    const repository = url.searchParams.get("repository");

    if (!repository) {
      return NextResponse.json(
        { error: "Query parameter 'repository' is required" },
        { status: 400 },
      );
    }

    const normalized = normalizeRepositoryId(repository);
    if (!normalized.repositoryId) {
      return NextResponse.json(
        {
          error: `Invalid repository identifier: ${normalized.rejectionReason ?? "NOT_IDENTIFIABLE"}`,
        },
        { status: 400 },
      );
    }

    const config = getConfig();
    const db = getDatabase(config.DATABASE_URL);
    const knowledgeRepo = new RepositoryKnowledgeRepository(db);

    const entry = await knowledgeRepo.findById(id);
    if (!entry || entry.repositoryId !== normalized.repositoryId) {
      return NextResponse.json({ error: "Knowledge entry not found" }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (err: unknown) {
    console.error("GET /api/knowledge/[id] failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const url = new URL(req.url);
    const repository = url.searchParams.get("repository");

    if (!repository) {
      return NextResponse.json(
        { error: "Query parameter 'repository' is required" },
        { status: 400 },
      );
    }

    const normalized = normalizeRepositoryId(repository);
    if (!normalized.repositoryId) {
      return NextResponse.json(
        {
          error: `Invalid repository identifier: ${normalized.rejectionReason ?? "NOT_IDENTIFIABLE"}`,
        },
        { status: 400 },
      );
    }

    const config = getConfig();
    const db = getDatabase(config.DATABASE_URL);
    const knowledgeRepo = new RepositoryKnowledgeRepository(db);

    const entry = await knowledgeRepo.findById(id);
    if (!entry || entry.repositoryId !== normalized.repositoryId) {
      return NextResponse.json({ error: "Knowledge entry not found" }, { status: 404 });
    }

    await knowledgeRepo.delete(id);
    return NextResponse.json({ deleted: true, id });
  } catch (err: unknown) {
    console.error("DELETE /api/knowledge/[id] failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
