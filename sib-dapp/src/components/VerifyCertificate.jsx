// src/components/VerifyCertificate.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import idl from "../idl/sib.json";
import CertificateDetailsCard from "./CertificateDetailsCard.jsx";

const programID = new web3.PublicKey("HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F");
const connection = new web3.Connection("https://api.devnet.solana.com");
const LS_CAMERA_KEY = "qr_last_camera_id";

export default function VerifyCertificate() {
  const [mode, setMode] = useState("camera"); // 'camera' | 'file' | 'manual'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [scannedAddr, setScannedAddr] = useState("");

  // camera state
  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [startNonce, setStartNonce] = useState(0);

  // html5-qrcode instances
  const camQrRef = useRef(null);
  const fileQrRef = useRef(null);

  // serialize all scanner ops to avoid "already under transition"
  const opQueue = useRef(Promise.resolve());
  const runSerial = (fn) => (opQueue.current = opQueue.current.then(fn).catch(() => {}));

  const scanRegionId = "qr-region";
  const fileRegionId = "qr-file-region";

  // Anchor provider/program (read-only)
  const provider = useMemo(() => {
    const dummy = {
      publicKey: new web3.PublicKey("11111111111111111111111111111111"),
      signAllTransactions: async (txs) => txs,
      signTransaction: async (tx) => tx,
    };
    return new AnchorProvider(connection, dummy, {});
  }, []);
  const program = useMemo(() => new Program(idl, provider), [provider]);

  const ensureHttpsOrLocal = () => {
    if (typeof window === "undefined") return true;
    const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    return isLocal || window.location.protocol === "https:";
  };

  const bestBackCameraId = (devices) => {
    const lower = (s) => (s || "").toLowerCase();
    const back = devices.find((d) => /back|rear|environment/.test(lower(d.label)));
    return back?.id || devices[devices.length - 1]?.id || "";
  };

  const handleDecodedText = async (decodedText) => {
    setBusy(true);
    setError("");
    setData(null);
    setScannedAddr("");
    try {
      const pk = new web3.PublicKey(String(decodedText).trim());
      const cert = await program.account.certificate.fetch(pk);
      setScannedAddr(pk.toBase58());
      setData(cert);
    } catch (e) {
      console.error(e);
      setError("Certificate not found or invalid QR payload.");
    } finally {
      setBusy(false);
    }
  };

  // ------- enumerate cameras when entering camera mode -------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (mode !== "camera") return;

      setError("");
      setData(null);
      setScannedAddr("");

      if (!ensureHttpsOrLocal()) {
        setError("Camera requires HTTPS or http://localhost.");
        return;
      }

      try {
        const list = await Html5Qrcode.getCameras();
        if (cancelled) return;
        setCams(list || []);
        const stored = localStorage.getItem(LS_CAMERA_KEY);
        const pick =
          list.find((c) => c.id === stored)?.id ||
          bestBackCameraId(list) ||
          list[0]?.id ||
          "";
        setCamId(pick);
      } catch (e) {
        console.error("Camera enumeration failed:", e);
        setError("Unable to access cameras. Check permissions and reload.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  // ------- start/stop camera when mode or camera changes (SERIALIZED) -------
  useEffect(() => {
    if (mode !== "camera") {
      // leaving camera mode -> stop/clear
      runSerial(async () => {
        if (camQrRef.current?.isScanning) await camQrRef.current.stop();
        if (camQrRef.current) await camQrRef.current.clear();
        try { await camQrRef.current?.stop(); } catch {}
        try { await camQrRef.current?.clear(); } catch {}
        camQrRef.current = null;
        setIsRunning(false);
      });
      return;
    }
    if (!camId) return;
    if (!camId) {
        setError("No camera selected.");
        return;
      }

    let cancelled = false;

    runSerial(async () => {
      if (cancelled) return;
      // stop previous if running
      if (camQrRef.current?.isScanning) await camQrRef.current.stop();
      if (!camQrRef.current) camQrRef.current = new Html5Qrcode(scanRegionId, { verbose: false });
      try { await camQrRef.current?.stop(); } catch {}
      try { await camQrRef.current?.clear(); } catch {}
        if (!camQrRef.current) {
          camQrRef.current = new Html5Qrcode(scanRegionId, { verbose: false });
        }
      else await camQrRef.current.clear();

      // sizing
      const host = document.getElementById(scanRegionId);
      const w = host?.offsetWidth || 360;
      const h = host?.offsetHeight || 360;
      const SIDE = Math.max(220, Math.floor(Math.min(w, h) * 0.65));

      const config = {
        fps: 12,
        qrbox: 240, // slightly larger box to zoom in
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };
      const constraints = {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }],
      };

      const onSuccess = async (decodedText) => {
        // pause scanning once a code is found
        try {
          if (camQrRef.current?.isScanning) await camQrRef.current.stop();
          try { await camQrRef.current?.stop(); } catch {}
        } catch {}
        setIsRunning(false);
        await handleDecodedText(decodedText);
      };
      const onFailure = () => {}; // ignore frame errors

      localStorage.setItem(LS_CAMERA_KEY, camId);

      try {
        // primary: explicit deviceId
        await camQrRef.current.start({ deviceId: { exact: camId } }, config, onSuccess, onFailure);
      } catch {
        // fallback 1: facingMode environment
        try {
          await camQrRef.current.start({ facingMode: "environment" }, config, onSuccess, onFailure);
        } catch {
          // fallback 2: try again with deviceId (non-exact)
          await camQrRef.current.start({ deviceId: camId }, config, onSuccess, onFailure);
        }
      }
      if (!cancelled) setIsRunning(true);
    });

    return () => {
      cancelled = true;
      // stop/clear the instance used by this render
      runSerial(async () => {
        if (camQrRef.current?.isScanning) await camQrRef.current.stop();
        if (camQrRef.current) await camQrRef.current.clear();
        try { await camQrRef.current?.stop(); } catch {}
        try { await camQrRef.current?.clear(); } catch {}
        camQrRef.current = null;
        setIsRunning(false);
      });
    };
  }, [mode, camId, startNonce]);

  // ------- file mode: scan image -------
  const clearFilePreview = () =>
    runSerial(async () => {
      if (fileQrRef.current) {
        try {
          await fileQrRef.current.clear();
        } catch {}
        fileQrRef.current = null;
      }
    });

  const onFileSelected = (file) =>
    runSerial(async () => {
      if (!file) return;
      setError("");
      setData(null);
      setScannedAddr("");
      setBusy(true);

      // stop cam to avoid stream conflicts
      if (camQrRef.current?.isScanning) await camQrRef.current.stop();

      try {
        if (!fileQrRef.current) {
          fileQrRef.current = new Html5Qrcode(fileRegionId, { verbose: false });
        } else {
          try {
            await fileQrRef.current.clear();
          } catch {}
          fileQrRef.current = new Html5Qrcode(fileRegionId, { verbose: false });
        }

        let decodedText = "";
        if (typeof fileQrRef.current.scanFileV2 === "function") {
          const result = await fileQrRef.current.scanFileV2(file, {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          });
          decodedText = result?.decodedText || "";
        } else {
          decodedText = await fileQrRef.current.scanFile(file, true);
        }

        if (!decodedText) throw new Error("No QR detected.");
        await handleDecodedText(decodedText);
      } catch (e) {
        console.error("Image scan failed:", e);
        setError("Could not read a QR from this image. Try a clearer, larger QR.");
      } finally {
        setBusy(false);
      }
    });

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG/JPG).");
      return;
    }
    onFileSelected(file);
  };
  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please drop an image file (PNG/JPG).");
      return;
    }
    onFileSelected(file);
  };
  const onDragOver = (e) => e.preventDefault();

  // ------- manual verify -------
  async function verifyManual(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = String(form.get("pda") || "").trim();
    setError("");
    setData(null);
    setScannedAddr("");
    setBusy(true);
    try {
      const pubkey = new web3.PublicKey(input);
      const cert = await program.account.certificate.fetch(pubkey);
      setScannedAddr(pubkey.toBase58());
      setData(cert);
    } catch (e2) {
      console.error(e2);
      setError("Account not found or invalid address.");
    } finally {
      setBusy(false);
    }
  }

  const copyAddr = async () => {
    if (!scannedAddr) return;
    try {
      await navigator.clipboard.writeText(scannedAddr);
    } catch {}
  };
  const clearResult = () => {
    setData(null);
    setScannedAddr("");
    setError("");
  };
  const restartScan = () => setStartNonce((n) => n + 1);

  const flipCamera = () => {
    if (cams.length < 2) return;
    const idx = cams.findIndex((c) => c.id === camId);
    const next = cams[(idx + 1) % cams.length]?.id;
    if (next) setCamId(next);
  };

  // ---------- UI ----------
  return (
    <div className="mx-auto w-full max-w-2xl px-3 md:px-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">🔎 Verify Certificate</h1>
        <p className="mt-1 text-sm text-gray-600">
          Scan a QR (PDA address) by camera or image file, or paste the address to fetch on-chain data from{" "}
          <span className="font-medium">Solana Devnet</span>.
        </p>
      </div>

      {/* Segmented control */}
      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setMode("camera")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === "camera" ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          Use Camera
        </button>
        <button
          onClick={() => setMode("file")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === "file" ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          Upload Image
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === "manual" ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          Paste PDA
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {/* Camera mode */}
      {mode === "camera" && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <select
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              value={camId}
              onChange={(e) => setCamId(e.target.value)}
            >
              {cams.length === 0 && <option value="">No cameras found</option>}
              {cams.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.id}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={flipCamera}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              disabled={cams.length < 2}
              title="Flip camera"
            >
              🔄
            </button>

            {isRunning ? (
              <button
                type="button"
                onClick={() =>
                  runSerial(async () => {
                    if (camQrRef.current?.isScanning) await camQrRef.current.stop();
                    setIsRunning(false);
                  })
                }
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={restartScan}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
              >
                Start
              </button>
            )}
          </div>

          <div
            id={scanRegionId}
            className="relative overflow-hidden rounded-lg border border-gray-200 bg-black/90"
            style={{ width: "100%", minHeight: 360 }}
          >
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-[60%] w-[60%] rounded-2xl border-2 border-white/40" />
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Tip: On laptops, camera quality can be poor — try <span className="font-medium">Upload Image</span>.
          </p>
        </>
      )}

      {/* File mode */}
      {mode === "file" && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-gray-900">Upload a QR image (PNG/JPG)</label>

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="mt-2 grid place-items-center rounded-md border-2 border-dashed border-gray-300 p-6 text-center"
          >
            <input
              type="file"
              accept="image/*"
              onChange={onFileInputChange}
              className="mx-auto block w-full cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
            />
            <p className="mt-2 text-xs text-gray-500">or drag & drop an image here</p>
          </div>

          <div className="mt-4">
            <div
              id={fileRegionId}
              className="relative overflow-hidden rounded-lg border border-gray-200 bg-black/90"
              style={{ width: "100%", minHeight: 260 }}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={clearFilePreview}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Clear Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual mode */}
      {mode === "manual" && (
        <form
          onSubmit={verifyManual}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <label htmlFor="pda" className="block text-sm font-medium text-gray-900">
            Certificate Account (PDA)
          </label>
          <input
            id="pda"
            name="pda"
            placeholder="Paste PDA address, e.g. 9x5K...AbcD"
            className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:border-gray-400"
            required
          />
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              Verify
            </button>
          </div>
        </form>
      )}

      {/* Loading */}
      {busy && (
        <div className="mt-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-gray-200" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-16 rounded bg-gray-200" />
              <div className="h-16 rounded bg-gray-200" />
            </div>
            <div className="h-24 rounded bg-gray-200" />
          </div>
        </div>
      )}

      {/* Last scanned */}
      {scannedAddr && !busy && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-gray-600">
            Last address: <span className="font-mono">{scannedAddr}</span>
          </span>
          <button
            onClick={copyAddr}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 hover:bg-gray-50"
          >
            Copy
          </button>
          <button
            onClick={clearResult}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      )}

      {/* Result */}
      {data && (
        <div className="mt-6">
          <CertificateDetailsCard addr={scannedAddr} data={data} />
        </div>
      )}

      {/* Empty state */}
      {!busy && !data && !error && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
          Use <span className="font-medium">Upload Image</span> or Camera to read a QR, or paste a PDA address.
        </div>
      )}
    </div>
  );
}
