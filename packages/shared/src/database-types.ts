// Re-exporta os tipos gerados pelo app web (`pnpm run types:generate`), fonte
// única de verdade do schema. Import type-only: some do bundle do Metro,
// então isso não cria dependência de runtime entre mobile e apps/web.
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from "../../../src/lib/supabase/database.types";
