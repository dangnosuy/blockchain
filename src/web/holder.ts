/**
 * Holder Wallet Module
 * - Store multiple VCs (localStorage-based minimal store)
 * - Select subset of VCs to present
 * - Build and sign a VP via EIP-712 using MetaMask (ethers v6)
 */

import { BrowserProvider, Eip1193Provider, keccak256, toUtf8Bytes, getBytes } from 'ethers'

// Types
interface StoredVC {
  id: string
  raw: any
  issuer?: string
  subject?: string
  types?: string[]
  issuanceDate?: string
  createdAt: string
}

interface AppState {
  provider: BrowserProvider | null
  account: string | null
  vcs: StoredVC[]
  selectedIds: Set<string>
  selectedClaims: Record<string, Set<string>>
  isSigning: boolean
}

const state: AppState = {
  provider: null,
  account: null,
  vcs: [],
  selectedIds: new Set(),
  selectedClaims: {},
  isSigning: false,
}

// DOM
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement
const vcInput = document.getElementById('vcInput') as HTMLTextAreaElement
const saveVcBtn = document.getElementById('saveVcBtn') as HTMLButtonElement
const clearAllBtn = document.getElementById('clearAllBtn') as HTMLButtonElement
const vcList = document.getElementById('vcList') as HTMLDivElement
const signVpBtn = document.getElementById('signVpBtn') as HTMLButtonElement
const vpOutput = document.getElementById('vpOutput') as HTMLPreElement
const audienceInput = document.getElementById('audience') as HTMLInputElement
const nonceInput = document.getElementById('nonce') as HTMLInputElement
const expiryInput = document.getElementById('expiry') as HTMLInputElement
const copyVpBtn = document.getElementById('copyVpBtn') as HTMLButtonElement
const downloadVpBtn = document.getElementById('downloadVpBtn') as HTMLButtonElement

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
    meta.textContent = `issuer=${issuer || 'n/a'} | subject=${subject || 'n/a'} | id=${item.id}`

    // Append head & meta first
    card.appendChild(head)
    card.appendChild(meta)

    // Claims selection if VC contains merkle salts (Merkle-based selective disclosure)
    const salts = item.raw?.merkle?.salts as Record<string, string> | undefined
    if (salts && typeof salts === 'object') {
      if (!state.selectedClaims[item.id]) state.selectedClaims[item.id] = new Set()
      const keys = Object.keys(salts).sort()
      const wrapper = document.createElement('div')
      wrapper.style.marginTop = '.5rem'
      wrapper.style.paddingTop = '.4rem'
      wrapper.style.borderTop = '1px dashed rgba(120,210,255,0.3)'
      const claimTitle = document.createElement('div')
      claimTitle.className = 'muted'
      claimTitle.style.marginBottom = '.25rem'
      claimTitle.textContent = 'Chọn claim muốn tiết lộ:'
      wrapper.appendChild(claimTitle)
      keys.forEach((k) => {
        const line = document.createElement('label')
        line.style.display = 'flex'
        line.style.alignItems = 'center'
        line.style.gap = '.45rem'
        line.style.fontSize = '.85rem'
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = state.selectedClaims[item.id].has(k)
        cb.addEventListener('change', () => {
          if (cb.checked) state.selectedClaims[item.id].add(k)
          else state.selectedClaims[item.id].delete(k)
          refreshButtons()
        })
        const valSpan = document.createElement('span')
        const value = k === 'id' ? (item.raw?.credentialSubject?.id || item.raw?.holder || '') : item.raw?.credentialSubject?.[k]
        valSpan.textContent = `${k} = ${value}`
        line.appendChild(cb)
        line.appendChild(valSpan)
        wrapper.appendChild(line)
      })
      card.appendChild(wrapper)
    } else {
      const note = document.createElement('div')
      note.className = 'muted'
      note.style.fontSize = '.75rem'
      note.style.marginTop = '.5rem'
      note.textContent = 'Legacy VC: không có merkleRoot/salts => không thể tiết lộ từng claim (hãy tạo lại VC Merkle).'
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
    state.provider = new BrowserProvider(eth, 'any')
    const accounts = await state.provider.send('eth_requestAccounts', [])
    state.account = accounts?.[0]?.toLowerCase() || null
    refreshButtons()
  } catch (e) {
    console.error(e)
    alert('Không thể kết nối ví.')
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
  return { id, raw: vc, issuer, subject, types, issuanceDate, createdAt: new Date().toISOString() }
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
  return JSON.stringify({ k, v, salt })
}
function leafHash(k: string, v: any, salt: string) {
  return keccak256(toUtf8Bytes(stableLeafPayload(k, v, salt)))
}
function concatBytes(a: string, b: string) {
  const A = getBytes(a)
  const B = getBytes(b)
  const merged = new Uint8Array(A.length + B.length)
  merged.set(A, 0)
  merged.set(B, A.length)
  return keccak256(merged)
}
type Sibling = { hash: string; position: 'left' | 'right' }
function buildMerkleProofForVC(vc: any, claimKey: string): { root: string; proof: Sibling[]; value: any; salt: string } | null {
  const salts: Record<string, string> | undefined = vc?.merkle?.salts
  const subject = vc?.credentialSubject || {}
  if (!salts || !salts[claimKey]) return null
  const getValue = (k: string) => (k === 'id' ? (subject?.id || vc?.holder || '') : subject?.[k])
  const keys = Object.keys(salts).sort()
  const leaves = keys.map((k) => leafHash(k, getValue(k), salts[k]))
  let idx = keys.indexOf(claimKey)
  if (idx < 0) return null
  const proof: Sibling[] = []
  let level = leaves.slice()
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
      next.push(concatBytes(L, R))
    }
    level = next
    idx = Math.floor(idx / 2)
  }
  const root = level[0]
  return { root, proof, value: getValue(claimKey), salt: salts[claimKey] }
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
        if (res.root.toLowerCase() !== root.toLowerCase()) throw new Error('Merkle root mismatch')
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
  state.vcs = loadStore()
  renderList()

  connectBtn.addEventListener('click', connectWallet)
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
}

setup()
