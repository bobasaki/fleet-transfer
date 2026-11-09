import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-admin-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const adminSecret = Deno.env.get("ADMIN_SECRET");
  if (!adminSecret) {
    return json({ error: "admin_not_configured" }, 503);
  }

  const provided = req.headers.get("x-admin-secret") ?? "";
  if (provided !== adminSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "list") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
    const { data, error } = await supabase
      .from("transfers")
      .select(
        "id, transfer_date, driver_id, plate_hr, status, created_at, updated_at, deleted_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json({ error: "db_error", detail: error.message }, 500);

    // Fetch photo counts per transfer
    const ids = (data ?? []).map((t: { id: string }) => t.id);
    const { data: photos } = ids.length
      ? await supabase
          .from("transfer_photos")
          .select("transfer_id")
          .in("transfer_id", ids)
      : { data: [] };

    const photoCounts = new Map<string, number>();
    for (const p of photos ?? []) {
      photoCounts.set(p.transfer_id, (photoCounts.get(p.transfer_id) ?? 0) + 1);
    }

    const rows = (data ?? []).map((t: Record<string, unknown>) => ({
      ...t,
      photo_count: photoCounts.get(t.id as string) ?? 0,
    }));

    return json({ transfers: rows });
  }

  if (action === "delete" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const id = body.id as string | undefined;
    if (!id) return json({ error: "id is required" }, 400);

    // Delete storage folder first (we still have the id either way, but do it
    // before the row is gone so a storage failure doesn't strand a deleted row).
    const { data: objects, error: listErr } = await supabase.storage
      .from("transfer-photos")
      .list(id);
    if (!listErr && objects && objects.length > 0) {
      const paths = objects.map((o: { name: string }) => `${id}/${o.name}`);
      await supabase.storage.from("transfer-photos").remove(paths).catch(() => {});
    }

    // Hard delete the transfer row. receipts and transfer_photos have
    // `on delete cascade` on transfer_id, so they are removed automatically.
    const { error } = await supabase
      .from("transfers")
      .delete()
      .eq("id", id);
    if (error) return json({ error: "db_error", detail: error.message }, 500);

    return json({ deleted: id });
  }

  if (action === "orphaned") {
    // List all folders in storage
    const { data: folders, error: listErr } = await supabase.storage
      .from("transfer-photos")
      .list("", { limit: 1000 });
    if (listErr) return json({ error: "storage_error", detail: listErr.message }, 500);

    const folderIds = (folders ?? [])
      .filter((f: { id: string | null }) => f.id === null) // folders have null id
      .map((f: { name: string }) => f.name);

    if (folderIds.length === 0) return json({ orphaned: [] });

    // transfer.id is a uuid column — querying it with a non-uuid string errors.
    // Folders whose names aren't valid UUIDs can never match a transfer row,
    // so they are orphaned by definition; report them without a DB lookup.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidFolders = folderIds.filter((id: string) => UUID_RE.test(id));
    const nonUuidFolders = folderIds.filter((id: string) => !UUID_RE.test(id));

    let matchedSet = new Set<string>();
    if (uuidFolders.length > 0) {
      const { data: matched, error: dbErr } = await supabase
        .from("transfers")
        .select("id")
        .in("id", uuidFolders);
      if (dbErr) return json({ error: "db_error", detail: dbErr.message }, 500);
      matchedSet = new Set((matched ?? []).map((t: { id: string }) => t.id));
    }

    const orphaned = [
      ...uuidFolders.filter((id: string) => !matchedSet.has(id)),
      ...nonUuidFolders,
    ];

    return json({ orphaned });
  }

  if (action === "delete_orphan" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const folder = body.folder as string | undefined;
    if (!folder) return json({ error: "folder is required" }, 400);

    const { data: objects } = await supabase.storage
      .from("transfer-photos")
      .list(folder);
    if (objects && objects.length > 0) {
      const paths = objects.map((o: { name: string }) => `${folder}/${o.name}`);
      await supabase.storage.from("transfer-photos").remove(paths).catch(() => {});
    }

    return json({ deleted_folder: folder });
  }

  return json({ error: "unknown action" }, 400);
});
