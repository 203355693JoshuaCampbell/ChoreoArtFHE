// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ChoreoArtFHE is SepoliaConfig {
    struct EncryptedMovement {
        uint256 id;
        euint32 encryptedX;       // Encrypted X coordinate
        euint32 encryptedY;       // Encrypted Y coordinate
        euint32 encryptedZ;       // Encrypted Z coordinate
        euint32 encryptedEnergy;  // Encrypted movement energy
        uint256 timestamp;
    }
    
    struct EncryptedAudienceInput {
        uint256 id;
        euint32 encryptedPreference; // Encrypted audience preference
        euint32 encryptedIntensity;  // Encrypted interaction intensity
        uint256 timestamp;
    }
    
    struct ChoreographyStep {
        euint32 encryptedNextX;
        euint32 encryptedNextY;
        euint32 encryptedNextZ;
        bool isGenerated;
    }

    uint256 public movementCount;
    uint256 public audienceInputCount;
    mapping(uint256 => EncryptedMovement) public dancerMovements;
    mapping(uint256 => EncryptedAudienceInput) public audienceInputs;
    mapping(uint256 => ChoreographyStep) public choreographySteps;
    
    mapping(uint256 => uint256) private requestToMovementId;
    mapping(uint256 => uint256) private requestToInputId;
    
    event MovementCaptured(uint256 indexed id, uint256 timestamp);
    event AudienceInputReceived(uint256 indexed id, uint256 timestamp);
    event ChoreographyGenerated(uint256 indexed stepId, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    
    modifier onlyDancer(uint256 movementId) {
        _;
    }
    
    modifier onlyAudience(uint256 inputId) {
        _;
    }
    
    function captureEncryptedMovement(
        euint32 encryptedX,
        euint32 encryptedY,
        euint32 encryptedZ,
        euint32 encryptedEnergy
    ) public {
        movementCount += 1;
        uint256 newId = movementCount;
        
        dancerMovements[newId] = EncryptedMovement({
            id: newId,
            encryptedX: encryptedX,
            encryptedY: encryptedY,
            encryptedZ: encryptedZ,
            encryptedEnergy: encryptedEnergy,
            timestamp: block.timestamp
        });
        
        emit MovementCaptured(newId, block.timestamp);
    }
    
    function submitAudienceInput(
        euint32 encryptedPreference,
        euint32 encryptedIntensity
    ) public {
        audienceInputCount += 1;
        uint256 newId = audienceInputCount;
        
        audienceInputs[newId] = EncryptedAudienceInput({
            id: newId,
            encryptedPreference: encryptedPreference,
            encryptedIntensity: encryptedIntensity,
            timestamp: block.timestamp
        });
        
        emit AudienceInputReceived(newId, block.timestamp);
    }
    
    function generateChoreographyStep(uint256 movementId, uint256 inputId) public {
        EncryptedMovement storage movement = dancerMovements[movementId];
        EncryptedAudienceInput storage input = audienceInputs[inputId];
        
        // Generate new choreography step using FHE operations
        euint32 newX = FHE.add(
            FHE.mul(movement.encryptedX, input.encryptedPreference),
            FHE.mul(FHE.asEuint32(100), input.encryptedIntensity)
        );
        
        euint32 newY = FHE.add(
            FHE.mul(movement.encryptedY, input.encryptedIntensity),
            FHE.div(movement.encryptedEnergy, FHE.asEuint32(2))
        );
        
        euint32 newZ = FHE.add(
            FHE.mul(movement.encryptedZ, input.encryptedPreference),
            movement.encryptedEnergy
        );
        
        choreographySteps[movementId] = ChoreographyStep({
            encryptedNextX: newX,
            encryptedNextY: newY,
            encryptedNextZ: newZ,
            isGenerated: true
        });
        
        emit ChoreographyGenerated(movementId, block.timestamp);
    }
    
    function requestMovementDecryption(uint256 movementId) public onlyDancer(movementId) {
        EncryptedMovement storage movement = dancerMovements[movementId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(movement.encryptedX);
        ciphertexts[1] = FHE.toBytes32(movement.encryptedY);
        ciphertexts[2] = FHE.toBytes32(movement.encryptedZ);
        ciphertexts[3] = FHE.toBytes32(movement.encryptedEnergy);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMovement.selector);
        requestToMovementId[reqId] = movementId;
        
        emit DecryptionRequested(movementId);
    }
    
    function decryptMovement(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 movementId = requestToMovementId[requestId];
        require(movementId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted movement data as needed
        uint32[] memory coords = abi.decode(cleartexts, (uint32[]));
    }
    
    function requestInputDecryption(uint256 inputId) public onlyAudience(inputId) {
        EncryptedAudienceInput storage input = audienceInputs[inputId];
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(input.encryptedPreference);
        ciphertexts[1] = FHE.toBytes32(input.encryptedIntensity);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptInput.selector);
        requestToInputId[reqId] = inputId;
        
        emit DecryptionRequested(inputId);
    }
    
    function decryptInput(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 inputId = requestToInputId[requestId];
        require(inputId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted input data as needed
        uint32[] memory inputs = abi.decode(cleartexts, (uint32[]));
    }
    
    function requestStepDecryption(uint256 stepId) public {
        ChoreographyStep storage step = choreographySteps[stepId];
        require(step.isGenerated, "Step not generated");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(step.encryptedNextX);
        ciphertexts[1] = FHE.toBytes32(step.encryptedNextY);
        ciphertexts[2] = FHE.toBytes32(step.encryptedNextZ);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptStep.selector);
        requestToMovementId[reqId] = stepId;
    }
    
    function decryptStep(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 stepId = requestToMovementId[requestId];
        require(stepId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted step data as needed
        uint32[] memory coords = abi.decode(cleartexts, (uint32[]));
    }
    
    function getLatestChoreographyStep(uint256 dancerId) public view returns (
        bool isGenerated
    ) {
        return choreographySteps[dancerId].isGenerated;
    }
    
    function combineMovements(uint256 movementId1, uint256 movementId2) public {
        EncryptedMovement storage m1 = dancerMovements[movementId1];
        EncryptedMovement storage m2 = dancerMovements[movementId2];
        
        euint32 combinedX = FHE.add(m1.encryptedX, m2.encryptedX);
        euint32 combinedY = FHE.add(m1.encryptedY, m2.encryptedY);
        euint32 combinedZ = FHE.add(m1.encryptedZ, m2.encryptedZ);
        
        // Store or use the combined movement data
    }
}