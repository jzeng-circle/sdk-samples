/**
 * Stablecoin Acquiring — Express server with simple frontend
 * Run: npm start
 */

import express from 'express';
import { createPaymentSession, monitorPayment, aggregateToInternalWallet } from './acquiring.js';
import { calculateAmounts, INTERNAL_WALLET_ADDRESS, PLATFORM_FEE_PERCENT, PLATFORM_FEE_ADDRESS, MERCHANT_ADDRESS, MERCHANT_SETTLEMENT_CHAIN } from './config.js';
import type { PaymentSession } from './types.js';

const app = express();
app.use(express.json());

// In-memory session store (replace with DB in production)
const sessions = new Map<string, PaymentSession>();

// ===========================
// FRONTEND
// ===========================

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stablecoin Acquiring — Ethers Adapter</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #1a1a1a; padding: 24px; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 0.875rem; margin-bottom: 16px; }
    .tag { background: #e8f4fd; color: #1a6fa8; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 20px; }
    .card { background: white; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px; }
    input, select { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; margin-bottom: 12px; }
    button { background: #1a6fa8; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 0.875rem; cursor: pointer; width: 100%; }
    button:hover { background: #155d8f; }
    button:disabled { background: #9ca3af; cursor: not-allowed; }
    .result { margin-top: 16px; padding: 12px; border-radius: 6px; font-size: 0.875rem; display: none; }
    .result.success { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
    .result.error { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
    .address-box { background: #f9fafb; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 0.8rem; word-break: break-all; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; font-size: 0.8rem; padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
    .row:last-child { border-bottom: none; }
    .row span:last-child { font-weight: 500; }
    .spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid #93c5fd; border-top-color: #1d4ed8; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 6px; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Collapsible internal reference */
    .collapsible-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
    .collapsible-header .title { font-size: 0.8rem; font-weight: 600; color: #555; }
    .collapsible-header .chevron { font-size: 0.7rem; color: #888; transition: transform 0.2s; }
    .collapsible-header.open .chevron { transform: rotate(180deg); }
    .collapsible-body { display: none; margin-top: 16px; }
    .collapsible-body.open { display: block; }

    /* Fund flow diagram */
    .flow { display: flex; flex-direction: column; gap: 0; }
    .flow-step { display: flex; align-items: stretch; gap: 0; }
    .flow-node { flex: 1; border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px 12px; background: #f9fafb; }
    .flow-node.active { border-color: #93c5fd; background: #eff6ff; }
    .flow-node.done { border-color: #86efac; background: #f0fdf4; }
    .flow-node-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #888; margin-bottom: 2px; }
    .flow-node.active .flow-node-label { color: #1d4ed8; }
    .flow-node.done .flow-node-label { color: #166534; }
    .flow-node-addr { font-family: monospace; font-size: 0.7rem; color: #444; word-break: break-all; }
    .flow-node-chain { font-size: 0.68rem; color: #888; margin-top: 2px; }
    .flow-node-tx { font-size: 0.68rem; margin-top: 6px; }
    .flow-node-tx a { color: #1a6fa8; text-decoration: none; font-family: monospace; }
    .flow-node-tx a:hover { text-decoration: underline; }
    .flow-connector { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 48px; flex-shrink: 0; gap: 2px; padding: 4px 0; }
    .flow-arrow { color: #9ca3af; font-size: 1rem; line-height: 1; }
    .flow-arrow.active { color: #1d4ed8; }
    .flow-arrow.done { color: #16a34a; }
    .flow-tx-label { font-size: 0.6rem; color: #9ca3af; text-align: center; white-space: nowrap; }
    .flow-tx-label.active { color: #1d4ed8; }
    .flow-tx-label.done { color: #16a34a; }
    .flow-spinner { width: 10px; height: 10px; border: 2px solid #bfdbfe; border-top-color: #1d4ed8; border-radius: 50%; animation: spin 0.8s linear infinite; }
    .flow-check { color: #16a34a; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Stablecoin Acquiring</h1>
    <p class="subtitle">Accept stablecoin payments and settle USDC to merchant</p>
    <span class="tag">Ethers Adapter</span>

    <!-- Collapsible internal reference with fund flow diagram -->
    <div class="card">
      <div class="collapsible-header" onclick="toggleInfo(this)">
        <span class="title">Internal Reference</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="collapsible-body">
        <div class="flow">

          <!-- Node: Temp wallet (receiving) -->
          <div class="flow-step">
            <div class="flow-node" id="node-temp">
              <div class="flow-node-label">Receiving Wallet (temp)</div>
              <div class="flow-node-addr" id="addr-temp">Generated per payment request</div>
              <div class="flow-node-chain" id="chain-temp"></div>
              <div class="flow-node-tx" id="tx-customer" style="display:none"></div>
            </div>
          </div>

          <!-- Arrow: customer → temp -->
          <div class="flow-step">
            <div class="flow-connector" id="conn-aggregate">
              <span class="flow-arrow" id="arrow-aggregate">&#8595;</span>
              <span class="flow-tx-label" id="label-aggregate">sweep</span>
            </div>
          </div>

          <!-- Node: Internal (aggregation) -->
          <div class="flow-step">
            <div class="flow-node" id="node-internal">
              <div class="flow-node-label">Aggregation Wallet (internal)</div>
              <div class="flow-node-addr" id="addr-internal">—</div>
              <div class="flow-node-chain">Ethereum Sepolia</div>
              <div class="flow-node-tx" id="tx-aggregate" style="display:none"></div>
            </div>
          </div>

          <!-- Arrow: internal → merchant -->
          <div class="flow-step">
            <div class="flow-connector" id="conn-settle">
              <span class="flow-arrow" id="arrow-settle">&#8595;</span>
              <span class="flow-tx-label" id="label-settle">bridge &amp; settle</span>
            </div>
          </div>

          <!-- Node: Merchant -->
          <div class="flow-step">
            <div class="flow-node" id="node-merchant">
              <div class="flow-node-label">Merchant Settlement Wallet</div>
              <div class="flow-node-addr" id="addr-merchant">—</div>
              <div class="flow-node-chain" id="chain-merchant">—</div>
              <div class="flow-node-tx" id="tx-settle" style="display:none"></div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- Payment request form -->
    <div class="card">
      <label>Order Amount (USD)</label>
      <input type="number" id="amount" value="100" min="1" step="0.01">

      <label>Payment Token</label>
      <select id="token">
        <option value="USDC">USDC</option>
      </select>

      <label>Customer Payment Chain</label>
      <select id="chain">
        <option value="Ethereum_Sepolia">Ethereum Sepolia</option>
        <option value="Base_Sepolia">Base Sepolia</option>
        <option value="Arbitrum_Sepolia">Arbitrum Sepolia</option>
        <option value="Polygon_Amoy_Testnet">Polygon Amoy</option>
      </select>

      <button id="create-btn" onclick="createSession()">Create Payment Request</button>
      <div id="session-result" class="result"></div>
    </div>

    <!-- Payment request details + monitoring -->
    <div id="monitor-card" class="card" style="display:none">
      <label>Payment Request</label>
      <div id="payment-instructions"></div>
      <button id="monitor-btn" onclick="startMonitoring()" style="margin-top:12px">Start Monitoring (simulate)</button>
      <div id="monitor-result" class="result"></div>
    </div>
  </div>

  <script>
    let currentSessionId = null;
    let cfg = {};

    const CHAIN_LABELS = {
      Ethereum_Sepolia:    'Ethereum Sepolia',
      Base_Sepolia:        'Base Sepolia',
      Arbitrum_Sepolia:    'Arbitrum Sepolia',
      Polygon_Amoy_Testnet:'Polygon Amoy',
    };

    const EXPLORER_TX = {
      Ethereum_Sepolia:    'https://sepolia.etherscan.io/tx/',
      Base_Sepolia:        'https://sepolia.basescan.org/tx/',
      Arbitrum_Sepolia:    'https://sepolia.arbiscan.io/tx/',
      Polygon_Amoy_Testnet:'https://amoy.polygonscan.com/tx/',
    };

    function shortAddr(addr) {
      return addr ? addr.slice(0, 8) + '...' + addr.slice(-6) : '—';
    }

    function explorerLink(chain, txHash) {
      const base = EXPLORER_TX[chain];
      if (!base || !txHash || txHash === '') return null;
      return base + txHash;
    }

    function setFlowArrow(connId, arrowId, labelId, state) {
      // state: 'idle' | 'active' | 'done'
      const conn = document.getElementById(connId);
      const arrow = document.getElementById(arrowId);
      const label = document.getElementById(labelId);
      arrow.className = 'flow-arrow' + (state === 'active' ? ' active' : state === 'done' ? ' done' : '');
      label.className = 'flow-tx-label' + (state === 'active' ? ' active' : state === 'done' ? ' done' : '');
      // Replace arrow content with spinner when active, checkmark when done
      if (state === 'active') {
        arrow.innerHTML = '<div class="flow-spinner"></div>';
      } else if (state === 'done') {
        arrow.innerHTML = '<span class="flow-check">&#10003;</span>';
      } else {
        arrow.innerHTML = '&#8595;';
      }
    }

    function setNodeState(nodeId, state) {
      const el = document.getElementById(nodeId);
      el.className = 'flow-node' + (state === 'active' ? ' active' : state === 'done' ? ' done' : '');
    }

    function showTx(txElId, chain, txHash) {
      const el = document.getElementById(txElId);
      if (!el) return;
      const link = explorerLink(chain, txHash);
      if (link && txHash) {
        el.style.display = 'block';
        el.innerHTML = 'TX: <a href="' + link + '" target="_blank" rel="noopener">' + shortAddr(txHash) + '</a>';
      }
    }

    function toggleInfo(header) {
      header.classList.toggle('open');
      header.nextElementSibling.classList.toggle('open');
    }

    async function loadConfig() {
      const res = await fetch('/api/config');
      cfg = await res.json();
      document.getElementById('addr-internal').textContent = cfg.internalWallet;
      document.getElementById('addr-merchant').textContent = cfg.merchantAddress;
      document.getElementById('chain-merchant').textContent = CHAIN_LABELS[cfg.merchantSettlementChain] || cfg.merchantSettlementChain;
    }

    loadConfig();

    async function createSession() {
      const amount = document.getElementById('amount').value;
      const token = document.getElementById('token').value;
      const chain = document.getElementById('chain').value;
      const chainLabel = CHAIN_LABELS[chain] || chain;
      const btn = document.getElementById('create-btn');
      btn.disabled = true;
      btn.textContent = 'Creating request...';

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderAmount: amount, token, chain })
      });
      const data = await res.json();
      btn.disabled = false;
      btn.textContent = 'Create Payment Request';

      if (!res.ok) {
        showResult('session-result', 'error', 'Error: ' + data.error);
        return;
      }

      currentSessionId = data.sessionId;

      // Update flow diagram — temp wallet now known
      document.getElementById('addr-temp').textContent = data.paymentAddress;
      document.getElementById('chain-temp').textContent = chainLabel;
      setNodeState('node-temp', 'active');

      // Open the internal reference panel automatically
      const header = document.querySelector('.collapsible-header');
      if (!header.classList.contains('open')) toggleInfo(header);

      const amounts = data.amounts;
      showResult('session-result', 'success', 'Payment request created');
      document.getElementById('payment-instructions').innerHTML = \`
        <div class="row"><span>Order amount</span><span>$\${amounts.baseAmount} \${token}</span></div>
        <div class="row"><span>Platform fee (\${amounts.feePercent}%)</span><span>$\${amounts.fee} \${token}</span></div>
        <div class="row"><span>Total to send</span><span><strong>$\${amounts.total} \${token}</strong></span></div>
        <div class="row"><span>Payment chain</span><span>\${chainLabel}</span></div>
        <div style="margin-top:10px; font-size:0.8rem; color:#666;">Send \${amounts.total} \${token} on \${chainLabel} to:</div>
        <div class="address-box">\${data.paymentAddress}</div>
        <div style="font-size:0.75rem; color:#888;">Expires: \${new Date(data.expiresAt).toLocaleTimeString()}</div>
      \`;
      document.getElementById('monitor-card').style.display = 'block';
    }

    async function startMonitoring() {
      if (!currentSessionId) return;
      const btn = document.getElementById('monitor-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Monitoring for payment...';
      document.getElementById('monitor-result').style.display = 'none';

      const chain = document.getElementById('chain').value;

      const poll = setInterval(async () => {
        const res = await fetch(\`/api/sessions/\${currentSessionId}\`);
        const data = await res.json();

        if (data.status === 'received' || data.status === 'aggregated') {
          clearInterval(poll);

          // Payment received — mark temp wallet done, aggregation in progress
          setNodeState('node-temp', 'done');
          setFlowArrow('conn-aggregate', 'arrow-aggregate', 'label-aggregate', 'active');
          setNodeState('node-internal', 'active');

          const aggRes = await fetch(\`/api/sessions/\${currentSessionId}/aggregate\`, { method: 'POST' });
          const aggData = await aggRes.json();

          if (aggRes.ok) {
            // Aggregation done — update flow
            setFlowArrow('conn-aggregate', 'arrow-aggregate', 'label-aggregate', 'done');
            setNodeState('node-internal', 'done');
            showTx('tx-aggregate', chain, aggData.txHash);
            showResult('monitor-result', 'success', 'Payment confirmed — funds swept to aggregation wallet.');
          } else {
            setFlowArrow('conn-aggregate', 'arrow-aggregate', 'label-aggregate', 'idle');
            showResult('monitor-result', 'error', 'Aggregation failed: ' + aggData.error);
          }

          btn.disabled = false;
          btn.textContent = 'Start Monitoring (simulate)';
        } else if (data.status === 'expired') {
          clearInterval(poll);
          setNodeState('node-temp', 'idle');
          showResult('monitor-result', 'error', 'Payment not received before expiry.');
          btn.disabled = false;
          btn.textContent = 'Start Monitoring (simulate)';
        }
      }, 5000);

      // Demo: simulate payment received after 3s
      setTimeout(() => {
        fetch(\`/api/sessions/\${currentSessionId}/simulate-payment\`, { method: 'POST' });
      }, 3000);
    }

    function showResult(id, type, msg) {
      const el = document.getElementById(id);
      el.className = 'result ' + type;
      el.textContent = msg;
      el.style.display = 'block';
    }
  </script>
</body>
</html>`);
});

// ===========================
// API ROUTES
// ===========================

// POST /api/sessions — create a payment session
app.post('/api/sessions', async (req, res) => {
  try {
    const { orderAmount, token, chain } = req.body;
    const orderId = `order_${Date.now()}`;

    const session = await createPaymentSession(orderId, orderAmount, token, chain ?? 'Ethereum');
    sessions.set(session.sessionId, session);

    const amounts = calculateAmounts(orderAmount);

    res.json({
      sessionId: session.sessionId,
      orderId,
      paymentAddress: session.paymentAddress,
      expectedToken: session.expectedToken,
      expiresAt: session.expiresAt,
      amounts: {
        baseAmount: amounts.baseAmount.toFixed(2),
        fee: amounts.fee.toFixed(2),
        total: amounts.total.toFixed(2),
        feePercent: PLATFORM_FEE_PERCENT,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:id — get session status
app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ status: session.status, paymentAddress: session.paymentAddress });
});

// POST /api/sessions/:id/simulate-payment — demo only: mark session as received
app.post('/api/sessions/:id/simulate-payment', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  session.status = 'received';
  res.json({ ok: true });
});

// POST /api/sessions/:id/aggregate — sweep temp wallet to internal wallet
app.post('/api/sessions/:id/aggregate', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    const txHash = await aggregateToInternalWallet(session);
    res.json({ txHash, internalWallet: INTERNAL_WALLET_ADDRESS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/config — return safe config info
app.get('/api/config', (_req, res) => {
  res.json({
    internalWallet: INTERNAL_WALLET_ADDRESS,
    merchantAddress: MERCHANT_ADDRESS,
    merchantSettlementChain: MERCHANT_SETTLEMENT_CHAIN,
    platformFeeAddress: PLATFORM_FEE_ADDRESS,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    adapter: 'ethers-v6',
  });
});

const PORT = parseInt(process.env.PORT ?? '3000');
app.listen(PORT, () => {
  console.log(`\n  Stablecoin Acquiring (Ethers Adapter)`);
  console.log(`  Running at http://localhost:${PORT}`);
  console.log(`  Internal wallet: ${INTERNAL_WALLET_ADDRESS}`);
});
