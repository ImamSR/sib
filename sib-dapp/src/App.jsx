import "@solana/wallet-adapter-react-ui/styles.css";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { Routes, Route, Navigate } from "react-router-dom";
import TopNav from "./components/TopNav.jsx";
import AddCertificate from "./components/AddCertificate.jsx";
import VerifyCertificate from "./components/VerifyCertificate.jsx";

const wallets = [new PhantomWalletAdapter()];
const RPC = "https://api.devnet.solana.com";

export default function App() {
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <TopNav />
          <div className="mx-auto max-w-6xl px-4 py-6">
            <div className="mb-4 flex justify-end">
            </div>
            <Routes>
              <Route path="/" element={<Navigate to="/add" replace />} />
              <Route path="/add" element={<AddCertificate />} />
              <Route path="/verify" element={<VerifyCertificate />} />
            </Routes>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
