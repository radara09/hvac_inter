import type { FormEvent } from "react";
import type { SignupFormValues } from "../types";

type SignupFormProps = {
  form: SignupFormValues;
  onChange: (value: SignupFormValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function SignupForm({ form, onChange, onSubmit }: SignupFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
        Email
        <input
          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0"
          type="email"
          value={form.email}
          onChange={(event) => onChange({ ...form, email: event.target.value })}
          placeholder="pegawai@rsud.id"
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
        Username
        <input
          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0"
          value={form.username}
          onChange={(event) =>
            onChange({ ...form, username: event.target.value })
          }
          placeholder="petugas.ac"
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
        Password
        <input
          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0"
          type="password"
          value={form.password}
          onChange={(event) =>
            onChange({ ...form, password: event.target.value })
          }
          placeholder="Min 8 karakter"
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
        Konfirmasi Password
        <input
          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0"
          type="password"
          value={form.confirmPassword}
          onChange={(event) =>
            onChange({ ...form, confirmPassword: event.target.value })
          }
          placeholder="Ulangi password"
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
        Nama Lengkap (opsional)
        <input
          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder="Perawat A"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-2xl bg-black px-4 py-3 text-base font-semibold text-white transition hover:opacity-80"
      >
        Daftar Akun Baru
      </button>
    </form>
  );
}
