// src/hooks/useAdmin.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { Program, web3 } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { connection, getReadOnlyProvider, getProgram, findAdminPda } from "../lib/program";

type AdminState = {
  program: Program | null;
  adminPda: web3.PublicKey | null;
  loading: boolean;
  initialized: boolean | null;
  isAdmin: boolean;
  superAdmin: string;
  admins: string[];
  error: string;
  reload: () => Promise<void>;
};

export function useAdmin(): AdminState {
  const wallet = useWallet();

  const roProgram = useMemo(() => getProgram(getReadOnlyProvider()), []);
  const adminPda = useMemo(() => findAdminPda()[0], []);

  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [superAdmin, setSuperAdmin] = useState("");
  const [admins, setAdmins] = useState<string[]>([]);
  const [error, setError] = useState("");

  const me58 = wallet.publicKey?.toBase58() ?? "";

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!roProgram || !adminPda) {
        setInitialized(null);
        setIsAdmin(false);
        setSuperAdmin("");
        setAdmins([]);
        return;
      }

      const info = await connection.getAccountInfo(adminPda);
      if (!info) {
        setInitialized(false);
        setIsAdmin(false);
        setSuperAdmin("");
        setAdmins([]);
        return;
      }

      setInitialized(true);

      // fetch & normalize to strings
      const reg: any = (roProgram as any).account.adminRegistry
        ? await (roProgram as any).account.adminRegistry.fetch(adminPda)
        : await (roProgram as any).account["adminRegistry"].fetch(adminPda);

      const super58 = new web3.PublicKey(reg.superAdmin).toBase58();
      const list58: string[] = (reg.admins || []).map((k: any) =>
        new web3.PublicKey(k).toBase58()
      );

      setSuperAdmin(super58);
      setAdmins(list58);

      const amAdmin = !!me58 && (me58 === super58 || list58.includes(me58));
      setIsAdmin(amAdmin);

      console.debug("[useAdmin] me:", me58);
      console.debug("[useAdmin] super:", super58);
      console.debug("[useAdmin] admins:", list58);
      console.debug("[useAdmin] isAdmin:", amAdmin);
    } catch (e: any) {
      setError(e.message || String(e));
      setInitialized(null);
      setIsAdmin(false);
      setSuperAdmin("");
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  }, [roProgram, adminPda, me58]);

  useEffect(() => { reload(); }, [reload]);

  return { program: roProgram, adminPda, loading, initialized, isAdmin, superAdmin, admins, error, reload };
}
