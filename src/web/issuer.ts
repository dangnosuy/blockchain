/**
 * Issuer Browser Module
 * Handles wallet connection, VC creation with MetaMask signing via Veramo
 */

import { createAgent } from '@veramo/core'
import { DIDManager, MemoryDIDStore } from '@veramo/did-manager'
import { KeyManager, MemoryKeyStore } from '@veramo/key-manager'
import { Web3KeyManagementSystem } from '@veramo/kms-web3'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { CredentialPlugin } from '@veramo/credential-w3c'
// NOTE: Removed EIP-712 plugin due to Node-only dependencies (http, https, zlib) causing browser bundling errors.
// We'll revert to JWT signing which MetaMask supports via Secp256k1 (ES256K) once key import aligns with kms-web3 expectations.
import { EthrDIDProvider } from '@veramo/did-provider-ethr'
import { Resolver } from 'did-resolver'
import { getResolver as ethrDidResolver } from 'ethr-did-resolver'
import { BrowserProvider, Eip1193Provider, Contract, keccak256, toUtf8Bytes, getBytes } from 'ethers'
import type { IIdentifier } from '@veramo/core-types'
 

// =================== GLOBAL TYPES ===================
declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on(event: string, callback: (...args: any[]) => void): void
      removeListener(event: string, callback: (...args: any[]) => void): void
    }
    __veramoAgent?: any
  }
}

// =================== TYPES ===================
interface Attribute {
  id: string
  label: string
  key: string
  value: string
}

interface AppState {
  provider: BrowserProvider | null
  currentAccount: string | null
  attributes: Attribute[]
  issuerIdentifier: IIdentifier | null
  isConnecting: boolean
  isCreatingVC: boolean
  isRegistering: boolean
}

// =================== STATE ===================
const state: AppState = {
  provider: null,
  currentAccount: null,
  attributes: [],
  issuerIdentifier: null,
  isConnecting: false,
  isCreatingVC: false,
  isRegistering: false,
}

// (Using MemoryKeyStore from @veramo/key-manager instead of a custom mock)

// =================== DOM ELEMENTS ===================
const connectButton = document.getElementById('connectWallet') as HTMLButtonElement

// DID Registry elements
const registerForm = document.getElementById('registerForm') as HTMLFormElement
const registerButton = document.getElementById('registerBtn') as HTMLButtonElement
const contractAddressInput = document.getElementById('contractAddress') as HTMLInputElement
const didInput = document.getElementById('didInput') as HTMLInputElement
const cidInput = document.getElementById('cidInput') as HTMLInputElement

// VC Creation elements
const holderDidInput = document.getElementById('holderDidInput') as HTMLInputElement
const credentialTypeInput = document.getElementById('credentialTypeInput') as HTMLInputElement
const attributeTable = document.getElementById('attributeTable') as HTMLDivElement
const addAttributeBtn = document.getElementById('addAttributeBtn') as HTMLButtonElement
const resetAttributesBtn = document.getElementById('resetAttributesBtn') as HTMLButtonElement
const createVcBtn = document.getElementById('createVcBtn') as HTMLButtonElement
const vcOutput = document.getElementById('vcOutput') as HTMLPreElement
const accountStatus = document.getElementById('accountStatus') as HTMLDivElement
const networkStatus = document.getElementById('networkStatus') as HTMLDivElement
const logArea = document.getElementById('logArea') as HTMLDivElement

// =================== HELPER FUNCTIONS ===================
function setLog(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const time = new Date().toLocaleTimeString()
  logArea.textContent = `[${time}] ${message}`
  logArea.dataset.type = type
}

function createAttribute(label: string, key: string, value = ''): Attribute {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    key,
    value,
  }
}

function getDefaultAttributes(): Attribute[] {
  return [
    createAttribute('Họ tên', 'name'),
    createAttribute('Ngày sinh', 'birthdate'),
    createAttribute('Trường học', 'university'),
  ]
}

function updateAttribute(id: string, field: 'key' | 'value', value: string) {
  state.attributes = state.attributes.map((item) =>
    item.id === id ? { ...item, [field]: value } : item
  )
  updateCreateVcState()
}

function removeAttribute(id: string) {
  state.attributes = state.attributes.filter((item) => item.id !== id)
  updateCreateVcState()
  renderAttributes()
}

function renderAttributes() {
  attributeTable.innerHTML = ''
  if (!state.attributes.length) {
    state.attributes.push(createAttribute('Thuộc tính', 'field'))
  }

  state.attributes.forEach((attr) => {
    const row = document.createElement('div')
    row.className = 'attribute-row'
    row.dataset.id = attr.id

    const keyInput = document.createElement('input')
    keyInput.type = 'text'
    keyInput.placeholder = `Ví dụ: ${attr.key || 'name'}`
    keyInput.value = attr.key || ''
    keyInput.dataset.field = 'key'
    keyInput.addEventListener('input', (event) => {
      updateAttribute(attr.id, 'key', (event.target as HTMLInputElement).value.trim())
    })

    const valueInput = document.createElement('input')
    valueInput.type = 'text'
    valueInput.placeholder = `Giá trị cho ${attr.key || 'thuộc tính'}`
    valueInput.value = attr.value || ''
    valueInput.dataset.field = 'value'
    valueInput.addEventListener('input', (event) => {
      updateAttribute(attr.id, 'value', (event.target as HTMLInputElement).value)
    })

    row.appendChild(keyInput)
    row.appendChild(valueInput)

    if (state.attributes.length > 1) {
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'secondary-button'
      removeBtn.textContent = 'Xóa'
      removeBtn.addEventListener('click', () => removeAttribute(attr.id))
      row.appendChild(removeBtn)
    }

    attributeTable.appendChild(row)
  })
}

function updateCreateVcState() {
  const hasWallet = Boolean(state.provider && state.currentAccount)
  const hasHolderDid = holderDidInput.value.trim().length > 0
  const hasAttributes = state.attributes.some(
    (attr) => attr.key?.trim()?.length && attr.value?.trim()?.length
  )
  createVcBtn.disabled = !(hasWallet && hasHolderDid && hasAttributes) || state.isCreatingVC
}

function buildAttributesPayload(): Record<string, any> {
  return state.attributes.reduce((acc, attr) => {
    const key = attr.key?.trim()
    const value = attr.value?.trim()
    if (key && value) {
      acc[key] = value
    }
    return acc
  }, {} as Record<string, any>)
}

function resetVcOutput(message = 'Chưa tạo VC') {
  vcOutput.textContent = message
}

// =================== WALLET CONNECTION ===================
async function connectWallet() {
  if (!window.ethereum) {
    setLog('Không tìm thấy ví. Hãy cài đặt MetaMask.', 'error')
    return
  }

  if (state.isConnecting) return

  try {
    state.isConnecting = true
    connectButton.disabled = true
    setLog('Đang yêu cầu kết nối ví...')

    state.provider = new BrowserProvider(window.ethereum, 'any')
    const accounts = await state.provider.send('eth_requestAccounts', [])
    
    if (!accounts || accounts.length === 0) {
      throw new Error('Ví không trả về địa chỉ tài khoản.')
    }

    state.currentAccount = accounts[0].toLowerCase()
    const network = await state.provider.getNetwork()

    accountStatus.textContent = state.currentAccount
    networkStatus.textContent = `${network.name} (#${network.chainId})`
    setLog('Kết nối ví thành công. Đang khởi tạo Veramo agent...', 'info')

    // Initialize Veramo agent with MetaMask signing
    await initializeVeramoAgent()

    setLog('Sẵn sàng đăng ký DID và tạo VC.', 'success')
    registerButton.disabled = false
    updateCreateVcState()
  } catch (error: any) {
    console.error(error)
    setLog(error.message || 'Không thể kết nối ví.', 'error')
  } finally {
    state.isConnecting = false
    connectButton.disabled = false
  }
}

// =================== DID REGISTRY FUNCTIONS ===================
const DID_REGISTRY_ABI = [
  'function registerDID(string did, string cid) public',
  'function resolveDID(string did) public view returns (string)',
  'function getDIDOwner(string did) public view returns (address)',
]

async function registerIssuerDID(event: Event) {
  event.preventDefault()
  
  if (!state.provider || !state.currentAccount) {
    setLog('Hãy kết nối ví trước.', 'warn')
    return
  }

  const contractAddress = contractAddressInput.value.trim()
  const did = didInput.value.trim()
  const cid = cidInput.value.trim()

  if (!contractAddress || !did || !cid) {
    setLog('Vui lòng nhập đầy đủ thông tin.', 'error')
    return
  }

  try {
    state.isRegistering = true
    registerButton.disabled = true
    registerButton.textContent = 'Đang đăng ký...'
    setLog('Đang gửi giao dịch đăng ký DID...')

    const signer = await state.provider.getSigner()
    const contract = new Contract(contractAddress, DID_REGISTRY_ABI, signer)
    
    const tx = await contract.registerDID(did, cid)
    setLog(`Đã gửi tx: ${tx.hash}. Đợi xác nhận...`)
    
    const receipt = await tx.wait()
    if (receipt.status !== 1) {
      throw new Error('Giao dịch thất bại.')
    }
    
    setLog(`Đăng ký thành công! Tx block #${receipt.blockNumber}.`, 'success')
    registerForm.reset()
    contractAddressInput.value = contractAddress
  } catch (error: any) {
    console.error(error)
    if (error.code === 4001) {
      setLog('Bạn đã từ chối giao dịch.', 'warn')
    } else {
      setLog(error.message || 'Đăng ký thất bại.', 'error')
    }
  } finally {
    state.isRegistering = false
    registerButton.disabled = !state.provider
    registerButton.textContent = 'Register Issuer Identity'
  }
}

// =================== VERAMO SETUP ===================
async function initializeVeramoAgent() {
  if (!state.provider || !state.currentAccount) {
    throw new Error('Provider hoặc account chưa được khởi tạo')
  }

  try {
    const network = await state.provider.getNetwork()
    const networkName = network.name === 'unknown' ? 'sepolia' : network.name
    const chainId = Number(network.chainId)

    // Create Web3 KMS with MetaMask provider
    const web3Provider = state.provider
    const web3Kms = new Web3KeyManagementSystem({
      metamask: web3Provider,
    })

    // Setup DID resolver
    const didResolver = new Resolver({
      ...ethrDidResolver({
        networks: [
          {
            name: networkName,
            chainId: chainId,
            provider: web3Provider as any,
          },
        ],
      }),
    })

    // Create Veramo agent
    const agent = createAgent({
      plugins: [
        new KeyManager({
          store: new MemoryKeyStore(),
          kms: {
            metamask: web3Kms,
          },
        }),
        new DIDManager({
          store: new MemoryDIDStore(),
          defaultProvider: `did:ethr:${networkName}`,
          providers: {
            [`did:ethr:${networkName}`]: new EthrDIDProvider({
              defaultKms: 'metamask',
              network: networkName,
              rpcUrl: `https://${networkName}.infura.io/v3/your-infura-key`, // Not used for signing
            }),
          },
        }),
  // (EIP-712 disabled) Only standard W3C JWT credentials for now
        new CredentialPlugin(),
        new DIDResolverPlugin({
          resolver: didResolver,
        }),
      ],
    })

    // Import issuer identity from MetaMask account
    const issuerDid = `did:ethr:${networkName}:${state.currentAccount}`
    
    // Get available keys from MetaMask
    const keys = await web3Kms.listKeys()
    console.log('Available MetaMask keys:', keys)

    if (keys.length === 0) {
      throw new Error('Không tìm thấy key từ MetaMask')
    }

    // Use the first available key (metamask-{address})
    const keyId = keys[0].kid

    // Import DID
    state.issuerIdentifier = await agent.didManagerImport({
      did: issuerDid,
      provider: `did:ethr:${networkName}`,
      controllerKeyId: keyId,
      keys: [
        {
          kid: keyId,
          kms: 'metamask',
          type: 'Secp256k1',
          publicKeyHex: '', // Will be resolved by MetaMask
          meta: {
            account: state.currentAccount,
            provider: 'metamask',
            algorithms: ['ES256K', 'ES256K-R'],
          },
        },
      ],
      services: [],
    })

    if (state.issuerIdentifier) {
      console.log('Issuer DID initialized:', state.issuerIdentifier.did)
    }
    
    // Store agent globally for VC creation
    window.__veramoAgent = agent
  } catch (error) {
    console.error('Failed to initialize Veramo:', error)
    throw error
  }
}

// =================== VC CREATION ===================
async function createCredential() {
  if (createVcBtn.disabled || state.isCreatingVC) return

  const holderDid = holderDidInput.value.trim()
  const credentialType = credentialTypeInput.value.trim() || 'StudentCard'
  const attributesPayload = buildAttributesPayload()

  if (!holderDid) {
    setLog('Hãy nhập Holder DID.', 'warn')
    return
  }
  if (!Object.keys(attributesPayload).length) {
    setLog('Cần ít nhất một thuộc tính Credential.', 'warn')
    return
  }

  if (!state.issuerIdentifier) {
    setLog('Issuer chưa được khởi tạo. Hãy kết nối ví lại.', 'error')
    return
  }

  const agent = window.__veramoAgent
  if (!agent) {
    setLog('Veramo agent chưa sẵn sàng.', 'error')
    return
  }

  try {
    state.isCreatingVC = true
    createVcBtn.disabled = true
    createVcBtn.textContent = 'Đang tạo...'
  vcOutput.textContent = 'Đang xây dựng Merkle Root & yêu cầu ký...'
  setLog('Tạo VC (Merkle-root) qua EIP-712. Vui lòng xác nhận chữ ký trong MetaMask...')

    const network = await state.provider!.getNetwork()
    const chainId = Number(network.chainId)
    const signer = await state.provider!.getSigner()

    // Build Merkle root over claims (id + attributes)
    const domain = { name: 'VerifiableCredential', version: '1', chainId }
    const issuanceDate = new Date().toISOString()

    // helper: stable stringify for claim leaf
    const stableClaim = (k: string, v: any, salt: string) => JSON.stringify({ k, v, salt })
    const hashLeaf = (k: string, v: any, salt: string) => keccak256(toUtf8Bytes(stableClaim(k, v, salt)))
    const hashPair = (a: string, b: string) => {
      const A = getBytes(a)
      const B = getBytes(b)
      const merged = new Uint8Array(A.length + B.length)
      merged.set(A, 0)
      merged.set(B, A.length)
      return keccak256(merged)
    }
    const randomSaltHex = (bytes = 16) => {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const arr = new Uint8Array(bytes)
        crypto.getRandomValues(arr)
        return '0x' + Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
      }
      // fallback
      let s = '0x'
      for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
      return s
    }

    // Collect claims (include subject id)
    const claims: Array<{ key: string; value: any }> = [
      { key: 'id', value: holderDid },
      ...Object.entries(attributesPayload).map(([k, v]) => ({ key: k, value: v })),
    ]
    // Deterministic order by key
    claims.sort((a, b) => a.key.localeCompare(b.key))

    const salts: Record<string, string> = {}
    const leaves: string[] = []
    for (const c of claims) {
      const salt = randomSaltHex(16)
      salts[c.key] = salt
      leaves.push(hashLeaf(c.key, c.value, salt))
    }
    // Build Merkle tree
    let level = leaves.slice()
    if (level.length === 0) level = [keccak256(toUtf8Bytes('empty'))]
    while (level.length > 1) {
      const next: string[] = []
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i]
        const right = level[i + 1] ?? level[i] // duplicate if odd
        next.push(hashPair(left, right))
      }
      level = next
    }
    const merkleRoot = level[0]

    // Typed data for Merkle-root
    const types: Record<string, any> = {
      VerifiableCredentialRoot: [
        { name: 'issuer', type: 'string' },
        { name: 'issuanceDate', type: 'string' },
        { name: 'holder', type: 'string' },
        { name: 'merkleRoot', type: 'bytes32' },
        { name: 'algo', type: 'string' },
      ],
    }

    const typedValue = {
      issuer: state.issuerIdentifier!.did,
      issuanceDate,
      holder: holderDid,
      merkleRoot,
      algo: 'keccak256',
    }

    // signTypedData v4 expects full JSON with domain, types, primaryType, message
    // ethers v6 signer.signTypedData(domain, types, value)
    const signature = await (signer as any).signTypedData(domain, types, typedValue)
    console.log('EIP-712 signature:', signature)

    const vcDocument = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', credentialType],
      issuer: state.issuerIdentifier!.did,
      issuanceDate,
      // Include holder top-level to mirror typed data "holder" field
      holder: holderDid,
      credentialSubject: { id: holderDid, ...attributesPayload },
      merkle: {
        algorithm: 'keccak256',
        leafEncoding: 'json-kv-salt',
        salts,
      },
      proof: {
        type: 'EthereumEip712Signature2021',
        created: issuanceDate,
        proofPurpose: 'assertionMethod',
        verificationMethod: `${state.issuerIdentifier!.did}#controller`,
        eip712: {
          domain,
          primaryType: 'VerifiableCredentialRoot',
          types, // Provided for verifiers to reconstruct digest
        },
        merkleRoot,
        hashAlgorithm: 'keccak256',
        proofValue: signature,
      },
    }

    const output = JSON.stringify(vcDocument, null, 2)
    vcOutput.textContent = output
    setLog('Tạo VC & ký EIP-712 thành công!', 'success')
  } catch (error: any) {
    console.error('VC creation failed (EIP-712 custom path):', error)
    const message = error.message || String(error)
    vcOutput.textContent = `Lỗi: ${message}`
    setLog(message || 'Không thể tạo VC.', 'error')
  } finally {
    state.isCreatingVC = false
    createVcBtn.textContent = 'Create VC'
    updateCreateVcState()
  }
}

// =================== EVENT HANDLERS ===================
function addAttributeRow() {
  state.attributes.push(createAttribute('Thuộc tính', 'field'))
  updateCreateVcState()
  renderAttributes()
}

function resetAttributes() {
  state.attributes = getDefaultAttributes()
  renderAttributes()
  updateCreateVcState()
}

function setupEventListeners() {
  connectButton.addEventListener('click', connectWallet)
  registerForm.addEventListener('submit', registerIssuerDID)
  addAttributeBtn.addEventListener('click', addAttributeRow)
  resetAttributesBtn.addEventListener('click', resetAttributes)
  holderDidInput.addEventListener('input', updateCreateVcState)
  credentialTypeInput.addEventListener('input', updateCreateVcState)
  createVcBtn.addEventListener('click', createCredential)
}

function watchWalletChanges() {
  if (!window.ethereum) return

  window.ethereum.on('accountsChanged', (accounts: string[]) => {
    if (!accounts.length) {
      state.currentAccount = null
      state.provider = null
      state.issuerIdentifier = null
      accountStatus.textContent = 'Chưa kết nối'
      networkStatus.textContent = 'N/A'
      registerButton.disabled = true
      updateCreateVcState()
      setLog('Ví đã ngắt kết nối.')
      return
    }
    state.currentAccount = accounts[0].toLowerCase()
    accountStatus.textContent = state.currentAccount
    setLog('Tài khoản ví đã thay đổi. Vui lòng kết nối lại.')
    state.issuerIdentifier = null
    registerButton.disabled = true
    updateCreateVcState()
  })

  window.ethereum.on('chainChanged', () => {
    window.location.reload()
  })
}

// =================== INITIALIZATION ===================
function init() {
  state.attributes = getDefaultAttributes()
  setupEventListeners()
  watchWalletChanges()
  renderAttributes()
  updateCreateVcState()
  resetVcOutput()
  setLog('Sẵn sàng. Hãy kết nối ví để bắt đầu.')
}

// Start the app
init()
