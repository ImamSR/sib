/* Reusable details card for a verified certificate */
export default function CertificateDetailsCard({ addr, data }) {
  // waktuMasuk can be BN, number, or undefined
  const issuedSec = data?.waktuMasuk?.toNumber
    ? data.waktuMasuk.toNumber()
    : Number(data?.waktuMasuk ?? 0);
  const issuedStr = issuedSec ? new Date(issuedSec * 1000).toLocaleString() : "-";

  const toHex = (arr) =>
    Array.from(arr || []).map((b) => b.toString(16).padStart(2, "0")).join("");

  const toBase58 = (k) => {
    if (!k) return "";
    try {
      return typeof k === "string" ? k : k.toBase58?.() || "";
    } catch {
      return "";
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* no-op */
    }
  };

  const operatorPub = toBase58(data?.operatorPubkey) || toBase58(data?.operator);

  return (
    <div className="rounded-xl bg-white p-6 shadow-lg ring-1 ring-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-green-600 text-white">✓</span>
          <h3 className="text-lg font-semibold text-gray-900">Certificate Verified</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
            Authentic
          </span>
          {data?.fileUri && (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
              Attachment Linked
            </span>
          )}
        </div>
      </div>

      {/* Grid details */}
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Nama</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">{data?.nama}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">NIM</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">{data?.nim}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Program Studi</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">{data?.programStudi}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Universitas</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">{data?.universitas}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Kode Batch</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">{data?.kodeBatch}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Nomor Ijazah</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">{data?.nomorIjazah}</dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Nama Operator</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">
            {data?.operatorName || data?.operator_name || "-"}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Operator Wallet</dt>
          <dd className="mt-1 flex items-center gap-2 font-mono text-xs">
            <span className="break-all">{operatorPub || "-"}</span>
            {operatorPub && (
              <button
                onClick={() => copy(operatorPub)}
                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
              >
                Copy
              </button>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Issued</dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">{issuedStr}</dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Account (PDA)</dt>
          <dd className="mt-1 flex items-center gap-2 font-mono text-xs">
            <span className="break-all">{addr || "-"}</span>
            {addr && (
              <button
                onClick={() => copy(addr)}
                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
              >
                Copy
              </button>
            )}
          </dd>
        </div>

        {/* Attachment */}
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-gray-500">Ijazah File</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {data?.fileUri ? (
              <>
                <a
                  href={data.fileUri}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
                >
                  Open File
                </a>
                {Array.isArray(data.fileHash) && data.fileHash.length > 0 && (
                  <span className="font-mono text-xs text-gray-600">
                    sha256: {toHex(data.fileHash)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </dd>
        </div>
      </dl>

      {addr && (
        <div className="mt-5">
          <a
            href={`https://explorer.solana.com/address/${addr}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
          >
            View on Solana Explorer
          </a>
        </div>
      )}
    </div>
  );
}
