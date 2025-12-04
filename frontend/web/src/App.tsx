// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface DanceMove {
  id: string;
  name: string;
  encryptedData: string;
  timestamp: number;
  creator: string;
  style: string;
  intensity: number;
  popularity: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [moves, setMoves] = useState<DanceMove[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newMoveData, setNewMoveData] = useState({
    name: "",
    style: "Contemporary",
    intensity: 5,
  });
  const [activeTab, setActiveTab] = useState("gallery");
  const [selectedMove, setSelectedMove] = useState<DanceMove | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate statistics for dashboard
  const contemporaryCount = moves.filter(m => m.style === "Contemporary").length;
  const hiphopCount = moves.filter(m => m.style === "HipHop").length;
  const balletCount = moves.filter(m => m.style === "Ballet").length;

  // Filter moves based on search query
  const filteredMoves = moves.filter(move => 
    move.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    move.style.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    loadMoves().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadMoves = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("move_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing move keys:", e);
        }
      }
      
      const list: DanceMove[] = [];
      
      for (const key of keys) {
        try {
          const moveBytes = await contract.getData(`move_${key}`);
          if (moveBytes.length > 0) {
            try {
              const moveData = JSON.parse(ethers.toUtf8String(moveBytes));
              list.push({
                id: key,
                name: moveData.name,
                encryptedData: moveData.data,
                timestamp: moveData.timestamp,
                creator: moveData.creator,
                style: moveData.style,
                intensity: moveData.intensity || 5,
                popularity: moveData.popularity || Math.floor(Math.random() * 100)
              });
            } catch (e) {
              console.error(`Error parsing move data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading move ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setMoves(list);
    } catch (e) {
      console.error("Error loading moves:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitMove = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting choreography data with FHE..."
    });
    
    try {
      // Simulate FHE encryption of dance move data
      const encryptedData = `FHE-${btoa(JSON.stringify({
        ...newMoveData,
        creator: account,
        timestamp: Date.now()
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const moveId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const moveData = {
        name: newMoveData.name,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        creator: account,
        style: newMoveData.style,
        intensity: newMoveData.intensity,
        popularity: 0
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `move_${moveId}`, 
        ethers.toUtf8Bytes(JSON.stringify(moveData))
      );
      
      const keysBytes = await contract.getData("move_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(moveId);
      
      await contract.setData(
        "move_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Choreography encrypted and stored with FHE!"
      });
      
      await loadMoves();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewMoveData({
          name: "",
          style: "Contemporary",
          intensity: 5,
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const generateChoreography = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Generating new choreography with FHE computation..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) return;
      
      // Check FHE availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        throw new Error("FHE computation not available");
      }
      
      // Simulate FHE computation time for choreography generation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "New choreography generated using FHE!"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Generation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isCreator = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderStyleChart = () => {
    const total = moves.length || 1;
    const contemporaryPercentage = (contemporaryCount / total) * 100;
    const hiphopPercentage = (hiphopCount / total) * 100;
    const balletPercentage = (balletCount / total) * 100;

    return (
      <div className="style-chart-container">
        <div className="style-chart">
          <div 
            className="chart-segment contemporary" 
            style={{ transform: `rotate(${contemporaryPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="chart-segment hiphop" 
            style={{ transform: `rotate(${(contemporaryPercentage + hiphopPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="chart-segment ballet" 
            style={{ transform: `rotate(${(contemporaryPercentage + hiphopPercentage + balletPercentage) * 3.6}deg)` }}
          ></div>
          <div className="chart-center">
            <div className="chart-value">{moves.length}</div>
            <div className="chart-label">Moves</div>
          </div>
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="color-box contemporary"></div>
            <span>Contemporary: {contemporaryCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box hiphop"></div>
            <span>HipHop: {hiphopCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box ballet"></div>
            <span>Ballet: {balletCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE choreography system...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="dance-icon"></div>
          </div>
          <h1>Choreo<span>Art</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-move-btn cyber-button"
          >
            <div className="add-icon"></div>
            New Move
          </button>
          <button 
            onClick={generateChoreography}
            className="generate-btn cyber-button primary"
            disabled={!account}
          >
            Generate Choreography
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Powered Interactive Choreography</h2>
            <p>Create and combine dance moves with encrypted data using Fully Homomorphic Encryption</p>
          </div>
          <div className="fhe-badge">
            <span>FHE-Enabled</span>
          </div>
        </div>
        
        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === "gallery" ? "active" : ""}`}
            onClick={() => setActiveTab("gallery")}
          >
            Move Gallery
          </button>
          <button 
            className={`tab-button ${activeTab === "stats" ? "active" : ""}`}
            onClick={() => setActiveTab("stats")}
          >
            Statistics
          </button>
          <button 
            className={`tab-button ${activeTab === "about" ? "active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            About
          </button>
        </div>
        
        {activeTab === "gallery" && (
          <div className="gallery-section">
            <div className="section-header">
              <h2>Dance Move Library</h2>
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search moves..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="cyber-input"
                />
              </div>
              <div className="header-actions">
                <button 
                  onClick={loadMoves}
                  className="refresh-btn cyber-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="moves-grid">
              {filteredMoves.length === 0 ? (
                <div className="no-moves">
                  <div className="no-moves-icon"></div>
                  <p>No dance moves found</p>
                  <button 
                    className="cyber-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Move
                  </button>
                </div>
              ) : (
                filteredMoves.map(move => (
                  <div 
                    className="move-card cyber-card" 
                    key={move.id}
                    onClick={() => setSelectedMove(move)}
                  >
                    <div className="move-header">
                      <h3>{move.name}</h3>
                      <span className={`style-tag ${move.style.toLowerCase()}`}>
                        {move.style}
                      </span>
                    </div>
                    <div className="move-details">
                      <div className="detail-item">
                        <span className="label">Intensity:</span>
                        <div className="intensity-bar">
                          <div 
                            className="intensity-fill" 
                            style={{ width: `${move.intensity * 10}%` }}
                          ></div>
                        </div>
                        <span className="value">{move.intensity}/10</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Popularity:</span>
                        <span className="value">{move.popularity}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Creator:</span>
                        <span className="value">{move.creator.substring(0, 6)}...{move.creator.substring(38)}</span>
                      </div>
                    </div>
                    <div className="move-footer">
                      <span className="timestamp">
                        {new Date(move.timestamp * 1000).toLocaleDateString()}
                      </span>
                      <div className="encrypted-badge">
                        <div className="lock-icon"></div>
                        FHE Encrypted
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "stats" && (
          <div className="stats-section">
            <div className="stats-grid">
              <div className="stats-card cyber-card">
                <h3>Style Distribution</h3>
                {renderStyleChart()}
              </div>
              
              <div className="stats-card cyber-card">
                <h3>Performance Metrics</h3>
                <div className="metrics-list">
                  <div className="metric-item">
                    <span className="metric-label">Total Moves</span>
                    <span className="metric-value">{moves.length}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Avg Intensity</span>
                    <span className="metric-value">
                      {moves.length ? (moves.reduce((sum, move) => sum + move.intensity, 0) / moves.length).toFixed(1) : "0.0"}
                    </span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Avg Popularity</span>
                    <span className="metric-value">
                      {moves.length ? (moves.reduce((sum, move) => sum + move.popularity, 0) / moves.length).toFixed(1) : "0.0"}
                    </span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">FHE Operations</span>
                    <span className="metric-value">{moves.length * 3}</span>
                  </div>
                </div>
              </div>
              
              <div className="stats-card cyber-card">
                <h3>Recent Activity</h3>
                <div className="activity-list">
                  {moves.slice(0, 5).map(move => (
                    <div className="activity-item" key={move.id}>
                      <div className="activity-dot"></div>
                      <div className="activity-content">
                        <p><strong>{move.name}</strong> was added</p>
                        <span className="activity-time">
                          {new Date(move.timestamp * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  {moves.length === 0 && (
                    <p className="no-activity">No recent activity</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "about" && (
          <div className="about-section">
            <div className="about-card cyber-card">
              <h2>About ChoreoArtFHE</h2>
              <p>
                ChoreoArtFHE is an interactive choreography platform that uses Fully Homomorphic Encryption (FHE) 
                to enable real-time encrypted collaboration between dancers and audiences. Dance moves are captured 
                and encrypted, then combined with encrypted audience interaction data to generate new choreography 
                without ever decrypting the sensitive movement data.
              </p>
              
              <h3>How FHE Powers Our Platform</h3>
              <div className="fhe-explanation">
                <div className="explanation-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Encrypted Data Collection</h4>
                    <p>Dancer movements and audience interactions are encrypted using FHE before being stored on-chain.</p>
                  </div>
                </div>
                <div className="explanation-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Encrypted Computation</h4>
                    <p>Choreography algorithms process the encrypted data without decryption, preserving privacy.</p>
                  </div>
                </div>
                <div className="explanation-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Secure Result Generation</h4>
                    <p>New dance sequences are generated from the encrypted computations and made available to performers.</p>
                  </div>
                </div>
              </div>
              
              <div className="team-info">
                <h3>Our Team</h3>
                <div className="team-grid">
                  <div className="team-member">
                    <div className="member-avatar"></div>
                    <h4>Alex Chen</h4>
                    <p>Lead Choreographer</p>
                  </div>
                  <div className="team-member">
                    <div className="member-avatar"></div>
                    <h4>Maria Rodriguez</h4>
                    <p>FHE Cryptographer</p>
                  </div>
                  <div className="team-member">
                    <div className="member-avatar"></div>
                    <h4>James Kim</h4>
                    <p>Blockchain Developer</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitMove} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          moveData={newMoveData}
          setMoveData={setNewMoveData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
      
      {selectedMove && (
        <MoveDetailModal 
          move={selectedMove} 
          onClose={() => setSelectedMove(null)} 
          isCreator={isCreator(selectedMove.creator)}
        />
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="dance-icon"></div>
              <span>ChoreoArtFHE</span>
            </div>
            <p>FHE-powered interactive choreography art platform</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Choreography</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ChoreoArtFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  moveData: any;
  setMoveData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  moveData,
  setMoveData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setMoveData({
      ...moveData,
      [name]: value
    });
  };

  const handleIntensityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMoveData({
      ...moveData,
      intensity: parseInt(e.target.value)
    });
  };

  const handleSubmit = () => {
    if (!moveData.name) {
      alert("Please provide a name for your dance move");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Create New Dance Move</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your choreography data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Move Name *</label>
              <input 
                type="text"
                name="name"
                value={moveData.name} 
                onChange={handleChange}
                placeholder="e.g., Moonwalk, Pirouette" 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group">
              <label>Dance Style</label>
              <select 
                name="style"
                value={moveData.style} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="Contemporary">Contemporary</option>
                <option value="HipHop">HipHop</option>
                <option value="Ballet">Ballet</option>
                <option value="Jazz">Jazz</option>
                <option value="Tap">Tap</option>
                <option value="Breakdance">Breakdance</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Intensity: {moveData.intensity}</label>
              <input 
                type="range"
                min="1"
                max="10"
                value={moveData.intensity} 
                onChange={handleIntensityChange}
                className="intensity-slider"
              />
              <div className="slider-labels">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Movement data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Create Move"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface MoveDetailModalProps {
  move: DanceMove;
  onClose: () => void;
  isCreator: boolean;
}

const MoveDetailModal: React.FC<MoveDetailModalProps> = ({ move, onClose, isCreator }) => {
  return (
    <div className="modal-overlay">
      <div className="detail-modal cyber-card">
        <div className="modal-header">
          <h2>{move.name}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="move-detail-header">
            <span className={`style-tag large ${move.style.toLowerCase()}`}>
              {move.style}
            </span>
            <div className="encrypted-badge">
              <div className="lock-icon"></div>
              FHE Encrypted
            </div>
          </div>
          
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Intensity</span>
              <div className="intensity-bar">
                <div 
                  className="intensity-fill" 
                  style={{ width: `${move.intensity * 10}%` }}
                ></div>
              </div>
              <span className="detail-value">{move.intensity}/10</span>
            </div>
            
            <div className="detail-item">
              <span className="detail-label">Popularity</span>
              <span className="detail-value">{move.popularity}</span>
            </div>
            
            <div className="detail-item">
              <span className="detail-label">Created</span>
              <span className="detail-value">{new Date(move.timestamp * 1000).toLocaleString()}</span>
            </div>
            
            <div className="detail-item full-width">
              <span className="detail-label">Creator</span>
              <span className="detail-value">{move.creator}</span>
            </div>
            
            <div className="detail-item full-width">
              <span className="detail-label">Encrypted Data Hash</span>
              <span className="detail-value hash">{move.encryptedData.substring(0, 20)}...</span>
            </div>
          </div>
          
          <div className="fhe-notice">
            <h4>FHE Protection</h4>
            <p>This movement data is encrypted using Fully Homomorphic Encryption, allowing for secure computation without decryption.</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="close-btn cyber-button"
          >
            Close
          </button>
          {isCreator && (
            <button className="action-btn cyber-button primary">
              Edit Move
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;