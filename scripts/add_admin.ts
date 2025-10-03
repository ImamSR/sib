// scripts/add_admin.ts
import { web3, Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
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
  const newAdminStr = process.argv[2];
  if (!newAdminStr) {
    throw new Error("Usage: ts-node scripts/add_admin.ts <ADMIN_PUBKEY>");
  }
  const newAdmin = new web3.PublicKey(newAdminStr);

  const connection = new web3.Connection(RPC, "confirmed");
  const wallet = new Wallet(loadKeypair(WALLET_PATH));
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program(idl as any, provider);

  const [adminPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("admin")],
    PROGRAM_ID
  );

  console.log("Using Admin PDA:", adminPda.toBase58());
  console.log("Adding admin:", newAdmin.toBase58());
  try {
    await program.methods
      .addAdmin(newAdmin)
      .accounts({
        adminRegistry: adminPda,
        superAdmin: wallet.publicKey, // your program likely checks the signer is super_admin
      })
      .rpc();

    console.log("✅ Admin added:", newAdmin.toBase58());
  } catch (e) {
    console.error("❌ Failed:", e);
  }
})();
