"use client";
import { useState } from "react";
import a from "./page.module.css";
import l from "../components/layout.module.css";

function fnUrl(name: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
}

type Transfer = {
  id: string;
  transfer_date: string;
  driver_id: string;
  plate_hr: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  photo_count: number;
};

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [orphaned, setOrphaned] = useState<string[]>([]);
  const [loadingOrphaned, setLoadingOrphaned] = useState(false);
  const [orphanedError, setOrphanedError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<string | null>(null);

  async function adminFetch(url: string, opts: RequestInit = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        "x-admin-secret": secret,
        ...(opts.body && !(opts.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  }

  async function checkAuth() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await adminFetch(`${fnUrl("admin_transfer")}?action=list&limit=1`);
      setAuthed(true);
      loadTransfers();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Greška pri prijavi");
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadTransfers() {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await adminFetch(`${fnUrl("admin_transfer")}?action=list&limit=100`);
      setTransfers(data.transfers ?? []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Greška");
    } finally {
      setLoadingList(false);
    }
  }

  async function deleteTransfer(id: string, plate: string) {
    if (!confirm(`Obriši transfer ${plate} (${id.slice(0, 8)}…)? Ova radnja se ne može poništiti.`)) return;
    try {
      await adminFetch(`${fnUrl("admin_transfer")}?action=delete`, {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      setActionMsg(`Transfer ${id.slice(0, 8)}… obrisan`);
      loadTransfers();
    } catch (err) {
      setActionMsg(`Greška: ${err instanceof Error ? err.message : "nepoznato"}`);
    }
  }

  async function loadOrphaned() {
    setLoadingOrphaned(true);
    setOrphanedError(null);
    try {
      const data = await adminFetch(`${fnUrl("admin_transfer")}?action=orphaned`);
      setOrphaned(data.orphaned ?? []);
    } catch (err) {
      setOrphanedError(err instanceof Error ? err.message : "Greška");
    } finally {
      setLoadingOrphaned(false);
    }
  }

  async function deleteOrphan(folder: string) {
    if (!confirm(`Obriši storage folder '${folder}'?`)) return;
    try {
      await adminFetch(`${fnUrl("admin_transfer")}?action=delete_orphan`, {
        method: "POST",
        body: JSON.stringify({ folder }),
      });
      setOrphaned((prev) => prev.filter((f) => f !== folder));
      setActionMsg(`Folder ${folder.slice(0, 8)}… obrisan`);
    } catch (err) {
      setActionMsg(`Greška: ${err instanceof Error ? err.message : "nepoznato"}`);
    }
  }

  if (!authed) {
    return (
      <main className={a.loginMain}>
        <div className={a.loginCard}>
          <h1 className={a.loginTitle}>Admin</h1>
          <label className={a.loginLabel}>Admin lozinka</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && checkAuth()}
            placeholder="••••••••"
            className={a.loginInput}
          />
          {authError && <p className={a.loginError}>{authError}</p>}
          <button
            onClick={checkAuth}
            disabled={authLoading || !secret}
            className={a.loginBtn}
          >
            {authLoading ? "Provjera…" : "Prijava"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={a.main}>
      <div className={l.pageShellWide}>
        <div className={a.sectionHeader}>
          <h1 className={a.sectionTitle}>Admin — Transferi</h1>
          <button onClick={loadTransfers} className={a.refreshBtn}>Osvježi</button>
        </div>

        {actionMsg && <div className={a.actionSuccess}>{actionMsg}</div>}
        {listError && <p className={a.listError}>{listError}</p>}

        {loadingList ? (
          <p className={a.loadingText}>Učitavam…</p>
        ) : (
          <div className={a.transferList}>
            {transfers.length === 0 && (
              <p className={a.emptyMsg}>Nema transfera.</p>
            )}
            {transfers.map((t, i) => (
              <div
                key={t.id}
                className={a.transferRow}
                // dynamic: background = deleted (red tint) | even (white) | odd (surface); borderBottom = last row; opacity = deleted
                style={{
                  background: t.deleted_at ? "#FEF2F2" : i % 2 === 0 ? "#FFFFFF" : "#F4F4F4",
                  borderBottom: i < transfers.length - 1 ? "1px solid #D8D8D8" : "none",
                  opacity: t.deleted_at ? 0.5 : 1,
                }}
              >
                <div className={a.transferInfo}>
                  <span className={a.transferPlate}>{t.plate_hr}</span>
                  <span className={a.transferDate}>{t.transfer_date}</span>
                  <span className={a.transferId}>{t.id.slice(0, 8)}…</span>
                </div>
                {/* dynamic: color = submitted (green) else muted */}
                <span
                  className={a.transferStatus}
                  style={{ color: t.status === "submitted" ? "#059669" : "#767676" }}
                >
                  {t.status}
                </span>
                <span className={a.transferPhotoCount}>{t.photo_count} foto</span>
                {!t.deleted_at && (
                  <button onClick={() => deleteTransfer(t.id, t.plate_hr)} className={a.deleteBtn}>
                    Obriši
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={a.orphanHeader}>
          <h2 className={a.orphanTitle}>Siročad u Storageu</h2>
          <button onClick={loadOrphaned} className={a.refreshBtn}>Provjeri</button>
        </div>
        {orphanedError && <p className={a.orphanError}>{orphanedError}</p>}
        {loadingOrphaned && <p className={a.loadingText}>Provjeravam…</p>}
        {!loadingOrphaned && orphaned.length === 0 && (
          <p className={a.loadingText}>Nema siročadi (ili još nije provjereno).</p>
        )}
        {orphaned.map((folder) => (
          <div key={folder} className={a.orphanRow}>
            <span className={a.orphanFolder}>{folder}</span>
            <button onClick={() => deleteOrphan(folder)} className={a.orphanDeleteBtn}>
              Obriši
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
