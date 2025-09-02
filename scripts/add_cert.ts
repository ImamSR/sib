import { AnchorProvider, Program, web3, Wallet } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import idl from "../target/idl/sib.json";

const RPC = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new web3.PublicKey("HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F");
const WALLET_PATH = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;

function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(fs.readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

(async () => {
  // 1) explicit connection
  const connection = new web3.Connection(RPC, "confirmed");

  // 2) explicit wallet from ANCHOR_WALLET
  const kp = loadKeypair(WALLET_PATH);
  const wallet = new Wallet(kp);

  // 3) provider using that connection + wallet
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl as any, provider);
  
  console.log("Using RPC:", provider.connection.rpcEndpoint);
  console.log("Using wallet:", wallet.publicKey.toBase58());

  // 4) derive PDA and send tx
  const nomor = "2025-UNI-0001";
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("cert"), Buffer.from(nomor)],
    PROGRAM_ID
  );

  const fileUri = "";
  const fileHash = new Array(32).fill(0);

  await program.methods
    .addCertificate(
      "Teknik Informatika",
      "Universitas XYZ",
      "BATCH-25",
      "NIM12345",
      "Andi Saputra",
      nomor,
      "Admin BAAK",
      fileUri,
      fileHash
    )
    .accounts({
      certificate: pda,
      operator: wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Created certificate PDA:", pda.toBase58());
})();
