// Sandwich Attack Detection Tool for Solana
// This script connects to a Solana RPC node and monitors for potential sandwich attack conditions

import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { Jupiter } from '@jup-ag/core';
import { TokenListProvider } from '@solana/spl-token-registry';
import { config, dexProgramIds } from '/src/js/config.js';

console.log('Sandwich Attack Detector script loaded');
console.log('Config loaded:', config);

// Initialize connection
const connection = new Connection(config.rpcEndpoint);
let jupiter = null;
let tokenMap = new Map();
let userWallet = null;
let isMonitoring = false;
let recentPoolActivity = new Map(); // Track activity in pools

// UI Elements
let connectWalletBtn, startMonitoringBtn, stopMonitoringBtn, alertsContainer, statusDisplay;

// Initialize DOM elements when they're available
function initDomElements() {
  console.log('Initializing DOM elements');
  connectWalletBtn = document.getElementById('connect-wallet');
  startMonitoringBtn = document.getElementById('start-monitoring');
  stopMonitoringBtn = document.getElementById('stop-monitoring');
  alertsContainer = document.getElementById('alerts-container');
  statusDisplay = document.getElementById('status');
  
  console.log('DOM elements initialized:', {
    connectWalletBtn: !!connectWalletBtn,
    startMonitoringBtn: !!startMonitoringBtn,
    stopMonitoringBtn: !!stopMonitoringBtn,
    alertsContainer: !!alertsContainer,
    statusDisplay: !!statusDisplay
  });
}

// Initialize Jupiter and token list
async function initialize() {
  console.log('Starting initialization');
  try {
    if (statusDisplay) {
      statusDisplay.textContent = 'Initializing...';
    } else {
      console.error('Status display element not found');
    }
    
    // Load token list
    console.log('Loading token list');
    const tokenListProvider = new TokenListProvider();
    const tokenList = await tokenListProvider.resolve();
    const tokens = tokenList.filterByClusterSlug('mainnet-beta').getList();
    
    tokens.forEach(token => {
      tokenMap.set(token.address, token);
    });
    console.log(`Loaded ${tokenMap.size} tokens`);
    
    // Initialize Jupiter
    console.log('Initializing Jupiter');
    jupiter = await Jupiter.load({
      connection,
      cluster: 'mainnet-beta',
    });
    console.log('Jupiter initialized');
    
    if (statusDisplay && startMonitoringBtn) {
      statusDisplay.textContent = 'Initialized successfully';
      startMonitoringBtn.disabled = false;
    }
    console.log('Initialization complete');
  } catch (error) {
    console.error('Initialization error details:', error);
    if (statusDisplay) {
      statusDisplay.textContent = `Initialization error: ${error.message}`;
    }
    console.error('Initialization error:', error);
  }
}

// Check if Phantom wallet is installed
function isPhantomInstalled() {
  return window.phantom?.solana?.isPhantom;
}

// Connect Phantom wallet function - improved implementation
async function connectWallet() {
  try {
    // Check if Phantom is installed
    if (!isPhantomInstalled()) {
      throw new Error('Phantom wallet not found. Please install the Phantom extension.');
    }

    // Request connection to the user's Phantom wallet
    const provider = window.phantom.solana;
    
    // Try to connect if not already connected
    const response = await provider.connect();
    userWallet = new PublicKey(response.publicKey.toString());
    
    // Update UI to show connected state
    connectWalletBtn.textContent = `Connected: ${userWallet.toString().substring(0, 4)}...${userWallet.toString().substring(userWallet.toString().length - 4)}`;
    statusDisplay.textContent = 'Wallet connected';
    createAlert('success', 'Phantom wallet connected successfully!');
    
    // Enable the start monitoring button
    startMonitoringBtn.disabled = false;
    
    // Set up disconnect event listener
    provider.on('disconnect', () => {
      userWallet = null;
      connectWalletBtn.textContent = 'Connect Wallet';
      statusDisplay.textContent = 'Wallet disconnected';
      startMonitoringBtn.disabled = true;
      if (isMonitoring) {
        stopMonitoring();
      }
      createAlert('warning', 'Wallet disconnected');
    });
    
    // Set up account change event listener
    provider.on('accountChanged', (publicKey) => {
      if (publicKey) {
        userWallet = new PublicKey(publicKey.toString());
        connectWalletBtn.textContent = `Connected: ${userWallet.toString().substring(0, 4)}...${userWallet.toString().substring(userWallet.toString().length - 4)}`;
        statusDisplay.textContent = 'Wallet account changed';
        createAlert('info', 'Wallet account changed');
      } else {
        // Phantom sometimes gives null when disconnecting
        userWallet = null;
        connectWalletBtn.textContent = 'Connect Wallet';
        statusDisplay.textContent = 'Wallet disconnected';
        startMonitoringBtn.disabled = true;
        if (isMonitoring) {
          stopMonitoring();
        }
        createAlert('warning', 'Wallet disconnected');
      }
    });
    
  } catch (error) {
    console.error('Wallet connection error:', error);
    statusDisplay.textContent = `Wallet connection error: ${error.message}`;
    createAlert('danger', `Failed to connect wallet: ${error.message}`);
  }
}

// Start monitoring for potential sandwich attacks
async function startMonitoring() {
  if (!userWallet) {
    createAlert('error', 'Please connect your wallet first');
    return;
  }
  
  isMonitoring = true;
  statusDisplay.textContent = 'Monitoring active';
  startMonitoringBtn.disabled = true;
  stopMonitoringBtn.disabled = false;
  
  // Start monitoring mempool
  monitorMempool();
  
  // Start monitoring transactions in user's account
  monitorUserTransactions();
  
  createAlert('info', 'Monitoring active. You will be alerted of potential sandwich attacks.');
}

// Stop monitoring
function stopMonitoring() {
  isMonitoring = false;
  statusDisplay.textContent = 'Monitoring stopped';
  startMonitoringBtn.disabled = false;
  stopMonitoringBtn.disabled = true;
  createAlert('info', 'Monitoring stopped');
}

// Monitor mempool for pending transactions
async function monitorMempool() {
  while (isMonitoring) {
    try {
      // In a real implementation, you would use a websocket connection to monitor the mempool
      // For now, we'll simulate by checking recent confirmed transactions and analyzing patterns
      
      const signatures = await connection.getSignaturesForAddress(userWallet);
      
      // For each recent transaction signature
      for (const signatureInfo of signatures.slice(0, 10)) {
        // Skip if we've already processed this transaction
        if (signatureInfo.processed) continue;
        
        // Get transaction details
        const transaction = await connection.getTransaction(signatureInfo.signature);
        if (!transaction) continue;
        
        // Analyze for swap transactions
        if (isSwapTransaction(transaction)) {
          // Check for indicators of a potential sandwich attack
          const riskAssessment = assessSandwichRisk(transaction);
          
          if (riskAssessment.risk === 'high') {
            createAlert('danger', `⚠️ High Risk of Sandwich Attack: ${riskAssessment.reason}`);
          } else if (riskAssessment.risk === 'medium') {
            createAlert('warning', `⚠️ Possible Sandwich Risk: ${riskAssessment.reason}`);
          }
          
          // Mark as processed
          signatureInfo.processed = true;
        }
      }
      
      // Pause before next check
      await new Promise(resolve => setTimeout(resolve, config.refreshRate));
    } catch (error) {
      console.error('Error monitoring mempool:', error);
      statusDisplay.textContent = `Monitoring error: ${error.message}`;
      await new Promise(resolve => setTimeout(resolve, config.refreshRate * 5)); // Longer pause on error
    }
  }
}

// Monitor user's own transactions
async function monitorUserTransactions() {
  if (!userWallet) return;
  
  // Subscribe to account changes
  const subscriptionId = connection.onAccountChange(
    userWallet,
    async (accountInfo, context) => {
      if (!isMonitoring) {
        connection.removeAccountChangeListener(subscriptionId);
        return;
      }
      
      // Get recent transactions
      const signatures = await connection.getSignaturesForAddress(userWallet, { limit: 5 });
      
      for (const sigInfo of signatures) {
        const tx = await connection.getTransaction(sigInfo.signature);
        if (!tx) continue;
        
        // Check specifically for DEX interactions
        if (isDexInteraction(tx)) {
          // Calculate price impact
          const priceImpact = calculatePriceImpact(tx);
          
          if (priceImpact > config.priceImpactWarningThreshold) {
            createAlert('warning', `Transaction had ${priceImpact.toFixed(2)}% price impact. Potential sandwich attack.`);
            
            // Provide suggestions
            createAlert('info', 'Suggestions: Use lower slippage tolerance or private RPC endpoints to protect against sandwiching');
          }
        }
      }
    }
  );
}

// Determine if a transaction is a swap on a DEX
function isSwapTransaction(transaction) {
  // Check the program IDs against known DEX programs
  const programIds = transaction.transaction.message.programIds().map(p => p.toString());
  
  // Check for common Solana DEX program IDs
  return programIds.some(pid => dexProgramIds.includes(pid));
}

// Determine if transaction is interacting with a DEX
function isDexInteraction(transaction) {
  // Similar to isSwapTransaction but can be more specific
  return isSwapTransaction(transaction);
}

// Calculate estimated price impact from a transaction
function calculatePriceImpact(transaction) {
  // In a real implementation, you would decode the transaction instructions
  // and calculate the actual price impact.
  // For this prototype, we'll return a random value for demonstration
  return Math.random() * 2; // Random value between 0-2%
}

// Assess risk of a transaction being sandwiched
function assessSandwichRisk(transaction) {
  // In a real implementation, you would:
  // 1. Look at pool liquidity
  // 2. Check transaction size relative to pool
  // 3. Monitor for unusual activity in the pool
  // 4. Check slippage settings
  
  // For this prototype, we'll use a simple heuristic
  const poolId = extractPoolId(transaction);
  
  if (poolId) {
    // Track activity in this pool
    if (!recentPoolActivity.has(poolId)) {
      recentPoolActivity.set(poolId, []);
    }
    
    const now = Date.now();
    const recentActivity = recentPoolActivity.get(poolId);
    
    // Add this transaction
    recentActivity.push(now);
    
    // Remove old activity
    const relevantTimeWindow = now - (config.timeWindow * 1000);
    const filteredActivity = recentActivity.filter(time => time >= relevantTimeWindow);
    recentPoolActivity.set(poolId, filteredActivity);
    
    // If there's a lot of activity in this pool in a short time, that's suspicious
    if (filteredActivity.length >= config.poolActivityThreshold) {
      return {
        risk: 'high',
        reason: `Unusual activity detected in pool: ${filteredActivity.length} transactions in ${config.timeWindow}s`
      };
    }
    
    // Check transaction size
    const txSize = estimateTransactionSize(transaction);
    if (txSize > 1000) { // SOL value or token amount, arbitrary threshold for demo
      return {
        risk: 'medium',
        reason: 'Large transaction size relative to pool liquidity'
      };
    }
  }
  
  return { risk: 'low', reason: 'No suspicious patterns detected' };
}

// Extract pool ID from transaction (simplified)
function extractPoolId(transaction) {
  // In a real implementation, you would decode the transaction to get the actual pool ID
  // For this prototype, we'll return a mock ID
  return 'pool-' + Math.floor(Math.random() * 5);
}

// Estimate transaction size (simplified)
function estimateTransactionSize(transaction) {
  // In a real implementation, you would decode the transaction to get the actual size
  // For this prototype, we'll return a random value
  return Math.random() * 2000;
}

// Create an alert in the UI
function createAlert(type, message) {
  if (!alertsContainer) return;
  
  const alertElement = document.createElement('div');
  alertElement.className = `alert alert-${type}`;
  alertElement.textContent = message;
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'close-alert';
  closeButton.innerHTML = '&times;';
  closeButton.onclick = function() {
    alertsContainer.removeChild(alertElement);
  };
  
  alertElement.appendChild(closeButton);
  alertsContainer.prepend(alertElement);
  
  // Auto-remove after 30 seconds
  setTimeout(() => {
    if (alertElement.parentNode === alertsContainer) {
      alertsContainer.removeChild(alertElement);
    }
  }, 30000);
}

// Update settings from UI
function updateSettings() {
  config.slippageThreshold = parseFloat(document.getElementById('slippage').value);
  config.priceImpactWarningThreshold = parseFloat(document.getElementById('price-impact').value);
  config.poolActivityThreshold = parseInt(document.getElementById('pool-activity').value);
  config.timeWindow = parseInt(document.getElementById('time-window').value);
  
  createAlert('success', 'Settings updated');
}

// Initialize the application
function init() {
  initDomElements();
  
  // Add event listeners
  if (connectWalletBtn) connectWalletBtn.addEventListener('click', connectWallet);
  if (startMonitoringBtn) startMonitoringBtn.addEventListener('click', startMonitoring);
  if (stopMonitoringBtn) stopMonitoringBtn.addEventListener('click', stopMonitoring);
  
  // Add listeners for settings updates
  const slippageInput = document.getElementById('slippage');
  const priceImpactInput = document.getElementById('price-impact');
  const poolActivityInput = document.getElementById('pool-activity');
  const timeWindowInput = document.getElementById('time-window');
  
  if (slippageInput) slippageInput.addEventListener('change', updateSettings);
  if (priceImpactInput) priceImpactInput.addEventListener('change', updateSettings);
  if (poolActivityInput) poolActivityInput.addEventListener('change', updateSettings);
  if (timeWindowInput) timeWindowInput.addEventListener('change', updateSettings);
  
  // Initialize the app
  initialize();
}

// Execute initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export functions for testing
export {
  connectWallet,
  startMonitoring,
  stopMonitoring,
  assessSandwichRisk,
  isPhantomInstalled,
  init
}; 