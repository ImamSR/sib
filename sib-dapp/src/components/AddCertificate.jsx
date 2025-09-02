import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import idl from "../idl/sib.json";
import { QRCodeCanvas } from "qrcode.react";
import { saveCertificateWithFile } from "../lib/SaveCertificate.js";

const programID = new web3.PublicKey("HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F");
const connection = new web3.Connection("https://api.devnet.solana.com");

const shorten = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "");
const isImage = (type) => /^image\//.test(type);

export default function AddCertificate() {
  const wallet = useWallet();

  // Provider/Program (only when wallet is present)
  const provider = useMemo(
    () => (wallet ? new AnchorProvider(connection, wallet, { commitment: "confirmed" }) : null),
    [wallet]
  );
  const program = useMemo(
    () => (provider ? new Program(idl, provider) : null),
    [provider]
  );

  const [step, setStep] = useState(0); // 0: details, 1: attachment, 2: review/success
  const [form, setForm] = useState({
    nama: "",
    nim: "",
    program_studi: "",
    universitas: "",
    kode_batch: "",
    nomor_ijazah: "",
    operator_name: "",
  });

  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState("");
  const [fileHashHex, setFileHashHex] = useState(""); // UI preview only

  const [pda, setPda] = useState(null);
  const [fileUriSaved, setFileUriSaved] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);

  // "Waktu Masuk" preview (on-chain will set real timestamp at tx time)
  const [nowPreview, setNowPreview] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNowPreview(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // PDA preview from nomor_ijazah
  const pdaPreview = useMemo(() => {
    try {
      if (!form.nomor_ijazah) return "";
      const [certPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("cert"), Buffer.from(form.nomor_ijazah)],
        programID
      );
      return certPda.toBase58();
    } catch {
      return "";
    }
  }, [form.nomor_ijazah]);
   const pdaStr = useMemo(
   () => (typeof pda === "string" ? pda : pda?.toBase58?.() || ""),
   [pda]
   );

  // simple browser-side sha256 for UI preview (helper will re-hash before upload anyway)
  async function sha256File(f) {
    const buf = await f.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const arr = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return arr;
  }

  async function onPickFile(f) {
    if (!f) {
      setFile(null);
      setFilePreview("");
      setFileHashHex("");
      return;
    }
    setFile(f);

    // Preview (images only)
    if (isImage(f.type)) {
      const reader = new FileReader();
      reader.onload = () => setFilePreview(reader.result?.toString() || "");
      reader.readAsDataURL(f);
    } else {
      setFilePreview("");
    }

    // Hash preview (non-blocking if you want, but fine inline)
    try {
      const hex = await sha256File(f);
      setFileHashHex(hex);
    } catch {
      setFileHashHex("");
    }
  }
  const onFileInput = (e) => onPickFile(e.target.files?.[0]);
  const onDrop = async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) await onPickFile(f);
  };
  const onDragOver = (e) => e.preventDefault();

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const validateStep0 = () => {
    if (!wallet?.publicKey) return "Please connect a wallet first.";
    if (!form.nama.trim()) return "Nama is required.";
    if (!/^[\w\-.\s]+$/.test(form.nim.trim())) return "NIM should be alphanumeric (., -, _ allowed).";
    if (!form.program_studi.trim()) return "Program Studi is required.";
    if (!form.universitas.trim()) return "Universitas is required.";
    if (!form.kode_batch.trim()) return "Kode Batch is required.";
    if (!form.nomor_ijazah.trim()) return "Nomor Ijazah is required.";
    if (!form.operator_name.trim()) return "Nama Operator is required.";
    return "";
  };
  const canNextFromStep0 = validateStep0() === "";

  const goNext = () => {
    if (step === 0) {
      const err = validateStep0();
      if (err) {
        setError(err);
        return;
      }
    }
    setError("");
    setStep((s) => Math.min(2, s + 1));
  };
  const goBack = () => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  // MAIN SAVE — uses helper to avoid orphan files
  async function handleSubmit() {
    setError("");
    setSuccessMsg("");
    setIsSubmitting(true);
    try {
      if (!program) throw new Error("Program not ready");

      const res = await saveCertificateWithFile({
        program,
        connection,
        wallet,
        fields: {
          program_studi: form.program_studi,
          universitas: form.universitas,
          kode_batch: form.kode_batch,
          nim: form.nim,
          nama: form.nama,
          nomor_ijazah: form.nomor_ijazah,
          operator_name: form.operator_name,
        },
        file: file && file.size ? file : null,
        uploaderEndpoint: "http://localhost:8787/upload",
      });

      setPda(res.pda);
      setFileUriSaved(res.fileUri || "");
      setSuccessMsg("Certificate saved to Solana Devnet 🎉");
      setStep(2);
    } catch (e2) {
      setError(e2.message || "Failed to save the certificate.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const copyPda = async () => {
    if (!pda) return;
    await navigator.clipboard.writeText(pda);
    setCopied(true);
    setTimeout(() => setCopied(false), 1100);
  };

  const downloadQR = () => {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector("canvas");
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `certificate-${(pdaStr || "unknown").slice(0, 8)}.png`;
    link.click();
  };

  const resetAll = () => {
    setForm({
      nama: "",
      nim: "",
      program_studi: "",
      universitas: "",
      kode_batch: "",
      nomor_ijazah: "",
      operator_name: "",
    });
    setFile(null);
    setFilePreview("");
    setFileHashHex("");
    setPda(null);
    setFileUriSaved("");
    setError("");
    setSuccessMsg("");
    setStep(0);
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">🎓 Add Academic Certificate</h1>
          <p className="mt-1 text-sm text-gray-600">
            Store a student certificate on <span className="font-medium">Solana Devnet</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
            Devnet
          </span>
        </div>
      </div>

      {/* Wallet summary */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-gray-700">
            Wallet:{" "}
            {wallet.publicKey ? (
              <span className="font-mono">{shorten(wallet.publicKey.toBase58())}</span>
            ) : (
              <span className="text-gray-500">Not connected</span>
            )}
          </div>
          <div className="text-gray-700">
            Program ID:{" "}
            <a
              className="font-mono underline decoration-dotted underline-offset-2 hover:text-indigo-700"
              href={`https://explorer.solana.com/address/${programID.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              title="View program on Solana Explorer"
            >
              {shorten(programID.toBase58())}
            </a>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="mt-6">
        <ol className="grid grid-cols-3 gap-3 text-sm">
          {["Details", "Attachment", "Review"].map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                step === i
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                  : i < step
                  ? "border-green-300 bg-green-50 text-green-700"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-xs ${
                  step === i
                    ? "bg-indigo-600 text-white"
                    : i < step
                    ? "bg-green-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <div className="mt-2 h-1 w-full rounded bg-gray-200">
          <div className="h-1 rounded bg-indigo-600 transition-all" style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
      </div>

      {/* Error / Success banners */}
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{error}</div>
        </div>
      )}
      {successMsg && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <div className="font-semibold">Success</div>
          <div className="mt-1">{successMsg}</div>
        </div>
      )}

      {/* CARD: step content */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-lg ring-1 ring-gray-200">
        {/* STEP 0: DETAILS */}
        {step === 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              goNext();
            }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Nama */}
              <div>
                <label htmlFor="nama" className="block text-sm font-medium text-gray-900">
                  Nama
                </label>
                <input
                  id="nama"
                  name="nama"
                  value={form.nama}
                  onChange={onChange}
                  placeholder="Nama lengkap"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-500">Gunakan nama sesuai ijazah.</p>
              </div>

              {/* NIM */}
              <div>
                <label htmlFor="nim" className="block text-sm font-medium text-gray-900">
                  NIM
                </label>
                <input
                  id="nim"
                  name="nim"
                  value={form.nim}
                  onChange={onChange}
                  placeholder="e.g. 21-ABC-1234"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-500">Alfanumerik, boleh titik/dash/underscore.</p>
              </div>

              {/* Program Studi */}
              <div>
                <label htmlFor="program_studi" className="block text-sm font-medium text-gray-900">
                  Program Studi
                </label>
                <input
                  id="program_studi"
                  name="program_studi"
                  value={form.program_studi}
                  onChange={onChange}
                  placeholder="Informatika / Akuntansi / ..."
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Universitas */}
              <div>
                <label htmlFor="universitas" className="block text-sm font-medium text-gray-900">
                  Universitas
                </label>
                <input
                  id="universitas"
                  name="universitas"
                  value={form.universitas}
                  onChange={onChange}
                  placeholder="Nama kampus"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Kode Batch */}
              <div>
                <label htmlFor="kode_batch" className="block text-sm font-medium text-gray-900">
                  Kode Batch
                </label>
                <input
                  id="kode_batch"
                  name="kode_batch"
                  value={form.kode_batch}
                  onChange={onChange}
                  placeholder="e.g. 2024A"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Nomor Ijazah */}
              <div>
                <label htmlFor="nomor_ijazah" className="block text-sm font-medium text-gray-900">
                  Nomor Ijazah
                </label>
                <input
                  id="nomor_ijazah"
                  name="nomor_ijazah"
                  value={form.nomor_ijazah}
                  onChange={onChange}
                  placeholder="Nomor unik di ijazah"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {pdaPreview && (
                  <p className="mt-1 text-xs text-gray-500">
                    PDA (preview): <span className="font-mono">{pdaPreview}</span>
                  </p>
                )}
              </div>

              {/* Nama Operator */}
              <div className="sm:col-span-2">
                <label htmlFor="operator_name" className="block text-sm font-medium text-gray-900">
                  Nama Operator
                </label>
                <input
                  id="operator_name"
                  name="operator_name"
                  value={form.operator_name}
                  onChange={onChange}
                  placeholder="Petugas PDDikti / Admin BAAK / ..."
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Waktu Masuk (auto by chain) */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-900">
                  Waktu Masuk (Auto)
                </label>
                <input
                  value={nowPreview.toLocaleString()}
                  readOnly
                  title="Ditentukan otomatis oleh program saat transaksi."
                  className="mt-1 block w-full cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Nilai ini akan dicap otomatis oleh program (Unix timestamp) ketika transaksi dikirim.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setForm({
                    nama: "Budi Santoso",
                    nim: "21-IF-001",
                    program_studi: "Informatika",
                    universitas: "Universitas Nusantara",
                    kode_batch: "2024A",
                    nomor_ijazah: "IJZ-2024-0001",
                    operator_name: "Admin BAAK",
                  })
                }
                className="text-sm text-gray-600 hover:text-gray-800"
                title="Fill with example data"
              >
                Fill example data
              </button>

              <button
                type="submit"
                disabled={!canNextFromStep0}
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </form>
        )}

        {/* STEP 1: ATTACHMENT */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Attachment (Optional)</h3>
              <p className="mt-1 text-sm text-gray-600">
                Attach a PDF/Image of the certificate. We’ll compute a SHA-256 hash and upload to ArLocal only
                <span className="font-semibold"> after you approve the first transaction</span>.
              </p>
            </div>

            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/40"
              onClick={() => document.getElementById("fileInputHidden")?.click()}
            >
              <input
                id="fileInputHidden"
                name="file"
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={onFileInput}
              />
              <svg className="h-8 w-8 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5" />
              </svg>
              <p className="mt-2 text-sm text-gray-700">
                Drag & drop or <span className="font-medium text-indigo-700">browse</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">PDF or image files are supported.</p>
            </div>

            {file && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="text-sm font-medium text-gray-900">Selected File</div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs uppercase text-gray-500">Name</dt>
                        <dd className="mt-0.5 break-all">{file.name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-gray-500">Type</dt>
                        <dd className="mt-0.5">{file.type || "Unknown"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-gray-500">Size</dt>
                        <dd className="mt-0.5">{(file.size / 1024).toFixed(1)} KB</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs uppercase text-gray-500">SHA-256</dt>
                        <dd className="mt-0.5 font-mono text-xs break-all">{fileHashHex || "Computing…"}</dd>
                      </div>
                    </dl>
                    <div className="mt-3">
                      <button
                        onClick={() => onPickFile(null)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded">
                    {isImage(file.type) && filePreview ? (
                      <img src={filePreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                        {file.type?.includes("pdf") ? "PDF selected" : "No image preview"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW & SUBMIT */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">Review</h3>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-xs uppercase text-gray-500">Nama</dt>
                  <dd className="mt-0.5">{form.nama}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">NIM</dt>
                  <dd className="mt-0.5">{form.nim}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">Program Studi</dt>
                  <dd className="mt-0.5">{form.program_studi}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">Universitas</dt>
                  <dd className="mt-0.5">{form.universitas}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">Kode Batch</dt>
                  <dd className="mt-0.5">{form.kode_batch}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">Nomor Ijazah</dt>
                  <dd className="mt-0.5">{form.nomor_ijazah}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">Nama Operator</dt>
                  <dd className="mt-0.5">{form.operator_name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">Waktu Masuk (Auto)</dt>
                  <dd className="mt-0.5">{nowPreview.toLocaleString()} <span className="text-gray-500">(preview)</span></dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-gray-500">PDA (Preview)</dt>
                  <dd className="mt-0.5 font-mono text-xs break-all">{pdaPreview || "-"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-gray-500">Attachment</dt>
                  <dd className="mt-0.5">
                    {file ? (
                      <div className="text-gray-800">
                        {file.name} • {(file.size / 1024).toFixed(1)} KB • {file.type || "file"}
                        {fileHashHex && (
                          <>
                            <br />
                            <span className="font-mono text-xs break-all">SHA-256: {fileHashHex}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-500">None</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {!pda && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !wallet.publicKey}
                  onClick={handleSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                  {isSubmitting ? "Saving…" : "Save to Blockchain"}
                </button>
              </div>
            )}

            {/* Success panel */}
            {pda && (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-6 shadow-lg ring-1 ring-gray-200">
                  <h3 className="text-base font-semibold text-gray-900">✅ Certificate Stored</h3>
                  <p className="mt-2 text-sm text-gray-600">PDA (account address) where the certificate is stored:</p>
                  <p className="mt-2 break-all font-mono text-sm text-gray-900">{pda}</p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={copyPda}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {copied ? "Copied!" : "Copy PDA"}
                    </button>
                    <a
                      href={`https://explorer.solana.com/address/${pda}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
                    >
                      View on Explorer
                    </a>
                    {fileUriSaved && (
                      <a
                        href={fileUriSaved}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        Open File
                      </a>
                    )}
                    <button
                      onClick={resetAll}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      New Entry
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-6 text-center shadow-lg ring-1 ring-gray-200">
                  <h3 className="text-base font-semibold text-gray-900">QR Code</h3>
                  <p className="mt-2 text-sm text-gray-600">Scan to verify on your verification page.</p>
                  <div ref={qrRef} className="inline-block bg-white p-3 rounded">
                    <QRCodeCanvas value={pdaStr} size={320} level="Q" includeMargin />
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={downloadQR}
                      className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Download PNG
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
