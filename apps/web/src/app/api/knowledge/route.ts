import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@jules/config";
import {
  getDatabase,
  KNOWLEDGE_TYPES,
  RepositoryKnowledgeRepository,
  TRUST_LEVELS,
} from "@jules/db";
import { normalizeRepositoryId } from "@jules/shared";
import { logRouteError } from "../route-logger";

/**
 * P1: Repository knowledge CRUD (human-maintained, repository-scoped).
 * GET  /api/knowledge?repository=owner/repo  → active knowledge entries
 * POST /api/knowledge                        → create/update (HUMAN_VERIFIED)
 */

const KnowledgeBodySchema = z.object({
  repositoryId: z.string().min(1).max(512),
  knowledgeType: z.enum(KNOWLEDGE_TYPES),
  trustLevel: z.enum(TRUST_LEVELS).default("HUMAN_VERIFIED"),
  content: z.string().min(1).max(10_000),
  sourcePath: z.string().max(512).optional(),
});

const KnowledgeQuerySchema = z.object({
  repository: z.string().min(1).max(512),
  knowledgeTypes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsedQuery = KnowledgeQuerySchema.safeParse({
      repository: url.searchParams.get("repository"),
      knowledgeTypes: url.searchParams.get("knowledgeTypes") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsedQuery.error.issues },
        { status: 400 },
      );
    }

    const normalized = normalizeRepositoryId(parsedQuery.data.repository);
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

    const knowledgeTypes = parsedQuery.data.knowledgeTypes
      ?.split(",")
      .map((t) => t.trim())
      .filter((t): t is (typeof KNOWLEDGE_TYPES)[number] =>
        (KNOWLEDGE_TYPES as readonly string[]).includes(t),
      );

    const entries = await knowledgeRepo.listActive({
      repositoryId: normalized.repositoryId,
      knowledgeTypes: knowledgeTypes && knowledgeTypes.length > 0 ? knowledgeTypes : undefined,
    });
    return NextResponse.json({ entries });
  } catch (err: unknown) {
    logRouteError("GET /api/knowledge", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = KnowledgeBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const normalized = normalizeRepositoryId(parsed.data.repositoryId);
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

    const entry = await knowledgeRepo.upsert({
      id: `kn_${crypto.randomUUID()}`,
      repositoryId: normalized.repositoryId,
      knowledgeType: parsed.data.knowledgeType,
      sourceType: "HUMAN_OPERATOR",
      // Human-created entries are at most HUMAN_VERIFIED (never AUTHORITATIVE).
      trustLevel:
        parsed.data.trustLevel === "REPOSITORY_AUTHORITATIVE"
          ? "HUMAN_VERIFIED"
          : parsed.data.trustLevel,
      content: parsed.data.content,
      sourcePath: parsed.data.sourcePath ?? null,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err: unknown) {
    logRouteError("POST /api/knowledge", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
