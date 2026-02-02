import type { ChangeEvent } from "react";

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
};

export function TextField({
  label,
  value,
  onChange,
  required,
  placeholder,
  disabled,
}: TextFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
      {label}
      <input
        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0 disabled:bg-gray-50 disabled:text-gray-500"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}
