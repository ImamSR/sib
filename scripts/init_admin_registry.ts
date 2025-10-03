// scripts/init_admin_registry.ts
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
  const connection = new web3.Connection(RPC, "confirmed");
  const wallet = new Wallet(loadKeypair(WALLET_PATH));
  const provider = new AnchorProvider(connection, wallet, {});
  // IMPORTANT: include PROGRAM_ID here
  const program = new Program(idl as any,provider);

  const [adminPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("admin")],
    PROGRAM_ID
  );

  console.log("Admin PDA:", adminPda.toBase58());

  // super_admin is an ARGUMENT, not an account
  await program.methods
    .initAdminRegistry(wallet.publicKey) // <-- pass super_admin here
    .accounts({
      adminRegistry: adminPda,                 // <-- matches IDL
      payer: wallet.publicKey,                 // <-- matches IDL (NOT superAdmin)
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Admin registry initialized. Super admin:", wallet.publicKey.toBase58());
})();
