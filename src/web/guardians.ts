import { BrowserProvider, Eip1193Provider, Contract, keccak256, solidityPackedKeccak256, getBytes } from 'ethers'
import { createPreKeyBundle, exportBundlePublic, deriveSharedSecretResponder, PreKeyBundleSecret } from './e2ee.js'

// Minimal ABI of RecoveryContract per workflow
const RECOVERY_ABI = [
  {
    type: 'function',
    name: 'submitApproval',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'bytes32' },
      { name: 'recoveryRequestID', type: 'bytes32' },
      { name: 'proof', type: 'bytes' },
      { name: 'publicInputs', type: 'uint256[]' },
    ],
    outputs: [],
  },
]

type GuardianState = {
  sharedSecret?: string // bytes32 hex
  commitment?: string // bytes32 hex
  commitments?: string[]
  index?: number
  path?: string[]
  root?: string
  nullifier?: string // bytes32 hex
}

let provider: BrowserProvider | null = null
let guardianAddr: string | null = null
let gstate: GuardianState = {}
let bundleSecret: PreKeyBundleSecret | null = null

// DOM elements - will be initialized after DOM loads
let connectBtn: HTMLButtonElement
let walletInfo: HTMLSpanElement
let genBundleBtn: HTMLButtonElement
let copyBundleBtn: HTMLButtonElement
let bundleOut: HTMLTextAreaElement
let holderIkInput: HTMLInputElement
let policyRefInput: HTMLInputElement
let deriveSecretBtn: HTMLButtonElement
let computeCommitmentBtn: HTMLButtonElement
let secretInput: HTMLInputElement
let commitmentValueInput: HTMLInputElement
let commitmentOut: HTMLPreElement
let commitmentsInput: HTMLTextAreaElement
let computePathBtn: HTMLButtonElement
let pathOut: HTMLPreElement
let nullifierReqIdInput: HTMLInputElement
let nullifierOutInput: HTMLInputElement
let computeNullifierBtn: HTMLButtonElement
let copyNullifierBtn: HTMLButtonElement
let nullifierDisplay: HTMLPreElement
let policyIdInput: HTMLInputElement
let reqIdInput: HTMLInputElement
let contractInput: HTMLInputElement
let proofHexInput: HTMLTextAreaElement
let pubInputsInput: HTMLInputElement
let submitApprovalBtn: HTMLButtonElement
let txOut: HTMLPreElement

function saveState() { if (guardianAddr) localStorage.setItem(`guardian_state:${guardianAddr}`, JSON.stringify(gstate)) }
function loadState() {
  if (!guardianAddr) return
  try {
    const raw = localStorage.getItem(`guardian_state:${guardianAddr}`)
    if (!raw) return
    gstate = JSON.parse(raw)
    if (gstate.sharedSecret) secretInput.value = gstate.sharedSecret
    if (gstate.commitment) { commitmentOut.textContent = gstate.commitment; commitmentValueInput.value = gstate.commitment }
    if (gstate.commitments) commitmentsInput.value = JSON.stringify(gstate.commitments)
    if (gstate.path) pathOut.textContent = JSON.stringify({ index: gstate.index, path: gstate.path, root: gstate.root }, null, 2)
  } catch {}
}

async function connectWallet() {
  const eth = (window as any).ethereum as Eip1193Provider | undefined
  if (!eth) { alert('Không tìm thấy ví'); return }
  connectBtn.disabled = true
  try {
    provider = new BrowserProvider(eth, 'any')
    const accs = await provider.send('eth_requestAccounts', [])
    guardianAddr = accs?.[0]?.toLowerCase() || null
    walletInfo.textContent = guardianAddr ? `${guardianAddr.slice(0,6)}...${guardianAddr.slice(-4)}` : 'N/A'
    loadState()
  } catch (e:any) {
    walletInfo.textContent = 'Lỗi kết nối ví'
  } finally {
    connectBtn.disabled = !!guardianAddr
  }
}

function isBytes32Hex(x: string) { return /^0x[0-9a-fA-F]{64}$/.test(x.trim()) }

function generateBundle() {
  bundleSecret = createPreKeyBundle()
  const pub = exportBundlePublic(bundleSecret)
  bundleOut.value = JSON.stringify(pub)
}

function copyBundle() { navigator.clipboard.writeText(bundleOut.value || '') }

async function deriveSecret() {
  if (!bundleSecret) { alert('Tạo PreKey Bundle trước'); return }
  const holderIk = holderIkInput.value.trim()
  const policyId = policyRefInput.value.trim()
  if (!isBytes32Hex(holderIk)) { alert('Holder IK phải là bytes32 hex'); return }
  if (!isBytes32Hex(policyId)) { alert('policyId phải là bytes32'); return }
  const shared = await deriveSharedSecretResponder(bundleSecret, holderIk, policyId)
  const hex = '0x' + [...shared].map(b=>b.toString(16).padStart(2,'0')).join('')
  secretInput.value = hex
  gstate.sharedSecret = hex
  saveState()
}

function computeCommitment() {
  if (!guardianAddr) { alert('Kết nối ví trước'); return }
  const sec = secretInput.value.trim()
  if (!isBytes32Hex(sec)) { alert('Shared Secret chưa hợp lệ'); return }
  const c = solidityPackedKeccak256(['address','bytes32'], [guardianAddr, sec])
  gstate.commitment = c
  commitmentValueInput.value = c
  commitmentOut.textContent = c
  saveState()
}

function merkleFromCommitments(arr: string[]) {
  const leaves = arr.slice()
  let level = leaves.slice()
  while (level.length > 1) {
    const next: string[] = []
    for (let i=0;i<level.length;i+=2){
      const L = level[i]
      const R = level[i+1] ?? level[i]
      const A = getBytes(L); const B = getBytes(R)
      const merged = new Uint8Array(A.length+B.length)
      merged.set(A,0); merged.set(B,A.length)
      next.push(keccak256(merged))
    }
    level = next
  }
  return level[0]
}

function computePath() {
  if (!gstate.commitment) { alert('Tính commitment trước'); return }
  let arr: string[]
  try { arr = JSON.parse(commitmentsInput.value.trim()) } catch { alert('Commitments phải là JSON array'); return }
  if (!Array.isArray(arr) || arr.length === 0) { alert('Commitments trống'); return }
  const idx = arr.findIndex((x:string) => x.toLowerCase() === gstate.commitment!.toLowerCase())
  if (idx < 0) { alert('Commitment của bạn không nằm trong danh sách'); return }
  let level = arr.slice()
  let index = idx
  const siblings: string[] = []
  while (level.length > 1) {
    const isRight = index % 2 === 1
    const pairIndex = isRight ? index - 1 : index + 1
    const left = isRight ? level[index - 1] : level[index]
    const right = isRight ? level[index] : (level[pairIndex] ?? level[index])
    const sib = isRight ? left : right
    siblings.push(sib)
    const next: string[] = []
    for (let i=0;i<level.length;i+=2) {
      const L = level[i]
      const R = level[i+1] ?? level[i]
      const A = getBytes(L); const B = getBytes(R)
      const merged = new Uint8Array(A.length+B.length)
      merged.set(A,0); merged.set(B,A.length)
      next.push(keccak256(merged))
    }
    level = next
    index = Math.floor(index/2)
  }
  const root = level[0]
  gstate.commitments = arr
  gstate.index = idx
  gstate.path = siblings
  gstate.root = root
  saveState()
  pathOut.textContent = JSON.stringify({ index: idx, path: siblings, root }, null, 2)
}

function computeNullifier() {
  const sec = secretInput.value.trim()
  const reqId = nullifierReqIdInput.value.trim()
  if (!isBytes32Hex(sec)) { alert('Shared Secret chưa hợp lệ hoặc chưa derive'); return }
  if (!isBytes32Hex(reqId)) { alert('recoveryRequestID phải là bytes32'); return }
  // nullifier = keccak256(abi.encodePacked(sharedSecret, recoveryRequestID))
  const nullifier = solidityPackedKeccak256(['bytes32','bytes32'], [sec, reqId])
  nullifierOutInput.value = nullifier
  nullifierDisplay.textContent = `Nullifier: ${nullifier}\n\nCopy giá trị này vào publicInputs. Ví dụ:\n["${nullifier}","0xmerkleRoot"]`
  gstate.nullifier = nullifier
  saveState()
}

function copyNullifier() {
  const val = nullifierOutInput.value
  if (!val) { alert('Tính nullifier trước'); return }
  navigator.clipboard.writeText(val)
}

function parsePublicInputs(input: string): bigint[] {
  try {
    const arr = JSON.parse(input.trim())
    if (Array.isArray(arr)) return arr.map((x:any) => BigInt(x))
  } catch {}
  const parts = input.split(',').map(s=>s.trim()).filter(Boolean)
  return parts.map(v => v.startsWith('0x') ? BigInt(v) : BigInt(v))
}

async function submitApproval() {
  if (!provider || !guardianAddr) { alert('Kết nối ví trước'); return }
  const contractAddr = contractInput.value.trim()
  const policyId = policyIdInput.value.trim()
  const reqId = reqIdInput.value.trim()
  const proofHex = proofHexInput.value.trim()
  const pubInputsArr = parsePublicInputs(pubInputsInput.value)
  if (!/^0x[0-9a-fA-F]+$/.test(proofHex)) { alert('Proof phải là hex (0x...)'); return }
  if (!isBytes32Hex(policyId) || !isBytes32Hex(reqId)) { alert('policyId và recoveryRequestID phải là bytes32'); return }
  if (!contractAddr) { alert('Nhập địa chỉ contract'); return }
  try {
    const signer = await provider.getSigner()
    const rec = new Contract(contractAddr, RECOVERY_ABI as any, signer)
    txOut.textContent = 'Sending transaction...'
    const tx = await (rec as any).submitApproval(policyId, reqId, proofHex, pubInputsArr)
    txOut.textContent = 'Pending: ' + tx.hash
    await tx.wait()
    txOut.textContent = 'Success: ' + tx.hash
  } catch (e:any) {
    txOut.textContent = 'Error: ' + (e.message || String(e))
  }
}

// Event bindings
function initializeApp() {
  // Initialize DOM elements
  connectBtn = document.getElementById('gConnect') as HTMLButtonElement
  walletInfo = document.getElementById('gWallet') as HTMLSpanElement
  genBundleBtn = document.getElementById('gGenBundle') as HTMLButtonElement
  copyBundleBtn = document.getElementById('gCopyBundle') as HTMLButtonElement
  bundleOut = document.getElementById('gBundleOut') as HTMLTextAreaElement
  holderIkInput = document.getElementById('gHolderIk') as HTMLInputElement
  policyRefInput = document.getElementById('gPolicyRef') as HTMLInputElement
  deriveSecretBtn = document.getElementById('gDeriveSecret') as HTMLButtonElement
  computeCommitmentBtn = document.getElementById('gComputeCommitment') as HTMLButtonElement
  secretInput = document.getElementById('gSecret') as HTMLInputElement
  commitmentValueInput = document.getElementById('gCommitmentValue') as HTMLInputElement
  commitmentOut = document.getElementById('gCommitmentOut') as HTMLPreElement
  commitmentsInput = document.getElementById('gCommitments') as HTMLTextAreaElement
  computePathBtn = document.getElementById('gComputePath') as HTMLButtonElement
  pathOut = document.getElementById('gPathOut') as HTMLPreElement
  nullifierReqIdInput = document.getElementById('gNullifierReqId') as HTMLInputElement
  nullifierOutInput = document.getElementById('gNullifierOut') as HTMLInputElement
  computeNullifierBtn = document.getElementById('gComputeNullifier') as HTMLButtonElement
  copyNullifierBtn = document.getElementById('gCopyNullifier') as HTMLButtonElement
  nullifierDisplay = document.getElementById('gNullifierDisplay') as HTMLPreElement
  policyIdInput = document.getElementById('gPolicyId') as HTMLInputElement
  reqIdInput = document.getElementById('gReqId') as HTMLInputElement
  contractInput = document.getElementById('gContract') as HTMLInputElement
  proofHexInput = document.getElementById('gProofHex') as HTMLTextAreaElement
  pubInputsInput = document.getElementById('gPublicInputs') as HTMLInputElement
  submitApprovalBtn = document.getElementById('gSubmitApproval') as HTMLButtonElement
  txOut = document.getElementById('gTxOut') as HTMLPreElement

  // Bind event listeners
  connectBtn.addEventListener('click', () => { connectWallet() })
  genBundleBtn.addEventListener('click', () => { generateBundle() })
  copyBundleBtn.addEventListener('click', () => { copyBundle() })
  deriveSecretBtn.addEventListener('click', () => { deriveSecret() })
  computeCommitmentBtn.addEventListener('click', () => { computeCommitment() })
  computePathBtn.addEventListener('click', () => { computePath() })
  computeNullifierBtn.addEventListener('click', () => { computeNullifier() })
  copyNullifierBtn.addEventListener('click', () => { copyNullifier() })
  submitApprovalBtn.addEventListener('click', () => { submitApproval() })
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp)
} else {
  initializeApp()
}

// Tip: Nullifier (tham khảo)
