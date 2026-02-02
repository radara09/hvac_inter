import { useMemo, useState, useRef, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { AdminUser, AllowlistEntry, SiteRecord } from "../types";
import { DepthCard } from "../components/DepthUI";

type AdminUsersPageProps = {
  currentUserId?: string;
  users: AdminUser[];
  sites: SiteRecord[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onUpdate: (userId: string, body: Record<string, unknown>) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
  allowlist: AllowlistEntry[];
  allowlistLoading: boolean;
  allowlistError: string | null;
  onAllowlistRefresh: () => void;
  onAllowlistAdd: (payload: { email: string; siteId: string }) => Promise<void>;
  onAllowlistDelete: (entryId: string) => Promise<void>;
};

const EditUserModal = ({
  isOpen,
  onClose,
  onSave,
  user,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: { role?: string; password?: string; email?: string; username?: string }) => Promise<void>;
  user: AdminUser | null;
}) => {
  const [email, setEmail] = useState(user?.email ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [role, setRole] = useState(user?.role ?? "user");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      setEmail(user.email ?? "");
      setUsername(user.username ?? "");
      setRole(user.role ?? "user");
      setPassword("");
      setError(null);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const updates: { role?: string; password?: string; email?: string; username?: string } = {};
      if (role !== user.role) updates.role = role;
      if (email !== user.email) updates.email = email;
      if (username !== user.username) updates.username = username;
      if (password) updates.password = password;

      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }
      await onSave(updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-[#1f1f1f]">Edit User: {user.username || user.email}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
            Email
            <input
              type="email"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-[#1f1f1f]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
            Username
            <input
              type="text"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-[#1f1f1f]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
            Role
            <select
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-[#1f1f1f]"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="user">Technician</option>
              <option value="viewer">User</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
            Set New Password (Optional)
            <input
              type="password"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-[#1f1f1f]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 karakter (Biarkan kosong jika tetap)"
              minLength={8}
            />
          </label>

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-semibold text-[#1f1f1f] hover:bg-black/5"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-black py-2.5 text-sm font-semibold text-white hover:opacity-80 disabled:opacity-50"
            >
              {submitting ? "Simpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

const DeleteConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  userName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userName: string;
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-semibold text-[#1f1f1f]">Hapus User?</h3>
        <p className="mb-6 text-sm text-[#555]">
          Apakah Anda yakin ingin menghapus user <span className="font-semibold">{userName}</span>? Tindakan ini tidak dapat dibatalkan.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-semibold text-[#1f1f1f] hover:bg-black/5"
          >
            Batal
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Hapus
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const UserSiteSelector = ({
  user,
  sites,
  onUpdate,
}: {
  user: AdminUser;
  sites: SiteRecord[];
  onUpdate: (userId: string, body: Record<string, unknown>) => Promise<void>;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const assignedIds = user.siteIds ?? (user.siteId ? [user.siteId] : []);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      setDropdownPos({
        top: rect.bottom + scrollY,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  const toggleSite = (siteId: string) => {
    const newIds = assignedIds.includes(siteId)
      ? assignedIds.filter((id) => id !== siteId)
      : [...assignedIds, siteId];
    onUpdate(user.id, { siteIds: newIds });
  };

  const assignedNames = assignedIds
    .map((id) => sites.find((s) => s.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-w-[120px] w-full items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-1 text-left text-xs text-[#1f1f1f]"
      >
        <span className="max-w-[150px] truncate">
          {assignedIds.length > 0 ? assignedNames : "Pilih site"}
        </span>
        <span className="ml-1 text-[10px] opacity-50">▼</span>
      </button>
      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div
              className="absolute z-50 mt-1 max-h-60 w-64 overflow-y-auto rounded-xl border border-black/10 bg-white p-2 shadow-lg"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
              }}
            >
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onUpdate(user.id, { siteIds: [] });
                    setIsOpen(false);
                  }}
                  className="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                >
                  Clear All
                </button>
                {sites.map((site) => (
                  <label
                    key={site.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5"
                  >
                    <input
                      type="checkbox"
                      checked={assignedIds.includes(site.id)}
                      onChange={() => toggleSite(site.id)}
                      className="rounded border-black/20 text-black focus:ring-black/20"
                    />
                    <span className="text-sm">{site.name}</span>
                  </label>
                ))}
                {sites.length === 0 && (
                  <p className="p-2 text-center text-xs text-(--depthui-muted)">
                    Tidak ada data site.
                  </p>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
};

export function AdminUsersPage({
  currentUserId,
  users,
  sites,
  loading,
  error,
  onRefresh,
  onUpdate,
  onDelete,
  allowlist,
  allowlistLoading,
  allowlistError,
  onAllowlistRefresh,
  onAllowlistAdd,
  onAllowlistDelete,
}: AdminUsersPageProps) {
  const [allowEmail, setAllowEmail] = useState("");
  const [allowSiteId, setAllowSiteId] = useState("");
  const [submittingAllowlist, setSubmittingAllowlist] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUser | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<AdminUser | null>(null);

  const openEditModal = (user: AdminUser) => {
    setUserToEdit(user);
    setEditModalOpen(true);
  };

  const handleEditSave = async (updates: { role?: string; password?: string; email?: string; username?: string }) => {
    if (!userToEdit) return;
    await onUpdate(userToEdit.id, updates);
  };

  const confirmDeleteUser = async () => {
    if (deleteUserTarget) {
      await onDelete(deleteUserTarget.id);
      setDeleteUserTarget(null);
    }
  };

  const sortedAllowlist = useMemo(() => {
    return [...allowlist].sort((a, b) => {
      const dateA = a.createdAt ? Number(a.createdAt) : 0;
      const dateB = b.createdAt ? Number(b.createdAt) : 0;
      return dateB - dateA;
    });
  }, [allowlist]);

  const handleAllowlistSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allowEmail || !allowSiteId) return;

    setSubmittingAllowlist(true);
    try {
      await onAllowlistAdd({ email: allowEmail, siteId: allowSiteId });
      setAllowEmail("");
      setAllowSiteId("");
    } catch (submitError) {
      console.error(submitError);
    } finally {
      setSubmittingAllowlist(false);
    }
  };

  return (

    <section className="space-y-6 text-[#1f1f1f]">
      <DepthCard className="space-y-4 rounded-4xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
          <div>
            <p className="text-xs uppercase text-(--depthui-muted)">Admin</p>
            <h2 className="text-2xl font-semibold">Daftar Pengguna</h2>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-[#1f1f1f] transition hover:border-black/40 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <div className="overflow-x-auto rounded-2xl border border-black/10">
          <table className="min-w-full divide-y divide-black/10 text-left text-sm">
            <thead className="bg-black/5 text-xs uppercase text--depthui-muted)">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {users
                .filter((entry) => entry.id !== currentUserId)
                .map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3">{entry.email}</td>
                    <td className="px-4 py-3 text-[#555]">{entry.username ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-[#1f1f1f]">
                        {entry.role === "admin"
                          ? "Admin"
                          : entry.role === "viewer"
                            ? "User"
                            : "Technician"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {entry.banned ? (
                        <span className="text-rose-500">Banned</span>
                      ) : (
                        <span className="text-emerald-600">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        {entry.role !== "admin" && (
                          <UserSiteSelector user={entry} sites={sites} onUpdate={onUpdate} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(entry)}
                          className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#1f1f1f] transition hover:border-black/40"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteUserTarget(entry);
                            setIsDeleteModalOpen(true);
                          }}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!users.length && !loading && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-sm text--depthui-muted)"
                    colSpan={6}
                  >
                    Belum ada data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DepthCard>

      <DepthCard className="space-y-4 rounded-4xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
          <div>
            <p className="text-xs uppercase text-(--depthui-muted)">Admin</p>
            <h2 className="text-2xl font-semibold">Allowlist Email</h2>
          </div>
          <button
            onClick={onAllowlistRefresh}
            disabled={allowlistLoading}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-[#1f1f1f] transition hover:border-black/40 disabled:opacity-50"
          >
            {allowlistLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {allowlistError && <p className="text-sm text-rose-500">{allowlistError}</p>}
        <form
          className="grid gap-3 rounded-2xl bg-black/5 p-4 md:grid-cols-[2fr,1fr,auto]"
          onSubmit={handleAllowlistSubmit}
        >
          <label className="flex flex-col gap-1 text-sm text-(--depthui-muted)">
            Email
            <input
              type="email"
              required
              value={allowEmail}
              onChange={(event) => setAllowEmail(event.target.value)}
              className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-[#1f1f1f]"
              placeholder="teknisi@example.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-(--depthui-muted)">
            Site
            <select
              required
              value={allowSiteId}
              onChange={(event) => setAllowSiteId(event.target.value)}
              className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-[#1f1f1f]"
            >
              <option value="">Pilih site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={submittingAllowlist}
            className="self-end rounded-2xl bg-black px-6 py-2 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
          >
            {submittingAllowlist ? "Menyimpan…" : "Tambah"}
          </button>
        </form>

        <div className="overflow-x-auto rounded-2xl border border-black/10">
          <table className="min-w-full divide-y divide-black/10 text-left text-sm">
            <thead className="bg-black/5 text-xs uppercase text--depthui-muted)">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Ditambahkan</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {sortedAllowlist.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3">{entry.email}</td>
                  <td className="px-4 py-3">{entry.siteName ?? entry.siteId}</td>
                  <td className="px-4 py-3 text-sm text-[#555]">
                    {entry.createdAt
                      ? new Date(Number(entry.createdAt)).toLocaleString("id-ID")
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onAllowlistDelete(entry.id).catch(console.error)}
                      className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-200"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {!sortedAllowlist.length && !allowlistLoading && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-sm text--depthui-muted)"
                    colSpan={4}
                  >
                    Belum ada allowlist.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DepthCard>

      <EditUserModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={handleEditSave}
        user={userToEdit}
      />
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => void confirmDeleteUser()}
        userName={deleteUserTarget?.username ?? deleteUserTarget?.email ?? "User"}
      />
    </section>
  );
}
