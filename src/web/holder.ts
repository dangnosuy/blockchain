/**
 * Holder Wallet Module (simplified for ZKP Social Recovery workflow)
 * - Keep VC features (optional)
 * - Stage 1: Register policy with merkleRoot (commitments from Guardians)
 * - Stage 2: Initiate recovery and finalize
 */

import { BrowserProvider, Eip1193Provider, keccak256, toUtf8Bytes, getBytes, TypedDataEncoder, Contract } from 'ethers'
import { generateIdentity, deriveSharedSecretInitiator, type IdentityKeyPair, type PreKeyBundlePublic } from './e2ee.js'

// Types
interface StoredVC {
  id: string
  raw: any
  issuer?: string
  subject?: string
  types?: string[]
  issuanceDate?: string
  createdAt: string
  issuerSigValid?: boolean
  issuerSigRecovered?: string
  issuerSigExpected?: string
}

interface AppState {
  provider: BrowserProvider | null
  account: string | null
  vcs: StoredVC[]
  selectedIds: Set<string>
  selectedClaims: Record<string, Set<string>>
  isSigning: boolean
  // recovery UI state only (no E2EE)
}

const state: AppState = {
  provider: null,
  account: null,
  vcs: [],
  selectedIds: new Set(),
  selectedClaims: {},
  isSigning: false,
  // recovery UI state only
}

// DOM - will be initialized in setup()
let connectBtn: HTMLButtonElement
let walletStatus: HTMLSpanElement
let vcInput: HTMLTextAreaElement
let saveVcBtn: HTMLButtonElement
let clearAllBtn: HTMLButtonElement
let vcList: HTMLDivElement
let signVpBtn: HTMLButtonElement
let vpOutput: HTMLPreElement
let audienceInput: HTMLInputElement
let nonceInput: HTMLInputElement
let expiryInput: HTMLInputElement
let copyVpBtn: HTMLButtonElement
let downloadVpBtn: HTMLButtonElement
let polPolicyId: HTMLInputElement
let polLabel: HTMLInputElement
let polThreshold: HTMLInputElement
let polTotal: HTMLInputElement
let polContract: HTMLInputElement
let polCommitments: HTMLTextAreaElement
let polComputeRootBtn: HTMLButtonElement
let polRegisterBtn: HTMLButtonElement
let polExportBtn: HTMLButtonElement
let polOut: HTMLPreElement
let polUpdateRootBtn: HTMLButtonElement
let polBatchId: HTMLInputElement
let hxGenIdentityBtn: HTMLButtonElement
let hxIkPubBadge: HTMLSpanElement
let hxGuardianAddress: HTMLInputElement
let hxGuardianBundle: HTMLTextAreaElement
let hxDeriveSecretBtn: HTMLButtonElement
let hxAddGuardianBtn: HTMLButtonElement
let hxExportCommitmentsBtn: HTMLButtonElement
let hxSharedSecretInput: HTMLInputElement
let hxCommitmentInput: HTMLInputElement
let hxCommitmentsList: HTMLPreElement
let recPolicyId: HTMLInputElement
let recNonce: HTMLInputElement
let recNewOwner: HTMLInputElement
let recContract: HTMLInputElement
let recComputeReqBtn: HTMLButtonElement
let recInitiateBtn: HTMLButtonElement
let recFinalizeBtn: HTMLButtonElement
let recOut: HTMLPreElement

interface GuardianDerived { address: string; sharedSecret: string; commitment: string }
let holderIdentity: IdentityKeyPair | null = null
let derivedGuardians: GuardianDerived[] = []

// Minimal Store using localStorage
const STORAGE_KEY = 'holder_vc_store_v1'

function loadStore(): StoredVC[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    return []
  } catch {
    return []
  }
}

function saveStore(vcs: StoredVC[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vcs))
}

function refreshButtons() {
  const anyClaimsSelected = Object.values(state.selectedClaims).some((s) => s && s.size > 0)
  signVpBtn.disabled = (!anyClaimsSelected) || !state.account || state.isSigning
}

function renderList() {
  vcList.innerHTML = ''
  if (!state.vcs.length) {
    const empty = document.createElement('div')
    empty.className = 'muted'
    empty.textContent = 'Chưa có VC nào được lưu.'
    vcList.appendChild(empty)
    refreshButtons()
    return
  }
  state.vcs.forEach((item) => {
    const card = document.createElement('div')
    card.className = 'card'

    const title = Array.isArray(item.types) ? item.types.join(', ') : 'VC'
    const issuer = item.issuer || (typeof item.raw?.issuer === 'string' ? item.raw.issuer : item.raw?.issuer?.id)
    const subject = item.subject || item.raw?.credentialSubject?.id || item.raw?.credentialSubject?.did

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'vc-checkbox'
    checkbox.checked = state.selectedIds.has(item.id)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedIds.add(item.id)
      else state.selectedIds.delete(item.id)
      refreshButtons()
    })

    const head = document.createElement('div')
    head.className = 'inline'
    const label = document.createElement('div')
    label.innerHTML = `<strong>${title}</strong>`
    head.appendChild(checkbox)
    head.appendChild(label)

  const meta = document.createElement('div')
  meta.className = 'muted mono'
  meta.textContent = `issuer=${issuer || 'n/a'} | subject=${subject || 'n/a'}`
  if (item.issuerSigValid !== undefined) {
    const badge = document.createElement('span')
    badge.style.display = 'inline-block'
    badge.style.marginLeft = '.5rem'
    badge.style.padding = '.25rem .55rem'
    badge.style.borderRadius = '8px'
    badge.style.fontSize = '.7rem'
    badge.style.border = '1px solid'
    badge.style.letterSpacing = '.5px'
    if (item.issuerSigValid) {
      badge.textContent = 'ISSUER SIG ✔'
      badge.style.borderColor = 'rgba(80,255,180,.55)'
      badge.style.color = '#b7ffde'
      badge.style.background = 'rgba(20,50,38,.55)'
    } else {
      badge.textContent = 'ISSUER SIG ✖'
      badge.style.borderColor = 'rgba(255,120,120,.55)'
      badge.style.color = '#ffc7c7'
      badge.style.background = 'rgba(58,18,18,.55)'
    }
    meta.appendChild(badge)
  }

    // Append head & meta first
    card.appendChild(head)
    card.appendChild(meta)

    // Claims selection if VC contains merkle salts (Merkle-based selective disclosure)
    const salts = item.raw?.merkle?.salts as Record<string, string> | undefined
  if (salts && typeof salts === 'object' && item.issuerSigValid !== false) {
      if (!state.selectedClaims[item.id]) state.selectedClaims[item.id] = new Set()
      // hide 'id' claim from selection (DID không cần tiết lộ trong phần claim)
      const keys = Object.keys(salts).filter(k => k !== 'id').sort()
      const wrapper = document.createElement('div')
      wrapper.className = 'claim-section'
      const claimTitle = document.createElement('div')
      claimTitle.className = 'claim-title'
      claimTitle.textContent = 'Chọn claim muốn tiết lộ:'
      wrapper.appendChild(claimTitle)
      const list = document.createElement('div')
      list.className = 'claim-list'
      if (keys.length === 0) {
        const none = document.createElement('div')
        none.className = 'muted'
        none.textContent = 'VC chỉ có DID trong credentialSubject. Không có claim nào khác để tiết lộ.'
        list.appendChild(none)
      } else {
        keys.forEach((k) => {
          const row = document.createElement('label')
          row.className = 'claim-row'
          const cb = document.createElement('input')
          cb.type = 'checkbox'
          cb.className = 'claim-checkbox'
          cb.checked = state.selectedClaims[item.id].has(k)
          cb.addEventListener('change', () => {
            if (cb.checked) state.selectedClaims[item.id].add(k)
            else state.selectedClaims[item.id].delete(k)
            refreshButtons()
          })
          const value = item.raw?.credentialSubject?.[k]
          const text = document.createElement('span')
          text.textContent = `${k} = ${value}`
          row.appendChild(cb)
          row.appendChild(text)
          list.appendChild(row)
        })
      }
      wrapper.appendChild(list)
      card.appendChild(wrapper)
    } else {
      const note = document.createElement('div')
      note.className = 'muted'
      note.style.fontSize = '.75rem'
      note.style.marginTop = '.5rem'
      note.textContent = item.issuerSigValid === false
        ? 'VC issuer signature không hợp lệ hoặc verify lỗi => ẩn claim selection.'
        : 'Legacy VC: không có merkleRoot/salts => không thể tiết lộ từng claim (hãy tạo lại VC Merkle).'
      card.appendChild(note)
    }

    const actions = document.createElement('div')
    actions.className = 'inline'
    actions.style.marginTop = '.5rem'
    const viewBtn = document.createElement('button')
    viewBtn.className = 'ghost'
    viewBtn.textContent = 'Xem'
    viewBtn.addEventListener('click', () => {
      vpOutput.textContent = JSON.stringify(item.raw, null, 2)
    })
    const delBtn = document.createElement('button')
    delBtn.className = 'ghost danger'
    delBtn.textContent = 'Xóa'
    delBtn.addEventListener('click', () => {
      state.vcs = state.vcs.filter((v) => v.id !== item.id)
      state.selectedIds.delete(item.id)
      saveStore(state.vcs)
      renderList()
    })
    actions.appendChild(viewBtn)
    actions.appendChild(delBtn)
    card.appendChild(actions)

    vcList.appendChild(card)
  })
  refreshButtons()
}

// No channels rendering in new workflow

// Removed relay/E2EE – using off-chain manual share per workflow

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
}

function setVpOutput(text: string) {
  vpOutput.textContent = text
}

// Wallet
async function connectWallet() {
  const eth = (window as any).ethereum as Eip1193Provider | undefined
  if (!eth) {
    alert('Không tìm thấy ví. Hãy cài MetaMask.')
    return
  }
  try {
    connectBtn.disabled = true
    connectBtn.textContent = 'Đang kết nối...'
    state.provider = new BrowserProvider(eth, 'any')
    const accounts = await state.provider.send('eth_requestAccounts', [])
    state.account = accounts?.[0]?.toLowerCase() || null
    if (state.account) {
      const net = await state.provider.getNetwork()
      const short = `${state.account.slice(0,6)}...${state.account.slice(-4)}`
      walletStatus.textContent = `Connected ${short} · chain ${Number(net.chainId)}`
      walletStatus.classList.remove('warn')
      walletStatus.classList.add('ok')
      connectBtn.textContent = 'Đã kết nối'
      connectBtn.disabled = true
    } else {
      walletStatus.textContent = 'Chưa kết nối'
      walletStatus.classList.remove('ok')
      walletStatus.classList.add('warn')
      connectBtn.textContent = 'Connect Wallet'
      connectBtn.disabled = false
    }
    refreshButtons()
  } catch (e) {
    console.error(e)
    alert('Không thể kết nối ví.')
    walletStatus.textContent = 'Chưa kết nối'
    walletStatus.classList.remove('ok')
    walletStatus.classList.add('warn')
    connectBtn.textContent = 'Connect Wallet'
    connectBtn.disabled = false
  }
}

// Import VC
function parseJSONsafe(input: string) {
  try { return JSON.parse(input) } catch { return null }
}

function normalizeStored(vc: any): StoredVC {
  const id = genId()
  const types = Array.isArray(vc?.type) ? vc.type : (typeof vc?.type === 'string' ? [vc.type] : [])
  const issuer = typeof vc?.issuer === 'string' ? vc.issuer : vc?.issuer?.id
  const subject = vc?.credentialSubject?.id || vc?.credentialSubject?.did
  const issuanceDate = vc?.issuanceDate
  let issuerSigValid: boolean | undefined
  let issuerSigRecovered: string | undefined
  let issuerSigExpected: string | undefined
  try {
    const proof = vc?.proof
    if (proof?.type === 'EthereumEip712Signature2021' && proof?.eip712?.primaryType) {
      const domain = proof.eip712.domain
      const typesDef = proof.eip712.types
      const primary = proof.eip712.primaryType
      const sig = proof.proofValue
      if (domain && typesDef && primary && sig && (window as any).ethers?.verifyTypedData) {
        const message = primary === 'VerifiableCredentialRoot'
          ? {
              issuer: issuer,
              issuanceDate: vc.issuanceDate,
              holder: vc.holder || vc.credentialSubject?.id || vc.credentialSubject?.did || '',
              merkleRoot: proof.merkleRoot,
              algo: proof.hashAlgorithm || 'keccak256',
            }
          : {
              issuer: issuer,
              issuanceDate: vc.issuanceDate,
              holder: vc.holder || vc.credentialSubject?.id || vc.credentialSubject?.did || '',
              credentialSubject: vc.credentialSubject || {},
            }
        issuerSigRecovered = (window as any).ethers.verifyTypedData(domain, typesDef, message, sig).toLowerCase()
        issuerSigExpected = (issuer || '').split(':').pop()?.toLowerCase()
        issuerSigValid = !!issuerSigRecovered && !!issuerSigExpected && issuerSigRecovered === issuerSigExpected
      }
    }
  } catch (e) {
    issuerSigValid = false
  }
  return { id, raw: vc, issuer, subject, types, issuanceDate, createdAt: new Date().toISOString(), issuerSigValid, issuerSigRecovered, issuerSigExpected }
}

function handleSaveVC() {
  const raw = vcInput.value.trim()
  if (!raw) { alert('Dán VC JSON trước.'); return }
  const json = parseJSONsafe(raw)
  if (!json) { alert('VC không phải JSON hợp lệ.'); return }
  // Minimal checks
  if (!json['@context'] || !json.proof) {
    if (!confirm('VC thiếu @context hoặc proof. Vẫn lưu?')) return
  }
  const item = normalizeStored(json)
  state.vcs.unshift(item)
  saveStore(state.vcs)
  vcInput.value = ''
  renderList()
}

function handleClearAll() {
  if (!confirm('Xóa tất cả VC đã lưu?')) return
  state.vcs = []
  state.selectedIds.clear()
  saveStore(state.vcs)
  renderList()
}

// Build & Sign VP (EIP-712)
function canonicalize(obj: any): string {
  // Simple canonicalization via JSON stringify with stable order
  // NOTE: For demo; production should use a proper canonicalizer
  return JSON.stringify(obj, Object.keys(obj).sort())
}

// Merkle helpers matching Issuer
function stableLeafPayload(k: string, v: any, salt: string) {
  // Encode exactly like Issuer: JSON.stringify({k,v,salt}) and hash utf8 bytes
  return JSON.stringify({ k, v, salt })
}
function leafHash(k: string, v: any, salt: string) {
  return keccak256(toUtf8Bytes(stableLeafPayload(k, v, salt)))
}
function hashPair(a: string, b: string) {
  // Same as Issuer: keccak256( left_bytes || right_bytes )
  const A = getBytes(a)
  const B = getBytes(b)
  const merged = new Uint8Array(A.length + B.length)
  merged.set(A, 0)
  merged.set(B, A.length)
  return keccak256(merged)
}
type Sibling = { hash: string; position: 'left' | 'right' }
function buildMerkleProofForVC(vc: any, claimKey: string): { root: string; proof: Sibling[]; value: any; salt: string, _debug?: any } | null {
  const salts: Record<string, string> | undefined = vc?.merkle?.salts
  const subject = vc?.credentialSubject || {}
  if (!salts || !salts[claimKey]) return null
  const getValue = (k: string) => {
    const val = subject?.[k]
    if (val === undefined) {
      // Fallback only for id if legacy VC structure, but prefer credentialSubject values
      if (k === 'id' && vc?.holder) return vc.holder
      console.warn('Missing claim value in credentialSubject for key', k)
    }
    return val
  }
  const keys = Object.keys(salts).sort()
  const leaves = keys.map((k) => leafHash(k, getValue(k), salts[k]))
  let idx = keys.indexOf(claimKey)
  if (idx < 0) return null
  const proof: Sibling[] = []
  let level = leaves.slice()
  const debugLevels: string[][] = [level.slice()]
  while (level.length > 1) {
    const isRightNode = idx % 2 === 1
    const pairIndex = isRightNode ? idx - 1 : idx + 1
    const left = isRightNode ? level[idx - 1] : level[idx]
    const right = isRightNode ? level[idx] : (level[pairIndex] ?? level[idx])
    if (isRightNode) {
      proof.push({ hash: left, position: 'left' })
    } else {
      proof.push({ hash: right, position: 'right' })
    }
    // build next level
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2) {
      const L = level[i]
      const R = level[i + 1] ?? level[i]
      next.push(hashPair(L, R))
    }
    level = next
    debugLevels.push(level.slice())
    idx = Math.floor(idx / 2)
  }
  const root = level[0]
  return { root, proof, value: getValue(claimKey), salt: salts[claimKey], _debug: { keys, leaves, levels: debugLevels } }
}

// RecoveryContract ABI (subset)
const RECOVERY_ABI = [
  {
    type: 'function', name: 'registerPolicy', stateMutability: 'nonpayable',
    inputs: [ {name:'policyId',type:'bytes32'}, {name:'threshold',type:'uint256'}, {name:'totalGuardians',type:'uint256'} ], outputs: []
  },
  { type: 'function', name: 'registerCommitmentBatch', stateMutability:'nonpayable', inputs:[ {name:'policyId',type:'bytes32'},{name:'merkleRoot',type:'bytes32'},{name:'batchId',type:'bytes32'} ], outputs: [] },
  {
    type: 'function', name: 'initiateRecovery', stateMutability: 'nonpayable',
    inputs: [ {name:'policyId',type:'bytes32'}, {name:'recoveryRequestID',type:'bytes32'}, {name:'newOwner',type:'address'} ], outputs: []
  },
  {
    type: 'function', name: 'finalizeRecovery', stateMutability: 'nonpayable',
    inputs: [ {name:'policyId',type:'bytes32'}, {name:'recoveryRequestID',type:'bytes32'} ], outputs: []
  },
]

// Merkle for guardian addresses (leaf = keccak256(abi.encodePacked(address)))
function merkleRootFromLeaves(leaves: string[]): string {
  if (leaves.length === 0) return '0x' + '00'.repeat(32)
  let level = leaves.slice()
  while (level.length > 1) {
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2) {
      const L = level[i]
      const R = level[i + 1] ?? level[i]
      const A = getBytes(L)
      const B = getBytes(R)
      const merged = new Uint8Array(A.length + B.length)
      merged.set(A, 0)
      merged.set(B, A.length)
      next.push(keccak256(merged))
    }
    level = next
  }
  return level[0]
}

function parseCommitments(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  try { const arr = JSON.parse(t); if (Array.isArray(arr)) return arr } catch {}
  return []
}

function ensureBytes32(x: string) { return /^0x[0-9a-fA-F]{64}$/.test(x.trim()) }

function computePolicyIdIfEmpty(): string {
  const cur = polPolicyId.value.trim()
  if (ensureBytes32(cur)) return cur
  const lbl = polLabel.value.trim()
  if (!lbl) return ''
  return keccak256(toUtf8Bytes(lbl))
}

function handleComputeRoot() {
  const commits = parseCommitments(polCommitments.value)
  if (!commits.length) { polOut.textContent = 'Chưa có commitments'; return }
  const root = merkleRootFromLeaves(commits)
  const pid = computePolicyIdIfEmpty()
  polOut.textContent = `policyId=${pid || '(chưa có)'}\nmerkleRoot=${root}\ncount=${commits.length}`
}

async function handleRegisterPolicy() {
  try {
    if (!state.provider || !state.account) { alert('Kết nối ví trước'); return }
    const contractAddr = polContract.value.trim()
    let policyIdHex = polPolicyId.value.trim()
    const threshold = Number(polThreshold.value || '0')
    const total = Number(polTotal.value || '0')
    const commits = parseCommitments(polCommitments.value)
    if (!contractAddr || !threshold || !total) { alert('Nhập contract, threshold và tổng số guardians'); return }
    if (!ensureBytes32(policyIdHex)) {
      policyIdHex = computePolicyIdIfEmpty()
      if (!ensureBytes32(policyIdHex)) { alert('policyId không hợp lệ; nhập 0x.. hoặc điền label để tự tạo'); return }
      polPolicyId.value = policyIdHex
    }
    const signer = await state.provider.getSigner()
    const rec = new Contract(contractAddr, RECOVERY_ABI as any, signer)
    polOut.textContent = 'Sending transaction...'
    const tx = await (rec as any).registerPolicy(policyIdHex, BigInt(threshold), BigInt(total))
    polOut.textContent = 'Pending: ' + tx.hash
    await tx.wait()
    polOut.textContent = `Success tx=${tx.hash}\npolicyId=${policyIdHex}\nthreshold=${threshold}\ntotal=${total}`
  } catch (e: any) {
    polOut.textContent = 'Error: ' + (e.message || String(e))
  }
}

async function handleUpdateRootBatch() {
  try {
    if (!state.provider || !state.account) { alert('Kết nối ví trước'); return }
    const contractAddr = polContract.value.trim()
    let policyIdHex = polPolicyId.value.trim()
    const commits = parseCommitments(polCommitments.value)
    if (!contractAddr || !commits.length) { alert('Nhập contract và commitments để tính root'); return }
    if (!ensureBytes32(policyIdHex)) {
      policyIdHex = computePolicyIdIfEmpty()
      if (!ensureBytes32(policyIdHex)) { alert('policyId không hợp lệ; nhập 0x.. hoặc điền label để tự tạo'); return }
      polPolicyId.value = policyIdHex
    }
    const root = merkleRootFromLeaves(commits)
    let batchId = polBatchId.value.trim()
    if (!ensureBytes32(batchId)) {
      // default batchId = keccak256(root || count)
      const payload = JSON.stringify({ root, n: commits.length })
      batchId = keccak256(toUtf8Bytes(payload))
      polBatchId.value = batchId
    }
    const signer = await state.provider.getSigner()
    const rec = new Contract(contractAddr, RECOVERY_ABI as any, signer)
    polOut.textContent += `\nUpdating Root...`
    const tx = await (rec as any).registerCommitmentBatch(policyIdHex, root, batchId)
    polOut.textContent += `\nPending: ${tx.hash}`
    await tx.wait()
    polOut.textContent += `\nRootUpdated tx=${tx.hash}\nroot=${root}\nbatchId=${batchId}`
  } catch (e:any) {
    polOut.textContent = 'Error: ' + (e.message || String(e))
  }
}

function refreshCommitmentsList() {
  hxCommitmentsList.textContent = JSON.stringify(derivedGuardians.map(g=>g.commitment), null, 2)
}

function handleGenerateIdentity() {
  holderIdentity = generateIdentity()
  // Convert Uint8Array to hex string (browser-compatible)
  const hexStr = Array.from(holderIdentity.publicKey).map(b => b.toString(16).padStart(2,'0')).join('')
  hxIkPubBadge.textContent = 'IK: ' + hexStr.slice(0,16) + '...'
  hxIkPubBadge.classList.remove('warn'); hxIkPubBadge.classList.add('ok')
}

function parseGuardianBundle(raw: string): PreKeyBundlePublic | null {
  try { const j = JSON.parse(raw.trim()); if (j.ik && j.spk) return j } catch {}
  return null
}

async function handleDeriveSecret() {
  if (!holderIdentity) { alert('Tạo Holder Identity trước'); return }
  const addr = hxGuardianAddress.value.trim().toLowerCase()
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { alert('Địa chỉ Guardian không hợp lệ'); return }
  const bundle = parseGuardianBundle(hxGuardianBundle.value)
  if (!bundle) { alert('Bundle JSON không hợp lệ'); return }
  
  // policyId: nếu đã có thì dùng, nếu không có thì tạo tạm thời từ timestamp
  let policyIdHex = polPolicyId.value.trim()
  if (!ensureBytes32(policyIdHex)) {
    policyIdHex = computePolicyIdIfEmpty();
    if (!ensureBytes32(policyIdHex)) {
      // Tạo policyId tạm thời từ timestamp + random
      const tempId = keccak256(toUtf8Bytes(`temp_policy_${Date.now()}_${Math.random()}`))
      policyIdHex = tempId
      polPolicyId.value = tempId
      console.log('Tạo policyId tạm thời:', tempId)
    } else {
      polPolicyId.value = policyIdHex
    }
  }
  
  const secretBytes = await deriveSharedSecretInitiator(holderIdentity, bundle, policyIdHex)
  const secretHex = '0x' + [...secretBytes].map(b=>b.toString(16).padStart(2,'0')).join('')
  hxSharedSecretInput.value = secretHex
  // commitment = keccak256(address, secret)
  // Merge address bytes + secret bytes
  const addrPacked = getBytes(addr)
  const secPacked = getBytes(secretHex)
  const merged = new Uint8Array(addrPacked.length + secPacked.length)
  merged.set(addrPacked,0); merged.set(secPacked, addrPacked.length)
  const finalCommitment = keccak256(merged)
  hxCommitmentInput.value = finalCommitment
}

function handleAddGuardian() {
  const addr = hxGuardianAddress.value.trim().toLowerCase()
  const secret = hxSharedSecretInput.value.trim()
  const commitment = hxCommitmentInput.value.trim()
  if (!addr || !secret || !commitment) { alert('Chưa derive secret'); return }
  if (derivedGuardians.find(g=>g.address===addr)) { alert('Guardian đã tồn tại'); return }
  derivedGuardians.push({ address: addr, sharedSecret: secret, commitment })
  refreshCommitmentsList()
  hxGuardianAddress.value=''; hxGuardianBundle.value=''; hxSharedSecretInput.value=''; hxCommitmentInput.value=''
}

function handleExportCommitments() {
  const commits = derivedGuardians.map(g=>g.commitment)
  const blob = new Blob([JSON.stringify(commits, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download='commitments.json'; a.click(); URL.revokeObjectURL(url)
  // auto fill vào phần thiết lập
  polCommitments.value = JSON.stringify(commits, null, 2)
}

async function signVP() {
  if (!state.provider || !state.account) return
  const anyClaimsSelected = Object.values(state.selectedClaims).some((s) => s && s.size > 0)
  if (!anyClaimsSelected) return
  try {
    state.isSigning = true
    refreshButtons()

    const selectedVCs = state.vcs.filter((v) => (state.selectedClaims[v.id]?.size || 0) > 0)
    const vcHeaders: any[] = []
    const vcRoots: string[] = []
    const merkleProofs: any[] = []

    for (const st of selectedVCs) {
      const raw = st.raw
      const root = raw?.proof?.merkleRoot
      const salts = raw?.merkle?.salts
      if (!root || !salts) throw new Error('VC không có merkleRoot hoặc salts')
      const header = {
        '@context': raw['@context'],
        type: raw.type,
        issuer: raw.issuer,
        issuanceDate: raw.issuanceDate,
        holder: raw.holder,
        merkle: { algorithm: raw?.merkle?.algorithm, leafEncoding: raw?.merkle?.leafEncoding },
        proof: raw.proof,
      }
      vcHeaders.push(header)
      vcRoots.push(root)
      const keys = Array.from(state.selectedClaims[st.id] || [])
      for (const key of keys) {
        const res = buildMerkleProofForVC(raw, key)
        if (!res) throw new Error(`Không thể tạo proof cho claim ${key}`)
        if (res.root.toLowerCase() !== root.toLowerCase()) {
          console.warn('Merkle mismatch debug', {
            key,
            computedRoot: res.root,
            vcRoot: root,
            debug: res?._debug,
            vcSalts: raw?.merkle?.salts,
            subject: raw?.credentialSubject,
          })
          throw new Error(`Merkle root mismatch for '${key}'`)
        }
        merkleProofs.push({
          vcIndex: vcHeaders.length - 1,
          key,
          value: res.value,
          salt: res.salt,
          siblings: res.proof,
        })
      }
    }

    const network = await state.provider.getNetwork()
    const chainId = Number(network.chainId)
    const signer = await state.provider.getSigner()

    const holderDid = `did:ethr:${network.name === 'unknown' ? 'sepolia' : network.name}:${state.account}`

    const domain = { name: 'VerifiablePresentation', version: '1', chainId }
    const types = {
      VP: [
        { name: 'holder', type: 'string' },
        { name: 'aud', type: 'string' },
        { name: 'nonce', type: 'string' },
        { name: 'exp', type: 'string' },
        { name: 'vcRoots', type: 'bytes32[]' },
      ],
    } as const

    const message = {
      holder: holderDid,
      aud: audienceInput.value.trim() || '',
      nonce: nonceInput.value.trim() || '',
      exp: expiryInput.value.trim() || '',
      vcRoots,
    }

    const signature = await (signer as any).signTypedData(domain, types as any, message)
    // Holder address (Ethereum) for explicit inclusion in VP proof
    let holderAddress: string | undefined
    try { holderAddress = (await signer.getAddress()).toLowerCase() } catch {}

    const vp = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: holderDid,
      verifiableCredential: vcHeaders,
      merkleProofs,
      proof: {
        type: 'EthereumEip712Signature2021',
        created: new Date().toISOString(),
        proofPurpose: 'authentication',
        verificationMethod: `${holderDid}#controller`,
        eip712: { domain, types, primaryType: 'VP' },
        proofValue: signature,
  holderAddress,
        metadata: { aud: message.aud, nonce: message.nonce, exp: message.exp, vcRoots },
      },
    }

    setVpOutput(JSON.stringify(vp, null, 2))
  } catch (e: any) {
    console.error(e)
    setVpOutput(`Lỗi tạo VP: ${e.message || String(e)}`)
  } finally {
    state.isSigning = false
    refreshButtons()
  }
}

function setup() {
  // Initialize DOM elements
  connectBtn = document.getElementById('connectBtn') as HTMLButtonElement
  walletStatus = document.getElementById('walletStatus') as HTMLSpanElement
  vcInput = document.getElementById('vcInput') as HTMLTextAreaElement
  saveVcBtn = document.getElementById('saveVcBtn') as HTMLButtonElement
  clearAllBtn = document.getElementById('clearAllBtn') as HTMLButtonElement
  vcList = document.getElementById('vcList') as HTMLDivElement
  signVpBtn = document.getElementById('signVpBtn') as HTMLButtonElement
  vpOutput = document.getElementById('vpOutput') as HTMLPreElement
  audienceInput = document.getElementById('audience') as HTMLInputElement
  nonceInput = document.getElementById('nonce') as HTMLInputElement
  expiryInput = document.getElementById('expiry') as HTMLInputElement
  copyVpBtn = document.getElementById('copyVpBtn') as HTMLButtonElement
  downloadVpBtn = document.getElementById('downloadVpBtn') as HTMLButtonElement
  polPolicyId = document.getElementById('polPolicyId') as HTMLInputElement
  polLabel = document.getElementById('polLabel') as HTMLInputElement
  polThreshold = document.getElementById('polThreshold') as HTMLInputElement
  polTotal = document.getElementById('polTotal') as HTMLInputElement
  polContract = document.getElementById('polContract') as HTMLInputElement
  polCommitments = document.getElementById('polCommitments') as HTMLTextAreaElement
  polComputeRootBtn = document.getElementById('polComputeRoot') as HTMLButtonElement
  polRegisterBtn = document.getElementById('polRegister') as HTMLButtonElement
  polExportBtn = document.getElementById('polExportList') as HTMLButtonElement
  polOut = document.getElementById('polOut') as HTMLPreElement
  polUpdateRootBtn = document.getElementById('polUpdateRoot') as HTMLButtonElement
  polBatchId = document.getElementById('polBatchId') as HTMLInputElement
  hxGenIdentityBtn = document.getElementById('hxGenIdentity') as HTMLButtonElement
  hxIkPubBadge = document.getElementById('hxIkPub') as HTMLSpanElement
  hxGuardianAddress = document.getElementById('hxGuardianAddress') as HTMLInputElement
  hxGuardianBundle = document.getElementById('hxGuardianBundle') as HTMLTextAreaElement
  hxDeriveSecretBtn = document.getElementById('hxDeriveSecret') as HTMLButtonElement
  hxAddGuardianBtn = document.getElementById('hxAddGuardian') as HTMLButtonElement
  hxExportCommitmentsBtn = document.getElementById('hxExportCommitments') as HTMLButtonElement
  hxSharedSecretInput = document.getElementById('hxSharedSecret') as HTMLInputElement
  hxCommitmentInput = document.getElementById('hxCommitment') as HTMLInputElement
  hxCommitmentsList = document.getElementById('hxCommitmentsList') as HTMLPreElement
  recPolicyId = document.getElementById('recPolicyId') as HTMLInputElement
  recNonce = document.getElementById('recNonce') as HTMLInputElement
  recNewOwner = document.getElementById('recNewOwner') as HTMLInputElement
  recContract = document.getElementById('recContract') as HTMLInputElement
  recComputeReqBtn = document.getElementById('recComputeReq') as HTMLButtonElement
  recInitiateBtn = document.getElementById('recInitiate') as HTMLButtonElement
  recFinalizeBtn = document.getElementById('recFinalize') as HTMLButtonElement
  recOut = document.getElementById('recOut') as HTMLPreElement

  // Load existing data and render
  state.vcs = loadStore()
  renderList()

  connectBtn.addEventListener('click', connectWallet)
  // Watch wallet changes
  const eth = (window as any).ethereum as Eip1193Provider | undefined
  if (eth) {
    ;(eth as any).on?.('accountsChanged', (accs: string[]) => {
      state.account = accs?.[0]?.toLowerCase() || null
      if (state.account) {
        const short = `${state.account.slice(0,6)}...${state.account.slice(-4)}`
        walletStatus.textContent = `Connected ${short}`
        walletStatus.classList.remove('warn')
        walletStatus.classList.add('ok')
        connectBtn.textContent = 'Đã kết nối'
        connectBtn.disabled = true
      } else {
        walletStatus.textContent = 'Chưa kết nối'
        walletStatus.classList.remove('ok')
        walletStatus.classList.add('warn')
        connectBtn.textContent = 'Connect Wallet'
        connectBtn.disabled = false
      }
      refreshButtons()
    })
    ;(eth as any).on?.('chainChanged', () => {
      window.location.reload()
    })
  }
  saveVcBtn.addEventListener('click', handleSaveVC)
  clearAllBtn.addEventListener('click', handleClearAll)
  signVpBtn.addEventListener('click', signVP)
  copyVpBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(vpOutput.textContent || '')
  })
  downloadVpBtn.addEventListener('click', () => {
    const blob = new Blob([vpOutput.textContent || ''], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vp-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  })

  // Stage 1 actions
  polComputeRootBtn.addEventListener('click', () => { handleComputeRoot() })
  polRegisterBtn.addEventListener('click', () => { handleRegisterPolicy() })
  const toggleSetup = document.getElementById('toggleSetup') as HTMLButtonElement
  const setupBody = document.getElementById('setupBody') as HTMLDivElement
  toggleSetup?.addEventListener('click', () => {
    if (!setupBody) return
    const open = toggleSetup.getAttribute('data-open') === 'true'
    if (open) {
      setupBody.style.display = 'none'
      toggleSetup.textContent = 'Mở rộng'
      toggleSetup.setAttribute('data-open','false')
    } else {
      setupBody.style.display = ''
      toggleSetup.textContent = 'Thu gọn'
      toggleSetup.setAttribute('data-open','true')
    }
  })
  const toggleRecovery = document.getElementById('toggleRecovery') as HTMLButtonElement
  const recoveryBody = document.getElementById('recoveryBody') as HTMLDivElement
  toggleRecovery?.addEventListener('click', () => {
    if (!recoveryBody) return
    const open = toggleRecovery.getAttribute('data-open') === 'true'
    if (open) {
      recoveryBody.style.display = 'none'
      toggleRecovery.textContent = 'Mở rộng'
      toggleRecovery.setAttribute('data-open','false')
    } else {
      recoveryBody.style.display = ''
      toggleRecovery.textContent = 'Thu gọn'
      toggleRecovery.setAttribute('data-open','true')
    }
  })
  polUpdateRootBtn.addEventListener('click', () => { handleUpdateRootBatch() })
  hxGenIdentityBtn?.addEventListener('click', handleGenerateIdentity)
  hxDeriveSecretBtn?.addEventListener('click', () => { handleDeriveSecret() })
  hxAddGuardianBtn?.addEventListener('click', handleAddGuardian)
  hxExportCommitmentsBtn?.addEventListener('click', handleExportCommitments)
  polExportBtn.addEventListener('click', () => {
    const commits = parseCommitments(polCommitments.value)
    const blob = new Blob([JSON.stringify(commits, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'commitments.json'; a.click(); URL.revokeObjectURL(url)
  })

  // Stage 2 actions
  recComputeReqBtn.addEventListener('click', () => {
    const pid = recPolicyId.value.trim(); const nonce = recNonce.value.trim(); const newOwner = recNewOwner.value.trim()
    if (!pid || !nonce || !newOwner) { recOut.textContent = 'Điền policyId, nonce, newOwner'; return }
    const payload = JSON.stringify({ policyId: pid, nonce, newOwner })
    const reqId = keccak256(toUtf8Bytes(payload))
    recOut.textContent = `recoveryRequestID=${reqId}\nHãy gửi cho Guardians: { policyId, recoveryRequestID }`
  })
  recInitiateBtn.addEventListener('click', async () => {
    try {
      if (!state.provider) { alert('Kết nối ví'); return }
      const pid = recPolicyId.value.trim(); const nonce = recNonce.value.trim(); const newOwner = recNewOwner.value.trim(); const contractAddr = recContract.value.trim()
      if (!pid || !nonce || !newOwner || !contractAddr) { alert('Điền đủ policyId, nonce, newOwner, contract'); return }
      const reqId = keccak256(toUtf8Bytes(JSON.stringify({ policyId: pid, nonce, newOwner })))
      const signer = await state.provider.getSigner()
      const rec = new Contract(contractAddr, RECOVERY_ABI as any, signer)
      recOut.textContent = 'Sending initiateRecovery...'
      const tx = await (rec as any).initiateRecovery(pid, reqId, newOwner)
      recOut.textContent = 'Pending: ' + tx.hash + `\nrecoveryRequestID=${reqId}`
      await tx.wait()
      recOut.textContent = `Initiated. tx=${tx.hash}\nNhớ gửi cho Guardians: policyId & recoveryRequestID`
    } catch (e:any) {
      recOut.textContent = 'Error: ' + (e.message || String(e))
    }
  })
  recFinalizeBtn.addEventListener('click', async () => {
    try {
      if (!state.provider) { alert('Kết nối ví'); return }
      const pid = recPolicyId.value.trim(); const nonce = recNonce.value.trim(); const newOwner = recNewOwner.value.trim(); const contractAddr = recContract.value.trim()
      if (!pid || !nonce || !newOwner || !contractAddr) { alert('Điền đủ policyId, nonce, newOwner, contract'); return }
      const reqId = keccak256(toUtf8Bytes(JSON.stringify({ policyId: pid, nonce, newOwner })))
      const signer = await state.provider.getSigner()
      const rec = new Contract(contractAddr, RECOVERY_ABI as any, signer)
      recOut.textContent = 'Sending finalizeRecovery...'
      const tx = await (rec as any).finalizeRecovery(pid, reqId)
      recOut.textContent = 'Pending: ' + tx.hash
      await tx.wait()
      recOut.textContent = `Finalized. tx=${tx.hash}`
    } catch (e:any) {
      recOut.textContent = 'Error: ' + (e.message || String(e))
    }
  })
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup)
} else {
  setup()
}
