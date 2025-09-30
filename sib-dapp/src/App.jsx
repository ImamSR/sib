// src/App.jsx
import "@solana/wallet-adapter-react-ui/styles.css";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { Routes, Route, Navigate } from "react-router-dom";

import TopNav from "./components/TopNav.jsx";
import VerifyCertificate from "./components/VerifyCertificate.jsx";
import AdminIndex from "./pages/Admin";
import AdminList from "./pages/AdminList";
import RequireAdmin from "./routes/RequireAdmin";
const RPC = "https://api.devnet.solana.com"; // NO spaces, NO quotes issues

export default function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <div style={{ backgroundColor: 'darkslateblue', minHeight: '100vh' }}>
    <ConnectionProvider endpoint={RPC} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <TopNav />
          <Routes>
              <Route path="/" element={<Navigate to="/verify" replace />} />
              <Route path="/verify" element={<VerifyCertificate />} />
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminIndex />
                  </RequireAdmin>
                }
              />
            </Routes>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
    </div>
  );
}
