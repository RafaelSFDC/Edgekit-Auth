import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import type { D1Database, D1PreparedStatement, D1Result, D1Response } from "@cloudflare/workers-types";

export function createMockD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const rawSql = fs.readFileSync("drizzle/migrations/0000_tearful_skrulls.sql", "utf8");
  for (const stmt of rawSql.split("--> statement-breakpoint")) {
    const trimmed = stmt.trim();
    if (trimmed) sqlite.exec(trimmed);
  }

  function createStatement(query: string, bindings: any[] = []): D1PreparedStatement {
    return {
      bind(...values: any[]) {
        return createStatement(query, values);
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const stmt = sqlite.prepare(query);
        const results = stmt.all(...bindings) as T[];
        return {
          results,
          success: true,
          meta: {} as any,
        };
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const stmt = sqlite.prepare(query);
        const row = stmt.get(...bindings) as any;
        if (!row) return null;
        if (colName) return row[colName] ?? null;
        return row;
      },
      async run<T = unknown>(): Promise<D1Response> {
        const stmt = sqlite.prepare(query);
        const info = stmt.run(...bindings);
        return {
          success: true,
          meta: {
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid),
          } as any,
        };
      },
      async raw<T = unknown>(): Promise<T[]> {
        const stmt = sqlite.prepare(query);
        try {
          const rows = stmt.all(...bindings) as any[];
          // Cloudflare D1 raw() returns each row as an array of column values
          return rows.map((row) => Object.values(row)) as any;
        } catch (e: any) {
          console.error("SQL EXECUTION FAILED:", query, "BINDINGS:", bindings, "ERROR:", e.message);
          throw e;
        }
      },
    } as unknown as D1PreparedStatement;
  }

  return {
    prepare(query: string) {
      return createStatement(query);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results: D1Result[] = [];
      for (const s of statements) {
        results.push(await s.all());
      }
      return results;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;
}
