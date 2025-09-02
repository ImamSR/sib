import { NavLink } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

export default function TopNav() {
  const base = "inline-flex items-center rounded-md px-3 py-2 text-sm font-medium";
  const active = "!bg-indigo-600 !text-white";
  const idle = "text-gray-700 hover:bg-gray-100 hover:text-gray-900";

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="text-lg font-semibold">🎓 CertChain</div>
          <span className="hidden rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 sm:inline">
            Devnet
          </span>
        </div>

        <nav className="flex items-center gap-2">
          <NavLink to="/add" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            Add
          </NavLink>
          <NavLink to="/verify" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
            Verify
          </NavLink>

          <WalletMultiButton className="!ml-2 !rounded-md !bg-indigo-600 !px-3 !py-2 !text-sm !font-medium hover:!bg-indigo-700" />
        </nav>
      </div>
    </header>
  );
}
