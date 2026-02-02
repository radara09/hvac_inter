import type { ChangeEvent } from "react";

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  type?: "date" | "datetime-local";
};

export function DateField({
  label,
  value,
  onChange,
  required,
  disabled,
  type = "date",
}: DateFieldProps) {
  const inputValue = value
    ? type === "date"
      ? value.substring(0, 10)
      : value.substring(0, 16)
    : "";

  return (
    <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
      {label}
      <input
        type={type}
        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0 disabled:bg-gray-50 disabled:text-gray-500"
        value={inputValue}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const date = new Date(event.target.value);
            if (!isNaN(date.getTime())) {
                onChange(date.toISOString());
            } else {
                onChange("");
            }
        }}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}
