import { NavLink } from "react-router-dom";

export function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `depthui-chip rounded-full px-4 py-2 text-sm font-semibold transition ${
          isActive ? "depthui-chip-active text-white" : "text-[#6b6b6b] hover:text-[#1f1f1f]"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
