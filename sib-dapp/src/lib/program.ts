// src/lib/program.ts
import idl from "../idl/sib.json";
import { AnchorProvider, Program, web3 } from "@coral-xyz/anchor";

export const PROGRAM_ID = new web3.PublicKey(
  "HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F"
);
export const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");

// Wallet adapter provider (when you need to send tx)
export function getProvider(wallet: any) {
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

// Read-only provider (no wallet needed)
export function getReadOnlyProvider() {
  const dummy = {
    publicKey: new web3.PublicKey("11111111111111111111111111111111"),
    signAllTransactions: async (txs: any) => txs,
    signTransaction: async (tx: any) => tx,
  };
  return new AnchorProvider(connection, dummy, { commitment: "confirmed" });
}

export function getProgram(provider: AnchorProvider) {
  return new Program(idl as any, provider);
}

export function findAdminPda(): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync([Buffer.from("admin")], PROGRAM_ID);
}

// ✅ ADD THIS
export function findCertPda(nomorIjazah: string): [web3.PublicKey, number] {
  // seed = "cert" + nomor_ijazah (must be <= 32 bytes; trim/validate if you enforce longer inputs)
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("cert"), Buffer.from(nomorIjazah)],
    PROGRAM_ID
  );
}

// (optional helpers you might already have)
export const short = (k?: string) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "");
export const ts = (unix?: number) =>
  unix ? new Date(unix * 1000).toLocaleString() : "—";
