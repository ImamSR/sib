// scripts/show_admins.ts
import { web3, Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
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
  const connection = new web3.Connection(RPC, "confirmed");
  const wallet = new Wallet(loadKeypair(WALLET_PATH));
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program(idl as any, provider);

  const [adminPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("admin")],
    PROGRAM_ID
  );

  const reg: any = await program.account.adminRegistry.fetch(adminPda);
  const count = Number(reg.count || 0);
  console.log("Admin PDA:", adminPda.toBase58());
  console.log("Super Admin:", reg.superAdmin.toBase58());
  console.log("Count:", count);
  for (let i = 0; i < count; i++) {
    console.log(`- Admin[${i}]:`, reg.admins[i].toBase58());
  }
})();