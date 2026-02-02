import type { HTMLAttributes, ReactNode } from "react";

type DepthCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

type DepthChipProps = HTMLAttributes<HTMLSpanElement> & {
  active?: boolean;
};

type DepthStatCardProps = {
  label: string;
  value: number | string;
  subtitle?: string;
  className?: string;
};

const baseCardClass = "depthui-card depthui-shadow-card";

export function DepthCard({ children, className = "", ...props }: DepthCardProps) {
  return (
    <div className={`${baseCardClass} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function DepthChip({ children, active, className = "", ...props }: DepthChipProps) {
  return (
    <span
      className={`depthui-chip rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "depthui-chip-active" : "text-[#6b6b6b]"
      } ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}

export function DepthStatCard({ label, value, subtitle, className = "" }: DepthStatCardProps) {
  return (
    <DepthCard className={`rounded-[26px] px-6 py-4 text-center ${className}`}>
      <p className="text-sm font-semibold text-[#6b6b6b]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#1f1f1f]">{value}</p>
      {subtitle && <p className="text-xs text-[#8c8c8c]">{subtitle}</p>}
    </DepthCard>
  );
}
