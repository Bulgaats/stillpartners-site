import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function writeAuditLog({
  action,
  actorId,
  entityId,
  entityTable,
  metadata = {}
}: {
  action: string;
  actorId: string;
  entityId?: string;
  entityTable: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createServerSupabaseClient();
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    entity_table: entityTable,
    entity_id: entityId,
    action,
    metadata
  });
}
