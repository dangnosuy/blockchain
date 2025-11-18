// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * DIDRegistry - Improved version
 * Lưu trữ mapping giữa DID và IPFS CID
 * Với thêm features để debug và kiểm tra
 */
contract DIDRegistry {
    // Mapping: DID string -> IPFS CID string
    mapping(string => string) private didToCid;
    
    // Mapping: DID string -> có tồn tại hay không
    mapping(string => bool) private didExists;

    // CẢI THIỆN 1: Thêm mapping để quản lý quyền sở hữu
    mapping(string => address) private didOwner;
    
    // Array lưu tất cả DIDs đã register (để debug)
    string[] private registeredDIDs;
    
    // Owner của contract
    address public owner;
    
    // Events
    event DIDRegistered(bytes32 indexed didHash, string did, string cid, address indexed registrar);
    event DIDUpdated(bytes32 indexed didHash, string did, string newCid, address indexed updater);
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * Register một DID mới với IPFS CID
     * Cho phép update nếu DID đã tồn tại
     */
    function registerDID(string calldata did, string calldata cid) public {
        require(bytes(did).length > 0, "DID cannot be empty");
        require(bytes(cid).length > 0, "CID cannot be empty");
        
        bool isNew = !didExists[did];
        
        // Lưu vào mapping
        didToCid[did] = cid;
        didExists[did] = true;
        
        // Nếu DID mới, thêm vào array
        if (isNew) {
            // Lần đầu đăng ký, gán quyền sở hữu cho người gọi
            didOwner[did] = msg.sender;
            registeredDIDs.push(did);
            emit DIDRegistered(keccak256(bytes(did)), did, cid, msg.sender);
        } else {
            // CẢI THIỆN 2: Kiểm tra quyền sở hữu trước khi cho update
            require(didOwner[did] == msg.sender, "DIDRegistry: Not authorized to update");
            emit DIDUpdated(keccak256(bytes(did)), did, cid, msg.sender);
        }
        // Cập nhật dữ liệu
        didToCid[did] = cid;
        didExists[did] = true;
    }
    /**
     * CẢI THIỆN 3: Thêm hàm tra cứu owner của DID (rất hữu ích)
     */
    function getDIDOwner(string calldata did) public view returns (address) {
        return didOwner[did];
    }
    
    /**
     * Resolve DID → CID
     * Trả về empty string nếu DID không tồn tại
     */
    function resolveDID(string calldata did) public view returns (string memory) {
        return didToCid[did];
    }
    
    /**
     * Kiểm tra DID có tồn tại không
     */
    function didIsRegistered(string calldata did) public view returns (bool) {
        return didExists[did];
    }
    
    /**
     * Lấy tổng số DIDs đã register
     */
    function getTotalDIDs() public view returns (uint256) {
        return registeredDIDs.length;
    }
    
    /**
     * Lấy DID tại index (để debug)
     */
    function getDIDAtIndex(uint256 index) public view returns (string memory) {
        require(index < registeredDIDs.length, "Index out of bounds");
        return registeredDIDs[index];
    }
    
    /**
     * Lấy tất cả DIDs (cẩn thận với gas nếu có nhiều DIDs)
     */
    function getAllDIDs() public view returns (string[] memory) {
        return registeredDIDs;
    }
}
