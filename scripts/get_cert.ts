// scripts/get_cert.ts
import { AnchorProvider, Program, web3, Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import idl from "../target/idl/sib.json";

const RPC = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new web3.PublicKey("HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F");
const WALLET_PATH = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;

function loadKeypair(path: string) {
  const secret = JSON.parse(fs.readFileSync(path, "utf-8"));
  return web3.Keypair.fromSecretKey(Uint8Array.from(secret));
}

(async () => {
  const pdaStr = process.argv[2];
  if (!pdaStr) throw new Error("Usage: ts-node scripts/get_cert.ts <PDA>");
  const pda = new web3.PublicKey(pdaStr);

  const connection = new web3.Connection(RPC, "confirmed");
  const wallet = new Wallet(loadKeypair(WALLET_PATH));
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // FIX: pass PROGRAM_ID explicitly
  const program = new Program(idl as any, provider);

  // FIX: reference the account by name
  const cert: any = await (program.account as any).certificate.fetch(pda);

  console.log("== Certificate ==");
  console.log("Nama:", cert.nama);
  console.log("NIM:", cert.nim);
  console.log("Universitas:", cert.universitas);
  console.log("Program Studi:", cert.programStudi);
  console.log("Nomor Ijazah:", cert.nomorIjazah);
  console.log("Kode Batch:", cert.kodeBatch);
  console.log("Operator:", cert.operatorName, "(", cert.operatorPubkey.toBase58(), ")");
  console.log("Waktu Masuk:", new Date(Number(cert.waktuMasuk) * 1000).toISOString());
  console.log("File URI:", cert.fileUri);
  console.log("Hash (hex):", Buffer.from(cert.fileHash).toString("hex"));
})();
