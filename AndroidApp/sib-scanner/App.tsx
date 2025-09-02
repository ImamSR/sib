// App.tsx
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';
(global as any).Buffer = Buffer;

import { decode as atob, encode as btoa } from 'base-64';
if (typeof (global as any).btoa === 'undefined') (global as any).btoa = btoa;
if (typeof (global as any).atob === 'undefined') (global as any).atob = atob;

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Linking,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  useColorScheme,
  Animated,
  Easing,
  ActivityIndicator,
  Share,
  Modal, // 👈 modal for full-screen result
} from 'react-native';

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { Connection, PublicKey } from '@solana/web3.js';
import { Ionicons } from '@expo/vector-icons';

import { LogBox } from 'react-native';
LogBox.ignoreLogs([
  /Attempted to import the module ".*rpc-websockets"/,
  /@noble\/hashes\/crypto\.js/,
]);

const RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F');

/* -------------------- Binary decoder for Anchor account -------------------- */
function readString(buf: Uint8Array, o: { off: number }) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (o.off + 4 > buf.length) throw new Error('Truncated string length');
  const len = dv.getUint32(o.off, true);
  o.off += 4;
  if (o.off + len > buf.length) throw new Error('Truncated string bytes');
  const bytes = buf.slice(o.off, o.off + len);
  o.off += len;
  return Buffer.from(bytes).toString('utf8');
}
function readI64(buf: Uint8Array, o: { off: number }) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (o.off + 8 > buf.length) throw new Error('Truncated i64');
  const lo = dv.getUint32(o.off, true);
  const hi = dv.getInt32(o.off + 4, true);
  o.off += 8;
  const big = (BigInt(hi) << 32n) | BigInt(lo);
  return Number(big);
}
function readPubkey(buf: Uint8Array, o: { off: number }) {
  if (o.off + 32 > buf.length) throw new Error('Truncated pubkey');
  const bytes = buf.slice(o.off, o.off + 32);
  o.off += 32;
  return new PublicKey(bytes);
}
function readU8(buf: Uint8Array, o: { off: number }) {
  if (o.off + 1 > buf.length) throw new Error('Truncated u8');
  const v = buf[o.off];
  o.off += 1;
  return v;
}
function readBytes32(buf: Uint8Array, o: { off: number }) {
  if (o.off + 32 > buf.length) throw new Error('Truncated bytes32');
  const bytes = buf.slice(o.off, o.off + 32);
  o.off += 32;
  return Array.from(bytes);
}

type DecodedCert = {
  management: string;
  operatorPubkey: string;
  operatorName: string;
  programStudi: string;
  universitas: string;
  kodeBatch: string;
  waktuMasuk: number;
  nim: string;
  nama: string;
  nomorIjazah: string;
  fileUri: string;
  fileHash: number[];
  bump: number;
};

function decodeCertificate(data: Uint8Array): DecodedCert {
  const o = { off: 0 };
  if (data.length < 8) throw new Error('Account too small');
  o.off += 8; // anchor discriminator
  const management = readPubkey(data, o).toBase58();
  const operatorPubkey = readPubkey(data, o).toBase58();
  const operatorName = readString(data, o);
  const programStudi = readString(data, o);
  const universitas = readString(data, o);
  const kodeBatch = readString(data, o);
  const waktuMasuk = readI64(data, o);
  const nim = readString(data, o);
  const nama = readString(data, o);
  const nomorIjazah = readString(data, o);
  const fileUri = readString(data, o);
  const fileHash = readBytes32(data, o);
  const bump = readU8(data, o);
  return {
    management,
    operatorPubkey,
    operatorName,
    programStudi,
    universitas,
    kodeBatch,
    waktuMasuk,
    nim,
    nama,
    nomorIjazah,
    fileUri,
    fileHash,
    bump,
  };
}

function bytesToHex(arr: number[], group = 2) {
  const hex = arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!group) return hex;
  return hex.replace(new RegExp(`(.{${group * 2}})`, 'g'), '$1 ').trim();
}

/* ---------------------------------- UI ----------------------------------- */
export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [facing, setFacing] = useState<'back' | 'front'>('back');

  const [address, setAddress] = useState('');
  const [manual, setManual] = useState('');
  const [cert, setCert] = useState<DecodedCert | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false); // 👈 result screen flag

  const connection = useMemo(() => new Connection(RPC, 'confirmed'), []);
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // animated scan line
  const scanAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [scanAnim]);

  useEffect(() => {
    (async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
    })();
  }, [permission, requestPermission]);

  const reset = useCallback(() => {
    setAddress('');
    setCert(null);
    setErr('');
    setShowResult(false); // back to scanner
  }, []);

  const fetchAccount = useCallback(
    async (pubkey: PublicKey) => {
      setAddress(pubkey.toBase58());
      setLoading(true);
      try {
        const info = await connection.getAccountInfo(pubkey, 'confirmed');
        if (!info) throw new Error('Account not found');
        if (!info.owner?.equals?.(PROGRAM_ID)) throw new Error('Account not owned by SIB program');
        const decoded = decodeCertificate(new Uint8Array(info.data));
        setCert(decoded);
        setShowResult(true); // 👈 open result screen
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    },
    [connection],
  );

  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
      if (!scanning) return;
      setScanning(false);
      setErr('');
      try {
        let pubkey: PublicKey;
        try {
          pubkey = new PublicKey((data || '').trim());
        } catch {
          throw new Error('QR is not a valid Solana address');
        }
        await fetchAccount(pubkey);
      } finally {
        setTimeout(() => setScanning(true), 800);
      }
    },
    [scanning, fetchAccount],
  );

  const pasteAndFetch = useCallback(async () => {
    const clip = (await Clipboard.getStringAsync()).trim();
    if (!clip) return;
    setManual(clip);
    try {
      const k = new PublicKey(clip);
      setErr('');
      await fetchAccount(k);
    } catch {
      setErr('Clipboard does not contain a valid Solana address');
    }
  }, [fetchAccount]);

  const openExplorer = () => {
    if (!address) return;
    Linking.openURL(`https://explorer.solana.com/address/${address}?cluster=devnet`);
  };

  const shareResult = async () => {
    if (!cert) return;
    const text = [
      `SIB Certificate`,
      `Name: ${cert.nama}`,
      `NIM: ${cert.nim}`,
      `Program: ${cert.programStudi}`,
      `Univ: ${cert.universitas}`,
      `Address: ${address}`,
      `File URI: ${cert.fileUri || '—'}`,
      `Hash: ${bytesToHex(cert.fileHash)}`,
    ].join('\n');
    try {
      await Share.share({ message: text });
    } catch {}
  };

  // Permission states
  if (!permission) {
    return (
      <View style={[styles.center, isDark && styles.darkBg]}>
        <Header isDark={isDark} />
        <Text style={[styles.h1, isDark && styles.darkText]}>SIB Scanner</Text>
        <Text style={[styles.mono, isDark && styles.darkSub]}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, isDark && styles.darkBg]}>
        <Header isDark={isDark} />
        <Text style={[styles.h1, isDark && styles.darkText]}>SIB Scanner</Text>
        <Text style={[styles.err, isDark && styles.errDark]}>Camera permission denied.</Text>
        <Text style={[styles.text, isDark && styles.darkText]}>Enable camera in settings to scan QR codes.</Text>
        <View style={{ height: 10 }} />
        <PrimaryButton onPress={() => requestPermission()} label="Grant Permission" icon="camera" />
      </View>
    );
  }

  const scanLineY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['10%', '90%'],
  });

  return (
    <View style={[styles.container, isDark && styles.darkBg]}>
      <Header isDark={isDark} />

      <View style={styles.topRow}>
        <Badge text="Devnet" color="#4f46e5" />
        <StatusPill ok={!err && (!!cert || scanning)} isDark={isDark} />
      </View>

      <Text style={[styles.h1, isDark && styles.darkText]}>🔍 Verify Certificate</Text>
      <Text style={[styles.sub, isDark && styles.darkSub]}>Scan a QR (PDA) or paste an address to fetch on-chain data.</Text>

      {/* Hide scanner completely when showing result */}
      {!showResult && (
        <>
          <View style={styles.scannerPanel}>
            <View style={styles.scannerHeader}>
              <IconButton
                icon={facing === 'back' ? 'camera-reverse' : 'camera'}
                onPress={() => setFacing((p) => (p === 'back' ? 'front' : 'back'))}
                label={facing === 'back' ? 'Rear' : 'Front'}
              />
              <IconButton
                icon={scanning ? 'pause' : 'play'}
                onPress={() => setScanning((s) => !s)}
                label={scanning ? 'Pause' : 'Resume'}
              />
            </View>

            <View style={styles.scannerWrap}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                onBarcodeScanned={scanning ? handleScan : undefined}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                facing={facing}
                zoom={0}
              />
              <View style={styles.overlay}>
                <View style={styles.frame} />
                <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]} />
              </View>
            </View>

            <ManualBox
              manual={manual}
              setManual={setManual}
              onPaste={pasteAndFetch}
              onSubmit={async () => {
                try {
                  const k = new PublicKey(manual.trim());
                  setErr('');
                  await fetchAccount(k);
                } catch {
                  setErr('Please enter a valid Solana address');
                }
              }}
              isDark={isDark}
            />
          </View>

          {address ? (
            <Row>
              <Text style={styles.label}>Address:</Text>
              <Text style={[styles.mono, isDark && styles.darkMono]} numberOfLines={1} ellipsizeMode="middle">
                {address}
              </Text>
              <GhostButton onPress={() => Clipboard.setStringAsync(address)} label="Copy" icon="copy-outline" />
              <GhostButton onPress={openExplorer} label="Explorer" icon="open-outline" />
              <GhostButton onPress={() => { setAddress(''); setCert(null); setErr(''); }} label="Clear" icon="close-circle-outline" />
            </Row>
          ) : (
            <Text style={[styles.hint, isDark && styles.darkSub]}>Point the camera at a QR code or paste an address</Text>
          )}

          {loading && (
            <View style={[styles.card, isDark && styles.cardDark]}>
              <Row style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator />
                <Text style={[styles.text, isDark && styles.darkText]}>Fetching certificate…</Text>
              </Row>
            </View>
          )}

          {!!err && (
            <View style={[styles.card, styles.cardErr]}>
              <Row style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 6 }}>
                <Ionicons name="alert-circle" size={18} color="#b91c1c" />
                <Text style={styles.err}>Error</Text>
              </Row>
              <Text style={styles.text}>{err}</Text>
            </View>
          )}
        </>
      )}

      {/* Full-screen result */}
      <Modal animationType="slide" transparent={false} visible={showResult} onRequestClose={reset}>
        <View style={[styles.resultContainer, isDark && styles.darkBg]}>
          {/* Top bar */}
          <View style={styles.resultHeader}>
            <Pressable onPress={reset} style={styles.headerIcon}>
              <Ionicons name="arrow-back" size={22} color={isDark ? '#e5e7eb' : '#111827'} />
            </Pressable>
            <Text style={[styles.resultTitle, isDark && styles.darkText]}>Certificate</Text>
            <View style={{ width: 22 }} />
          </View>

          {/* Address quick actions */}
          <View style={[styles.resultCard, isDark && styles.cardDark]}>
            <Text style={styles.label}>Address</Text>
            <Text style={[styles.mono, isDark && styles.darkMono]} numberOfLines={1} ellipsizeMode="middle">
              {address}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <GhostButton onPress={() => Clipboard.setStringAsync(address)} label="Copy" icon="copy-outline" />
              <GhostButton onPress={() => Linking.openURL(`https://explorer.solana.com/address/${address}?cluster=devnet`)} label="Explorer" icon="open-outline" />
            </View>
          </View>

          {/* Result content */}
          {cert ? (
            <ScrollView style={[styles.resultCard, isDark && styles.cardDark]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.title, isDark && styles.darkText]}>✅ Verified</Text>
                <GhostButton onPress={shareResult} label="Share" icon="share-social-outline" />
              </View>

              <Info title="Nama" value={cert.nama} />
              <Info title="NIM" value={cert.nim} />
              <Info title="Program Studi" value={cert.programStudi} />
              <Info title="Universitas" value={cert.universitas} />
              <Info title="Kode Batch" value={cert.kodeBatch} />
              <Info title="Nomor Ijazah" value={cert.nomorIjazah} />
              <Info title="Nama Operator" value={cert.operatorName} />
              <Info title="Operator Wallet" value={cert.operatorPubkey} mono copy />
              <Info title="Management Wallet" value={cert.management} mono copy />
              <Info title="Waktu Masuk" value={new Date(cert.waktuMasuk * 1000).toLocaleString()} />
              <Info title="File URI" value={cert.fileUri || '—'} link={cert.fileUri || undefined} />
              <Info title="File Hash (sha256)" value={bytesToHex(cert.fileHash, 2)} mono />
            </ScrollView>
          ) : (
            <View style={[styles.resultCard, isDark && styles.cardDark]}>
              <Text style={[styles.text, isDark && styles.darkText]}>Loading…</Text>
            </View>
          )}

          {/* Bottom actions */}
          <View style={styles.resultFooter}>
            <PrimaryButton onPress={reset} label="Scan Again" icon="scan-outline" />
          </View>
        </View>
      </Modal>

      <View style={{ height: 16 }} />
    </View>
  );
}

/* ------------------------------ Pieces ------------------------------ */

function Header({ isDark }: { isDark: boolean }) {
  return (
    <View style={styles.header}>
      <Ionicons name="shield-checkmark" size={20} color={isDark ? '#c7d2fe' : '#4f46e5'} />
      <Text style={[styles.headerTitle, isDark && styles.darkText]}>SIB Scanner</Text>
      <View style={{ flex: 1 }} />
      <Text style={[styles.build, isDark && styles.darkSub]}>Hermes · Expo</Text>
    </View>
  );
}

function StatusPill({ ok, isDark }: { ok: boolean; isDark: boolean }) {
  const color = ok ? '#10b981' : '#ef4444';
  const label = ok ? 'Ready' : 'Issue';
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color }]}>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={14} color={color} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: color + '15' }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function Row({ children, style }: React.PropsWithChildren<{ style?: any }>) {
  return <View style={[styles.row, style]}>{children}</View>;
}

function IconButton({ icon, onPress, label }: { icon: any; onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
      <Ionicons name={icon} size={18} color="#111827" />
      {!!label && <Text style={{ marginLeft: 6, color: '#111827' }}>{label}</Text>}
    </Pressable>
  );
}

function PrimaryButton({ onPress, label, icon }: { onPress: () => void; label: string; icon?: any }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
      {icon && <Ionicons name={icon} size={16} color="#fff" style={{ marginRight: 6 }} />}
      <Text style={{ color: '#fff', fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function GhostButton({ onPress, label, icon }: { onPress: () => void; label: string; icon?: any }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btnGhost, pressed && styles.pressedGhost]}>
      {icon && <Ionicons name={icon} size={16} color="#111827" style={{ marginRight: 6 }} />}
      <Text style={{ color: '#111827' }}>{label}</Text>
    </Pressable>
  );
}

function ManualBox({
  manual,
  setManual,
  onPaste,
  onSubmit,
  isDark,
}: {
  manual: string;
  setManual: (v: string) => void;
  onPaste: () => void;
  onSubmit: () => void;
  isDark: boolean;
}) {
  return (
    <View style={[styles.manualBox, isDark && styles.manualDark]}>
      <Ionicons name="qr-code-outline" size={16} color={isDark ? '#e5e7eb' : '#6b7280'} />
      <TextInput
        value={manual}
        onChangeText={setManual}
        placeholder="Paste or type PDA address"
        placeholderTextColor={isDark ? '#9ca3af' : '#9ca3af'}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, isDark && styles.inputDark]}
      />
      <GhostButton onPress={onPaste} label="Paste" icon="clipboard-outline" />
      <PrimaryButton onPress={onSubmit} label="Fetch" icon="download-outline" />
    </View>
  );
}

function Info({
  title,
  value,
  mono,
  copy,
  link,
}: {
  title: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
  link?: string;
}) {
  const onCopy = async () => copy && value && Clipboard.setStringAsync(value);
  const onOpen = () => link && Linking.openURL(link);
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{title}</Text>
      <Text style={[styles.text, mono && styles.mono]} selectable numberOfLines={mono ? 2 : undefined}>
        {value}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {copy && <GhostButton onPress={onCopy} label="Copy" icon="copy-outline" />}
        {link && <PrimaryButton onPress={onOpen} label="Open" icon="open-outline" />}
      </View>
    </View>
  );
}

/* ------------------------------ Styles ------------------------------ */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 36 : 48,
    paddingHorizontal: 16,
    backgroundColor: '#f7f7fb',
  },
  darkBg: { backgroundColor: '#0b0f19' },
  darkText: { color: '#e5e7eb' },
  darkSub: { color: '#9ca3af' },
  darkMono: { color: '#e5e7eb' },
  
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700', marginLeft: 8, color: '#111827' },
  build: { fontSize: 12, color: '#6b7280' },

  topRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },

  badge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },

  h1: { fontSize: 22, fontWeight: '700', color: '#111827', marginTop: 4 },
  sub: { marginTop: 6, fontSize: 13, color: '#6b7280' },
  hint: { marginTop: 10, fontSize: 12, color: '#6b7280' },

  scannerPanel: { marginTop: 12 },
  scannerHeader: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pressed: { opacity: 0.85 },
  pressedGhost: { backgroundColor: '#f3f4f6' },

  scannerWrap: { height: 300, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: '72%',
    height: '72%',
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(79,70,229,0.7)',
  },
  scanLine: {
    position: 'absolute',
    left: '16%',
    right: '16%',
    height: 2,
    backgroundColor: '#22d3ee',
    opacity: 0.85,
    borderRadius: 1,
  },

  row: { marginTop: 12, gap: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase' },
  text: { fontSize: 14, color: '#111827' },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), fontSize: 13, color: '#111827' },

  card: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardDark: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1f2937' },
  cardErr: { marginTop: 16, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 12, padding: 12 },

  title: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },

  btn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#4f46e5', borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  btnGhost: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
  },

  manualBox: {
    marginTop: 10,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualDark: { backgroundColor: '#0f172a', borderColor: '#1f2937' },
  input: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#f3f4f6', color: '#111827' },
  inputDark: { backgroundColor: '#111827', color: '#e5e7eb' },

  err: { color: '#b91c1c', fontWeight: '600' },
  errDark: { color: '#fecaca' },

  // Result modal styles
  resultContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 36 : 48,
    paddingHorizontal: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIcon: {
    padding: 6,
    marginRight: 8,
    borderRadius: 8,
  },
  resultTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  resultCard: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  resultFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
