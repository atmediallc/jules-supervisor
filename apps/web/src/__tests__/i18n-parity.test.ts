import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";

type JsonValue = string | { [k: string]: JsonValue };

/** Collect the leaf message strings reachable under a JSON subtree. */
function leaves(obj: unknown, path: string, out: { path: string; value: string }[]): void {
  if (typeof obj === "string") {
    out.push({ path, value: obj });
    return;
  }
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      leaves((obj as Record<string, JsonValue>)[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }
  throw new Error(`Unexpected non-string, non-object at ${path}: ${String(obj)}`);
}

function collectLeaves(root: unknown): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  leaves(root, "", out);
  return out;
}

/** Extract ICU {placeholders} from a message string. */
function places(value: string): string[] {
  const matches = value.match(/\{([a-zA-Z0-9_]+)\}/g) ?? [];
  return matches.map((m) => m.slice(1, -1)).sort();
}

/** Shape (string vs nested object) of a single catalog tree node. */
type Shape =
  | { kind: "string" }
  | { kind: "object"; keys: Record<string, Shape> };

function shapeOf<T>(node: T): Shape {
  if (typeof node === "string") return { kind: "string" };
  const keys: Record<string, Shape> = {};
  for (const k of Object.keys(node as Record<string, unknown>)) {
    keys[k] = shapeOf((node as Record<string, T>)[k]);
  }
  return { kind: "object", keys };
}

describe("i18n catalog parity", () => {
  it("en and es have identical key trees", () => {
    expect(shapeOf(es as unknown as JsonValue)).toEqual(shapeOf(en as unknown as JsonValue));
  });

  it("every es message has the same ICU placeholders as its en counterpart", () => {
    const enLeaves = collectLeaves(en);
    const esLeaves = collectLeaves(es);
    expect(enLeaves.length).toBeGreaterThan(0);

    const esByPath = new Map(esLeaves.map((l) => [l.path, l.value]));

    for (const leaf of enLeaves) {
      // Key-tree parity is covered by the test above; guard shape again cheaply.
      if (!esByPath.has(leaf.path)) continue;
      const esValue = esByPath.get(leaf.path)!;
      expect(
        places(esValue),
        `es placeholder mismatch at ${leaf.path}`,
      ).toEqual(places(leaf.value));
    }
  });

  it("catalogs contain non-empty messages for every namespace", () => {
    const enLeaves = collectLeaves(en);
    const empty = enLeaves.filter((l) => l.value.trim() === "");
    expect(empty).toEqual([]);
  });
});