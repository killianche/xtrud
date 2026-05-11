// Типы Supabase БД.
//
// Регенерация после изменения схемы:
//   npx supabase gen types typescript --project-id wgeimsajvjkzrrnfrnkb > src/types/database.ts
//
// Или через Supabase MCP:
//   mcp__supabase__generate_typescript_types
//
// До первой миграции (sprint 1.4) — stub. После 1.4 этот файл будет полностью перегенерирован.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
