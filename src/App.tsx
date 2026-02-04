import { useMemo, useState, type FormEvent } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { authClient } from "./lib/auth-client";
import { Layout } from "./components/Layout";
import { SignupForm } from "./components/SignupForm";
import { LogoStack } from "./components/LogoStack";
import { DepthCard } from "./components/DepthUI";
import { DashboardPage } from "./pages/DashboardPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { MaintenanceSearchPage } from "./pages/MaintenanceSearchPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AdminSitesPage } from "./pages/AdminSitesPage";
import { CompleteProfilePage } from "./pages/CompleteProfilePage";
import { GuestMaintenancePage } from "./pages/GuestMaintenancePage";
import { useAcRecords } from "./hooks/useAcRecords";
import { useAdminUsers } from "./hooks/useAdminUsers";
import { useAuthForms } from "./hooks/useAuthForms";
import { useSites } from "./hooks/useSites";
import { useAllowlist } from "./hooks/useAllowlist";
import { useAcTypes } from "./hooks/useAcTypes";

type ClientSession = (typeof authClient.$Infer)["Session"];
type SessionUserBase = ClientSession extends { user: infer U } ? U : never;
type SessionUser = SessionUserBase & {
  role?: string | null;
  siteId?: string | null;
  siteName?: string | null;
};

const USERNAME_PATTERN = /^(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._]+(?<![_.])$/;

const sanitizeUsernameSeed = (seed?: string | null) => {
  if (!seed) return "";
  let candidate = seed.toLowerCase().replace(/[^a-z0-9._]/g, "");
  candidate = candidate.replace(/([._]){2,}/g, "$1");
  candidate = candidate.replace(/^[._]+/, "").replace(/[._]+$/, "");
  if (!candidate) return "";
  if (candidate.length < 3) candidate = candidate.padEnd(3, "0");
  if (candidate.length > 32) candidate = candidate.slice(0, 32);
  return USERNAME_PATTERN.test(candidate) ? candidate : "";
};

const buildUsernameSuggestion = (user?: SessionUser) => {
  const seeds = [
    user?.username,
    user?.displayUsername,
    user?.email?.split("@")[0],
    user?.name?.replace(/\s+/g, ""),
    user?.id ? `user${user.id.slice(-4)} ` : undefined,
  ];
  for (const seed of seeds) {
    const normalized = sanitizeUsernameSeed(seed);
    if (normalized) {
      return normalized;
    }
  }
  return `user${Math.random().toString(36).slice(2, 8)} `;
};

function App() {
  const session = authClient.useSession();
  const user = session.data?.user as SessionUser | undefined;

  const {
    authMode,
    loginForm,
    resetLoginForm,
    resetSignUpForm,
    setAuthMode,
    setLoginForm,
    setSignUpForm,
    signUpForm,
    toggleAuthMode,
  } = useAuthForms();

  const isAdmin = useMemo(() => user?.role === "admin", [user?.role]);
  const {
    acError,
    acLoading,
    acRecords,
    clearAcRecords,
    selectAcRecord,
    selectedRecord,
    history,
    detailLoading,
    updateAcRecord,
    updateLoading,
  } = useAcRecords(user?.id);
  const {
    adminError,
    adminUsers,
    clearAdminUsers,
    loadAdminUsers,
    loadingUsers,
    updateUser,
  } = useAdminUsers(isAdmin);
  const { sites, loadingSites, siteError, createSite, updateSite, syncSite, fetchSites } =
    useSites(user?.id);
  const {
    entries: allowlistEntries,
    loading: allowlistLoading,
    error: allowlistError,
    refresh: refreshAllowlist,
    addEntry: addAllowlistEntry,
    removeEntry: removeAllowlistEntry,
  } = useAllowlist(isAdmin);
  const { acTypes, loading: loadingAcTypes, refresh: refreshAcTypes } = useAcTypes(Boolean(user));
  const [socialPending, setSocialPending] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const latestRecord = acRecords[0];
  const siteNameMap = useMemo(
    () => new Map(sites.map((site) => [site.id, site.name ?? site.id])),
    [sites]
  );
  const latestSiteName = latestRecord
    ? siteNameMap.get(latestRecord.siteId) ?? latestRecord.siteId
    : undefined;
  const userSiteName = user?.siteName ?? (user?.siteId ? siteNameMap.get(user.siteId) ?? user.siteId : undefined);
  const requiresProfile = Boolean(user && !user.username);
  const usernameSuggestion = useMemo(() => buildUsernameSuggestion(user), [user]);

  const stats = useMemo(() => {
    const bermasalah = acRecords.filter((record) => {
      const condition = record.lastCondition?.toLowerCase() ?? "";
      return (
        condition === "buruk" || condition === "cukup" || condition === "rusak"
      );
    }).length;
    const overdue = acRecords.filter((record) => {
      const ms = Date.parse(record.lastServiceAt);
      if (Number.isNaN(ms)) return false;
      const diff = Date.now() - ms;
      return diff >= 1000 * 60 * 60 * 24 * 90;
    }).length;
    const technicianCount = isAdmin
      ? adminUsers.filter((entry) => entry.role !== "admin").length
      : new Set(acRecords.map((record) => record.technician)).size;
    const lastUpdateRaw =
      latestRecord?.updatedAt ?? latestRecord?.lastServiceAt ?? null;
    const lastUpdateDisplay = lastUpdateRaw
      ? new Date(lastUpdateRaw).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      : "-";
    const lastUpdateDetail = lastUpdateRaw
      ? new Date(lastUpdateRaw).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
      : "Belum ada pembaruan";

    return [
      { label: "Total AC", value: acRecords.length, detail: "" },
      { label: "AC Bermasalah", value: bermasalah, detail: "" },
      { label: "Belum Servis >3 Bulan", value: overdue, detail: "" },
      { label: "Jumlah Teknisi", value: technicianCount, detail: "" },
      {
        label: "Terakhir Update",
        value: lastUpdateDisplay,
        detail: lastUpdateDetail,
      },
    ];
  }, [acRecords, adminUsers, isAdmin, latestRecord]);

  const [signUpError, setSignUpError] = useState<string | null>(null);

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignUpError(null);

    if (signUpForm.password !== signUpForm.confirmPassword) {
      setSignUpError("Password dan konfirmasi password tidak cocok");
      return;
    }

    const { data, error } = await authClient.signUp.email({
      email: signUpForm.email,
      password: signUpForm.password,
      name: signUpForm.name || signUpForm.username,
      username: signUpForm.username,
      displayUsername: signUpForm.displayUsername || signUpForm.username,
    });

    if (error) {
      const code = error.code as string;
      const message = error.message;

      let friendlyMessage = message || "Gagal mendaftar";
      if (code === "USERNAME_IS_TOO_SHORT") friendlyMessage = "Username terlalu pendek (min 3 karakter)";
      else if (code === "PASSWORD_TOO_SHORT") friendlyMessage = "Password terlalu pendek (min 8 karakter)";
      else if (code === "USER_ALREADY_EXISTS") friendlyMessage = "User/Email sudah terdaftar";
      else if (code === "INVALID_EMAIL") friendlyMessage = "Format email tidak valid";

      setSignUpError(friendlyMessage);
      return;
    }

    if (data) {
      resetSignUpForm();
      setAuthMode("login");
    }
  };

  const [loginError, setLoginError] = useState<string | null>(null);

  const getSafeRedirect = () => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    if (!redirect) return null;
    if (!redirect.startsWith("/")) return null;
    if (redirect.startsWith("/maintenance/") || redirect === "/maintenance") {
      return redirect;
    }
    return null;
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);

    const { error } = await authClient.signIn.username(loginForm);
    if (error) {
      setLoginError(error.message ?? "Gagal masuk");
    } else {
      resetLoginForm();
      const redirect = getSafeRedirect();
      if (redirect) {
        window.location.href = redirect;
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setSocialPending(true);
    setSocialError(null);
    try {
      const origin = window.location.origin;
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${origin}/dashboard`,
        newUserCallbackURL: `${origin}/complete-profile`,
        errorCallbackURL: origin,
      });
      if (result.error) {
        setSocialError(result.error.message ?? "Gagal masuk dengan Google");
        return;
      }
      const redirectUrl = result.data?.url;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else if (result.data?.redirect) {
        window.location.href = `${origin}/dashboard`;
      }
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : "Gagal masuk dengan Google");
    } finally {
      setSocialPending(false);
    }
  };

  const handleLogout = async () => {
    await authClient.signOut({});

    clearAdminUsers();
    clearAcRecords();
    void selectAcRecord(null);
  };
  const handleCompleteProfile = async (payload: { username: string; displayUsername: string }) => {
    setProfilePending(true);
    setProfileError(null);
    try {
      const response = await fetch("/api/profile/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Gagal menyimpan username (${response.status})`);
      }
      window.location.replace("/dashboard");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Gagal menyimpan username");
    } finally {
      setProfilePending(false);
    }
  };
  const handleUpdateUser = async (
    userId: string,
    body: Record<string, unknown>
  ) => {
    await updateUser(userId, body);
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Gagal menghapus user");
      }
      await loadAdminUsers();
    } catch (error) {
      console.error(error);
      alert("Gagal menghapus user"); // Simple feedback for now
    }
  };

  const userLabel = user
    ? user.displayUsername ?? user.username ?? user.email
    : undefined;

  const landing = (
    <div className="depthui-shell min-h-screen px-4 py-6 text-[text(--depthui-text)]">
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <header className="flex flex-col gap-4 rounded-4xl bg-transparent md:flex-row md:items-center md:justify-between">
          <LogoStack />
          <div className="depthui-card rounded-full px-6 py-2 text-md font-semibold text-[#1f1f1f] shadow-sm">
            Laporan Pekerjaan Unit AC
          </div>
        </header>

        <DepthCard className="rounded-4xl p-6 mt-32">
          <h2 className="mt-2 text-2xl font-semibold text-[#1f1f1f]">
            {authMode === "login" ? "Masuk" : "Daftar"}
          </h2>
          {authMode === "login" ? (
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
                Username
                <input
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0"
                  value={loginForm.username}
                  onChange={(event) =>
                    setLoginForm({
                      ...loginForm,
                      username: event.target.value,
                    })
                  }
                  placeholder="User"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
                Password
                <div className="relative">
                  <input
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0"
                    type={showPassword ? "text" : "password"}
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm({
                        ...loginForm,
                        password: event.target.value,
                      })
                    }
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9b9b9b] hover:text-[#1f1f1f]"
                  >
                    {showPassword ? (
                      <IconEyeOff className="h-5 w-5" />
                    ) : (
                      <IconEye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </label>
              <button
                type="submit"
                className="w-full rounded-2xl bg-black px-4 py-3 text-base font-semibold text-white transition hover:opacity-80"
              >
                Masuk ke Dashboard
              </button>
              {loginError && <p className="text-sm text-rose-500">{loginError}</p>}
              <div className="flex items-center gap-3 text-xs uppercase text-[#7a7a7a]">
                <span className="h-px flex-1 bg-black/10" />
                <span>atau</span>
                <span className="h-px flex-1 bg-black/10" />
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={socialPending}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-base font-medium text-[#1f1f1f] transition hover:border-black/40 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {socialPending ? "Menghubungkan Google…" : "Masuk dengan Google"}
              </button>
              {socialError && <p className="text-sm text-rose-500">{socialError}</p>}
            </form>
          ) : (
            <SignupForm
              form={signUpForm}
              onChange={setSignUpForm}
              onSubmit={handleRegister}
            />
          )}
          {authMode === "register" && signUpError && (
            <p className="mt-2 text-sm text-rose-500">{signUpError}</p>
          )}
          <button
            type="button"
            onClick={toggleAuthMode}
            className="mt-4 w-full text-center text-sm text-[#1f1f1f]"
          >
            {authMode === "login" ? (
              <span>
                Belum punya akun? <span className="font-semibold underline">Daftar</span>
              </span>
            ) : (
              <span>
                Sudah punya akun? <span className="font-semibold underline">Masuk</span>
              </span>
            )}
          </button>
        </DepthCard>
      </div>
    </div>
  );

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          {/* <Route path="/maintenance/:id" element={<GuestMaintenanceRedirect />} /> */}
          <Route path="/guest/maintenance/:id" element={<GuestMaintenancePage />} />
          <Route path="*" element={landing} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (requiresProfile) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path="/complete-profile"
            element={
              <CompleteProfilePage
                email={user.email}
                name={user.name}
                suggestion={usernameSuggestion}
                loading={profilePending}
                error={profileError}
                onSubmit={handleCompleteProfile}
                onLogout={handleLogout}
              />
            }
          />
          <Route path="*" element={<Navigate to="/complete-profile" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  const userSite = sites.find(s => s.id === user?.siteId);
  const siteLogoUrl = userSite?.logoUrl;

  return (
    <BrowserRouter>
      <Layout
        isAdmin={isAdmin}
        sessionPending={session.isPending}
        userLabel={userLabel}
        onLogout={handleLogout}
        siteLogoUrl={siteLogoUrl}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                stats={stats}
                latestRecord={latestRecord}
                latestSiteName={latestSiteName}
                loading={acLoading}
                error={acError}
                variant={isAdmin ? "admin" : "technician"}
                records={acRecords}
                userSiteId={user?.siteId ?? null}
                userSiteName={userSiteName}
              />
            }
          />
          <Route
            path="/maintenance"
            element={
              <MaintenanceSearchPage
                records={acRecords}
                loading={acLoading}
                error={acError}
                onSelect={selectAcRecord}
                acTypes={acTypes}
                sites={sites}
              />
            }
          />
          <Route
            path="/maintenance/:id"
            element={
              <MaintenancePage
                loading={acLoading}
                detailLoading={detailLoading}
                updateLoading={updateLoading}
                error={acError}
                userRole={user?.role}
                currentUserName={user?.displayUsername ?? user?.username ?? user?.email}
                selectedRecord={selectedRecord}
                history={history}
                onSelect={selectAcRecord}
                onUpdate={updateAcRecord}
                sites={sites}
                siteError={siteError}
                loadingSites={loadingSites}
                acTypes={acTypes}
              />
            }
          />
          <Route path="/guest/maintenance/:id" element={<GuestMaintenancePage />} />
          <Route
            path="/admin"
            element={
              isAdmin ? (
                <AdminUsersPage
                  currentUserId={user?.id}
                  users={adminUsers}
                  loading={loadingUsers}
                  error={adminError}
                  onRefresh={loadAdminUsers}
                  sites={sites}
                  onUpdate={handleUpdateUser}
                  onDelete={handleDeleteUser}
                  allowlist={allowlistEntries}
                  allowlistLoading={allowlistLoading}
                  allowlistError={allowlistError}
                  onAllowlistRefresh={refreshAllowlist}
                  onAllowlistAdd={addAllowlistEntry}
                  onAllowlistDelete={removeAllowlistEntry}
                />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            }
          />
          <Route
            path="/sites"
            element={
              isAdmin ? (
                <AdminSitesPage
                  sites={sites}
                  loading={loadingSites}
                  error={siteError}
                  onCreate={async (payload) => {
                    await createSite(payload);
                  }}
                  onUpdate={async (id, payload) => {
                    await updateSite(id, payload);
                  }}
                  onSync={syncSite}
                  acTypes={acTypes}
                  loadingAcTypes={loadingAcTypes}
                  onRefreshAcTypes={refreshAcTypes}
                  onRefreshSites={fetchSites}
                />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            }
          />
          <Route path="/complete-profile" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

function IconEye(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7c.44 0 .87-.03 1.28-.08" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
