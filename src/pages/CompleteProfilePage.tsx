import { useEffect, useState, type FormEvent } from "react";
import { DepthCard } from "../components/DepthUI";
import { LogoStack } from "../components/LogoStack";

type CompleteProfilePageProps = {
    email?: string | null;
    name?: string | null;
    suggestion: string;
    loading: boolean;
    error: string | null;
    onSubmit: (payload: { username: string; displayUsername: string }) => Promise<void>;
    onLogout: () => Promise<void>;
};

export function CompleteProfilePage({ email, name, suggestion, loading, error, onSubmit, onLogout }: CompleteProfilePageProps) {
    const [username, setUsername] = useState(suggestion);
    const [displayUsername, setDisplayUsername] = useState(suggestion);

    useEffect(() => {
        setUsername(suggestion);
        setDisplayUsername(suggestion);
    }, [suggestion]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await onSubmit({ username, displayUsername: displayUsername || username });
    };

    const heading = name ? `Halo, ${name.split(" ")[0]}!` : "Lengkapi Profil";

    return (
        <div className="depthui-shell min-h-screen px-4 py-8 text-[text(--depthui-text)]">
            <div className="mx-auto flex max-w-xl flex-col gap-8">
                <LogoStack />
                <DepthCard className="rounded-4xl p-6">
                    <p className="text-xs uppercase text-(--depthui-muted)">Lengkapi Profil</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[#1f1f1f]">{heading}</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">
                        Akun Google kamu berhasil terhubung. Pilih username untuk dashboard. Admin akan menetapkan site setelah data kamu masuk.
                    </p>
                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
                            Username
                            <input
                                className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f]"
                                value={username}
                                onChange={event => setUsername(event.target.value)}
                                required
                                minLength={3}
                                maxLength={32}
                            />
                        </label>
                        <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
                            Nama tampilan (opsional)
                            <input
                                className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f]"
                                value={displayUsername}
                                onChange={event => setDisplayUsername(event.target.value)}
                                placeholder={username}
                            />
                        </label>
                        {email && (
                            <p className="text-xs text-[#7a7a7a]">Email: {email}</p>
                        )}
                        {error && <p className="text-sm text-rose-500">{error}</p>}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-2xl bg-black px-4 py-3 text-base font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
                        >
                            {loading ? "Menyimpan…" : "Simpan Username"}
                        </button>
                    </form>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="mt-4 text-sm font-semibold text-[#1f1f1f]"
                    >
                        Keluar dari akun
                    </button>
                </DepthCard>
            </div>
        </div>
    );
}
