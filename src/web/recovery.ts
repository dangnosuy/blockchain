import { BrowserProvider, Eip1193Provider, keccak256, toUtf8Bytes } from 'ethers'

// ---- Types ----
export interface GuardianDescriptor {
  pseudonymCommitment: string
  channelRef: string
  capabilities: string[]
}

export interface RecoveryPolicy {
  policyId: string
  threshold: number
  totalGuardians: number
  guardianDescriptors: GuardianDescriptor[]
  version: string
  createdAt: number
  policySignature?: string
}

export interface RecoveryRequest {
  policyId: string
  recoveryRequestID: string
  newPubKey: string
  nonce: string
  timestamp: number
  requestSignature?: string
}

// ---- State ----
const state: {
  provider: BrowserProvider | null
  account: string | null
  policy?: RecoveryPolicy
} = { provider: null, account: null }

// ---- DOM ----
const connectBtn = document.getElementById('connect') as HTMLButtonElement
const thresholdInput = document.getElementById('threshold') as HTMLInputElement
const totalInput = document.getElementById('total') as HTMLInputElement
const guardiansInput = document.getElementById('guardians') as HTMLTextAreaElement
const genPolicyBtn = document.getElementById('genPolicy') as HTMLButtonElement
const exportPolicyBtn = document.getElementById('exportPolicy') as HTMLButtonElement
const policyOut = document.getElementById('policyOut') as HTMLPreElement
const initiateBtn = document.getElementById('initiate') as HTMLButtonElement
const newKeyInput = document.getElementById('newKey') as HTMLInputElement
const nonceInput = document.getElementById('nonce') as HTMLInputElement
const policyIdView = document.getElementById('policyIdView') as HTMLSpanElement
const reqIdView = document.getElementById('reqIdView') as HTMLSpanElement
const walletView = document.getElementById('walletView') as HTMLSpanElement
const logView = document.getElementById('logView') as HTMLSpanElement

function log(msg: string) {
  const t = new Date().toLocaleTimeString()
  logView.textContent = `[${t}] ${msg}`
}

// ---- Helpers ----
function genPolicyId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(32))
  const ts = new TextEncoder().encode(String(Date.now()))
  const merged = new Uint8Array(rand.length + ts.length)
  merged.set(rand, 0)
  merged.set(ts, rand.length)
  return keccak256(merged)
}

function parseGuardians(raw: string): GuardianDescriptor[] | null {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return arr as GuardianDescriptor[]
  } catch {
    return null
  }
}

async function connect() {
  const eth = (window as any).ethereum as Eip1193Provider | undefined
  if (!eth) { alert('Không tìm thấy ví.'); return }
  try {
    connectBtn.disabled = true
    state.provider = new BrowserProvider(eth, 'any')
    const accounts = await state.provider.send('eth_requestAccounts', [])
    state.account = accounts?.[0]?.toLowerCase() || null
    if (state.account) {
      walletView.textContent = `${state.account.slice(0,6)}...${state.account.slice(-4)}`
      genPolicyBtn.disabled = false
      initiateBtn.disabled = false
      log('Đã kết nối ví.')
    } else {
      walletView.textContent = 'Chưa kết nối'
      genPolicyBtn.disabled = true
      initiateBtn.disabled = true
    }
  } finally {
    connectBtn.disabled = false
  }
}

async function generatePolicy() {
  const threshold = Number(thresholdInput.value || '0')
  const total = Number(totalInput.value || '0')
  const gds = parseGuardians(guardiansInput.value.trim())
  if (!threshold || !total || !gds || gds.length === 0) {
    log('Thiếu tham số policy hoặc guardians không hợp lệ.')
    return
  }
  if (threshold > total) {
    log('Threshold phải <= tổng số guardians.')
    return
  }
  const policy: RecoveryPolicy = {
    policyId: genPolicyId(),
    threshold,
    totalGuardians: total,
    guardianDescriptors: gds,
    version: '1.0.0',
    createdAt: Math.floor(Date.now()/1000),
  }
  // Ký policy artifact để ràng buộc danh tính người tạo (personal sign)
  if (state.provider && state.account) {
    try {
      const signer = await state.provider.getSigner()
      const msg = `policy:${policy.policyId}:${policy.createdAt}`
      policy.policySignature = await signer.signMessage(msg)
    } catch {}
  }
  state.policy = policy
  policyOut.textContent = JSON.stringify(policy, null, 2)
  policyIdView.textContent = policy.policyId
  exportPolicyBtn.disabled = false
  log('Tạo policy thành công.')
}

function exportPolicy() {
  if (!state.policy) return
  const blob = new Blob([JSON.stringify(state.policy, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `recovery-policy-${state.policy.policyId}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function computeRecoveryRequestID(policyId: string, nonce: string, newPubKey: string) {
  const payload = JSON.stringify({ policyId, nonce, newPubKey })
  return keccak256(toUtf8Bytes(payload))
}

async function initiateRecovery() {
  if (!state.policy) { log('Chưa có policy.'); return }
  const newKey = newKeyInput.value.trim()
  const nonce = nonceInput.value.trim() || Math.random().toString(36).slice(2)
  if (!newKey) { log('Nhập New Public Key.'); return }
  const reqId = computeRecoveryRequestID(state.policy.policyId, nonce, newKey)
  reqIdView.textContent = reqId
  // Ký yêu cầu (personal sign demo)
  if (state.provider) {
    try {
      const signer = await state.provider.getSigner()
      const msg = `recovery:${state.policy.policyId}:${reqId}`
      const sig = await signer.signMessage(msg)
      log('Đã khởi phát recovery (demo). Gửi off-chain cho Guardians để tạo ZKP.')
      console.debug({ reqId, sig })
    } catch (e:any) {
      log(e.message || 'Không thể ký recovery request')
    }
  }
}

function setup() {
  connectBtn.addEventListener('click', connect)
  genPolicyBtn.addEventListener('click', generatePolicy)
  exportPolicyBtn.addEventListener('click', exportPolicy)
  initiateBtn.addEventListener('click', initiateRecovery)
}

setup()
