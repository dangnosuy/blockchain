// Minimal X3DH-like + symmetric (double) ratchet demo for Holder <-> Guardian
// Curve25519 via tweetnacl; HKDF + AES-GCM via WebCrypto

import * as nacl from 'tweetnacl'

export interface IdentityKeyPair {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

export interface PreKeyBundlePublic {
  ik: string
  spk: string
  sig?: string
  ts: number
  version: string
}

export interface PreKeyBundleSecret {
  ikPub: Uint8Array
  ikPriv: Uint8Array
  spkPub: Uint8Array
  spkPriv: Uint8Array
  sig?: string
  ts: number
  version: string
}

export interface SessionState {
  rootKey: Uint8Array
  sendCK: Uint8Array
  recvCK: Uint8Array
  sendN: number
  recvN: number
  established: boolean
}

// --- Helpers ---
function toHex(buf: Uint8Array): string { return '0x' + [...buf].map(b=>b.toString(16).padStart(2,'0')).join('') }
function fromHex(hex: string): Uint8Array { const h = hex.replace(/^0x/, ''); const out = new Uint8Array(h.length/2); for (let i=0;i<h.length;i+=2) out[i/2] = parseInt(h.slice(i,i+2),16); return out }

export function generateIdentity(): IdentityKeyPair {
  const kp = nacl.box.keyPair()
  return { publicKey: kp.publicKey, secretKey: kp.secretKey }
}

export function createPreKeyBundle(): PreKeyBundleSecret {
  const ik = nacl.box.keyPair()
  const spk = nacl.box.keyPair()
  return { ikPub: ik.publicKey, ikPriv: ik.secretKey, spkPub: spk.publicKey, spkPriv: spk.secretKey, ts: Date.now(), version: '1.0.0' }
}

export function exportBundlePublic(b: PreKeyBundleSecret): PreKeyBundlePublic {
  return { ik: toHex(b.ikPub), spk: toHex(b.spkPub), ts: b.ts, version: b.version, sig: b.sig }
}

async function hkdf(secret: Uint8Array, info: Uint8Array, len = 64): Promise<Uint8Array> {
  // WebCrypto HKDF requires extract+expand; using deriveBits with zero salt for demo
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveBits'])
  const params: any = { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32) as BufferSource, info: info as BufferSource }
  const bits = await crypto.subtle.deriveBits(params, key, len * 8)
  return new Uint8Array(bits)
}

export async function deriveSharedSecretInitiator(holderIK: IdentityKeyPair, guardianBundle: PreKeyBundlePublic, policyId: string): Promise<Uint8Array> {
  // Simplified: DH1 = scalarMult(holderIK.secret, guardianSPK) ; DH2 = scalarMult(holderIK.secret, guardianIK)
  const gIK = fromHex(guardianBundle.ik)
  const gSPK = fromHex(guardianBundle.spk)
  const dh1 = nacl.scalarMult(holderIK.secretKey, gSPK)
  const dh2 = nacl.scalarMult(holderIK.secretKey, gIK)
  const concat = new Uint8Array(dh1.length + dh2.length)
  concat.set(dh1,0); concat.set(dh2, dh1.length)
  const info = fromHex(policyId)
  return hkdf(concat, info, 32)
}

export async function deriveSharedSecretResponder(guardianSecret: PreKeyBundleSecret, holderIKPubHex: string, policyId: string): Promise<Uint8Array> {
  const hIK = fromHex(holderIKPubHex)
  const dh1 = nacl.scalarMult(guardianSecret.spkPriv, hIK)
  const dh2 = nacl.scalarMult(guardianSecret.ikPriv, hIK)
  const concat = new Uint8Array(dh1.length + dh2.length)
  concat.set(dh1,0); concat.set(dh2, dh1.length)
  const info = fromHex(policyId)
  return hkdf(concat, info, 32)
}

export async function initSession(sharedSecret: Uint8Array): Promise<SessionState> {
  const derived = await hkdf(sharedSecret, new TextEncoder().encode('session-root'), 64)
  const rootKey = derived.slice(0,32)
  const sendCK = derived.slice(32,48)
  const recvCK = derived.slice(48,64)
  return { rootKey, sendCK, recvCK, sendN:0, recvN:0, established: true }
}

async function nextChainKey(old: Uint8Array, label: string): Promise<Uint8Array> {
  return hkdf(old, new TextEncoder().encode(label), 16)
}

async function messageKey(chainKey: Uint8Array, counter: number): Promise<Uint8Array> {
  return hkdf(chainKey, new TextEncoder().encode('msg'+counter), 32)
}

export async function encryptWithSession(state: SessionState, plaintext: Uint8Array): Promise<{ envelope: any; session: SessionState }> {
  const mk = await messageKey(state.sendCK, state.sendN)
  // Use nacl.secretbox with 24-byte nonce (first 32 bytes of mk as key)
  const nonce = nacl.randomBytes(24)
  const key = mk.slice(0,32)
  const ct = nacl.secretbox(plaintext, nonce, key)
  const env = { ct: toHex(ct), iv: toHex(nonce), counter: state.sendN }
  state.sendN++
  state.sendCK = await nextChainKey(state.sendCK, 'send')
  return { envelope: env, session: state }
}

export async function decryptWithSession(state: SessionState, envelope: any): Promise<{ plaintext: Uint8Array; session: SessionState }> {
  const mk = await messageKey(state.recvCK, envelope.counter)
  const key = mk.slice(0,32)
  const nonce = fromHex(envelope.iv)
  const ct = fromHex(envelope.ct)
  const pt = nacl.secretbox.open(ct, nonce, key) || new Uint8Array()
  state.recvCK = await nextChainKey(state.recvCK, 'recv')
  state.recvN++
  return { plaintext: pt, session: state }
}

export function encodeText(str: string): Uint8Array { return new TextEncoder().encode(str) }
export function decodeText(buf: Uint8Array): string { return new TextDecoder().decode(buf) }
/*
  Minimal E2EE scaffolding for demo use:
  - X3DH-like key agreement (Curve25519 via tweetnacl.scalarMult) to derive a shared root key
  - Symmetric-key ratchet (HKDF-based) to derive message keys per message (simplified Double Ratchet)
  - AES-GCM for payload encryption using WebCrypto

  NOTE: This is a learning/demo scaffold, not a production-grade Signal implementation.
  It omits signatures for prekeys and DH ratchet. Next steps can upgrade to full Double Ratchet.
*/
