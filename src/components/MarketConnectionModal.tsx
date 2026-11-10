import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  marketDatafeedManager,
  DEFAULT_SETTINGS
} from '../datafeed/MarketDatafeedManager';
import type {
  MarketCategory,
  ConnectionMode,
  MarketEndpointConfig,
  MarketConnectionSettings
} from '../types/marketConnection';
import { Check, Copy, RefreshCw, Radio, Zap, Globe, Terminal, X, AlertCircle } from 'lucide-react';

interface MarketConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLight?: boolean;
}

const MARKET_TABS: { key: MarketCategory; label: string; icon: string }[] = [
  { key: 'crypto', label: 'Crypto', icon: '🪙' },
  { key: 'forex', label: 'Forex', icon: '💱' },
  { key: 'stock', label: 'Stocks', icon: '📈' },
  { key: 'commodity', label: 'Commodities', icon: '🛢️' },
  { key: 'indices', label: 'Indices', icon: '🏛️' }
];

export const MarketConnectionModal: React.FC<MarketConnectionModalProps> = ({
  isOpen,
  onClose,
  isLight = false
}) => {
  const [settings, setSettings] = useState<MarketConnectionSettings>(() => marketDatafeedManager.getSettings());
  const [activeMarket, setActiveMarket] = useState<MarketCategory>('crypto');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; pingMs?: number } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(marketDatafeedManager.getSettings());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentMode = settings.mode;
  const currentMarketConfig = settings.separate[activeMarket] || DEFAULT_SETTINGS.separate[activeMarket];

  const handleModeChange = (mode: ConnectionMode) => {
    const updated = { ...settings, mode };
    setSettings(updated);
    marketDatafeedManager.setMode(mode);
    setTestResult(null);
  };

  const handleUpdateMarketConfig = (field: keyof MarketEndpointConfig, value: any) => {
    const updatedMarket = {
      ...currentMarketConfig,
      [field]: value
    };
    const updated = {
      ...settings,
      separate: {
        ...settings.separate,
        [activeMarket]: updatedMarket
      }
    };
    setSettings(updated);
    marketDatafeedManager.setMarketConfig(activeMarket, { [field]: value });
  };

  const handleUpdateUnifiedConfig = (field: string, value: any) => {
    const updatedUnified = {
      ...settings.unified,
      [field]: value
    };
    const updated = {
      ...settings,
      unified: updatedUnified
    };
    setSettings(updated);
    marketDatafeedManager.setUnifiedConfig({ [field]: value });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await marketDatafeedManager.testConnection(
        currentMode === 'unified' ? 'unified' : activeMarket
      );
      setTestResult(res);
      setSettings(marketDatafeedManager.getSettings());
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message || 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleApplyPreset = (preset: 'binance' | 'webhook' | 'local') => {
    if (currentMode === 'separate') {
      if (activeMarket === 'crypto' && preset === 'binance') {
        handleUpdateMarketConfig('restUrl', 'https://api.binance.com');
        handleUpdateMarketConfig('wsUrl', 'wss://stream.binance.com:9443/ws');
        handleUpdateMarketConfig('webhookFormat', 'binance');
      } else if (preset === 'webhook') {
        handleUpdateMarketConfig('restUrl', `http://127.0.0.1:8000/api/${activeMarket}`);
        handleUpdateMarketConfig('wsUrl', `ws://127.0.0.1:8000/ws/${activeMarket}`);
        handleUpdateMarketConfig('webhookFormat', 'standard');
      }
    } else {
      if (preset === 'local') {
        handleUpdateUnifiedConfig('restUrl', 'http://127.0.0.1:8000/api/market');
        handleUpdateUnifiedConfig('wsUrl', 'ws://127.0.0.1:8000/ws/market');
      }
    }
    setTestResult(null);
  };

  const codeSnippet = currentMode === 'separate'
    ? `// Connect '${activeMarket}' feed programmatically:
window.marketConnectionApi.setMode('separate');
window.marketConnectionApi.setMarketConfig('${activeMarket}', {
  restUrl: '${currentMarketConfig.restUrl || 'https://my-broker.com/api/' + activeMarket}',
  wsUrl: '${currentMarketConfig.wsUrl || 'wss://my-broker.com/ws/' + activeMarket}',
  apiKey: 'YOUR_API_KEY'
});

// Or push live tick directly from your application / bot:
window.marketConnectionApi.pushTick({
  symbol: '${activeMarket === 'crypto' ? 'BTCUSDT' : (activeMarket === 'forex' ? 'EURUSD' : 'AAPL')}',
  timestamp: Date.now(),
  open: 100, high: 102, low: 99, close: 101.5, volume: 150
});`
    : `// Connect all markets via Unified Gateway:
window.marketConnectionApi.setMode('unified');
window.marketConnectionApi.setUnifiedConfig({
  restUrl: '${settings.unified.restUrl}',
  wsUrl: '${settings.unified.wsUrl || ''}',
  apiKey: 'YOUR_MASTER_API_KEY'
});`;

  const copyCode = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(5, 7, 15, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '780px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          backgroundColor: isLight ? '#ffffff' : '#141722',
          border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: isLight ? '#131722' : '#d1d4dc'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isLight ? '#f8f9fd' : '#10121a'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2962ff 0%, #00b0ff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(41, 98, 255, 0.3)'
              }}
            >
              <Zap size={20} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: isLight ? '#131722' : '#ffffff' }}>
                Market Data Feed & Webhook Manager
              </div>
              <div style={{ fontSize: '12px', color: isLight ? '#787b86' : '#868993' }}>
                Dual-Mode System: Separate Per-Market APIs or Unified Single Gateway
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: isLight ? '#787b86' : '#868993',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = isLight ? '#e4e8f0' : 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={18} />
          </button>
        </div>

        {/* System Mode Switcher */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.06)',
            background: isLight ? '#f0f3fa' : 'rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isLight ? '#787b86' : '#868993' }}>
            Connection Architecture
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Separate Mode Card */}
            <div
              onClick={() => handleModeChange('separate')}
              style={{
                padding: '14px 16px',
                borderRadius: '10px',
                border: currentMode === 'separate'
                  ? '2px solid #2962ff'
                  : (isLight ? '1px solid #d1d4dc' : '1px solid rgba(255,255,255,0.08)'),
                backgroundColor: currentMode === 'separate'
                  ? (isLight ? 'rgba(41, 98, 255, 0.08)' : 'rgba(41, 98, 255, 0.12)')
                  : (isLight ? '#ffffff' : '#181b26'),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ color: currentMode === 'separate' ? '#2962ff' : '#868993', marginTop: '2px' }}>
                <Radio size={18} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: currentMode === 'separate' ? '#2962ff' : (isLight ? '#131722' : '#ffffff') }}>
                  Type 1: Separate Market Connections
                </div>
                <div style={{ fontSize: '11px', color: isLight ? '#5d606b' : '#868993', marginTop: '4px', lineHeight: '1.4' }}>
                  Crypto has its own dedicated connection/webhook, and Forex, Stocks, etc. each connect to independent APIs or webhooks.
                </div>
              </div>
            </div>

            {/* Unified Mode Card */}
            <div
              onClick={() => handleModeChange('unified')}
              style={{
                padding: '14px 16px',
                borderRadius: '10px',
                border: currentMode === 'unified'
                  ? '2px solid #2962ff'
                  : (isLight ? '1px solid #d1d4dc' : '1px solid rgba(255,255,255,0.08)'),
                backgroundColor: currentMode === 'unified'
                  ? (isLight ? 'rgba(41, 98, 255, 0.08)' : 'rgba(41, 98, 255, 0.12)')
                  : (isLight ? '#ffffff' : '#181b26'),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ color: currentMode === 'unified' ? '#2962ff' : '#868993', marginTop: '2px' }}>
                <Globe size={18} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: currentMode === 'unified' ? '#2962ff' : (isLight ? '#131722' : '#ffffff') }}>
                  Type 2: Unified Single Gateway
                </div>
                <div style={{ fontSize: '11px', color: isLight ? '#5d606b' : '#868993', marginTop: '4px', lineHeight: '1.4' }}>
                  Connect all markets (Crypto, Forex, Stocks, etc.) through one unified backend API, router, or webhook endpoint.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Body Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {currentMode === 'separate' ? (
            <>
              {/* Market Selector Tabs */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                {MARKET_TABS.map(tab => {
                  const isActive = activeMarket === tab.key;
                  const conf = settings.separate[tab.key];
                  const isConfigured = !!conf?.restUrl;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => {
                        setActiveMarket(tab.key);
                        setTestResult(null);
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: isActive
                          ? '#2962ff'
                          : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'),
                        color: isActive ? '#ffffff' : (isLight ? '#5d606b' : '#929aa5'),
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                      {tab.key === 'crypto' && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#089981' }} />
                      )}
                      {tab.key !== 'crypto' && isConfigured && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2962ff' }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active Market Config Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: isLight ? '#131722' : '#ffffff' }}>
                      {currentMarketConfig.name || `${activeMarket.toUpperCase()} Connection`}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: activeMarket === 'crypto' && (!currentMarketConfig.restUrl || currentMarketConfig.restUrl.includes('binance.com'))
                          ? 'rgba(8, 153, 129, 0.15)'
                          : (currentMarketConfig.restUrl ? 'rgba(41, 98, 255, 0.15)' : 'rgba(255, 152, 0, 0.15)'),
                        color: activeMarket === 'crypto' && (!currentMarketConfig.restUrl || currentMarketConfig.restUrl.includes('binance.com'))
                          ? '#089981'
                          : (currentMarketConfig.restUrl ? '#2962ff' : '#ff9800')
                      }}
                    >
                      {activeMarket === 'crypto' && (!currentMarketConfig.restUrl || currentMarketConfig.restUrl.includes('binance.com'))
                        ? '🟢 Binance Connected'
                        : (currentMarketConfig.restUrl ? '🔵 Custom Webhook/API' : '🟡 Simulated Fallback')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {activeMarket === 'crypto' && (
                      <button
                        onClick={() => handleApplyPreset('binance')}
                        style={{
                          background: 'transparent',
                          border: isLight ? '1px solid #d1d4dc' : '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          color: isLight ? '#5d606b' : '#d1d4dc',
                          cursor: 'pointer'
                        }}
                      >
                        Reset Binance Feed
                      </button>
                    )}
                    <button
                      onClick={() => handleApplyPreset('webhook')}
                      style={{
                        background: 'transparent',
                        border: isLight ? '1px solid #d1d4dc' : '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: isLight ? '#5d606b' : '#d1d4dc',
                        cursor: 'pointer'
                      }}
                    >
                      Set Localhost Bot Webhook
                    </button>
                  </div>
                </div>

                {/* REST / Webhook URL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: isLight ? '#5d606b' : '#929aa5' }}>
                    REST API Base URL or Webhook Endpoint:
                  </label>
                  <input
                    type="text"
                    value={currentMarketConfig.restUrl || ''}
                    placeholder={activeMarket === 'crypto' ? 'https://api.binance.com or https://mybot.com/api/crypto/webhook' : `https://my-api.com/api/${activeMarket}`}
                    onChange={e => handleUpdateMarketConfig('restUrl', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: isLight ? '#ffffff' : '#1c2030',
                      border: isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39',
                      borderRadius: '8px',
                      color: isLight ? '#131722' : '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '11px', color: isLight ? '#787b86' : '#787b86' }}>
                    Used for symbol lists and historical candlestick loading.
                  </span>
                </div>

                {/* WebSocket Stream URL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: isLight ? '#5d606b' : '#929aa5' }}>
                    WebSocket Stream URL (Optional for live ticks):
                  </label>
                  <input
                    type="text"
                    value={currentMarketConfig.wsUrl || ''}
                    placeholder={activeMarket === 'crypto' ? 'wss://stream.binance.com:9443/ws' : `wss://my-api.com/ws/${activeMarket}`}
                    onChange={e => handleUpdateMarketConfig('wsUrl', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: isLight ? '#ffffff' : '#1c2030',
                      border: isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39',
                      borderRadius: '8px',
                      color: isLight ? '#131722' : '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* API Key / Token */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: isLight ? '#5d606b' : '#929aa5' }}>
                    API Key / Webhook Secret Token (Optional):
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={currentMarketConfig.apiKey || ''}
                      placeholder="Optional bearer token or API key header"
                      onChange={e => handleUpdateMarketConfig('apiKey', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 14px',
                        backgroundColor: isLight ? '#ffffff' : '#1c2030',
                        border: isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39',
                        borderRadius: '8px',
                        color: isLight ? '#131722' : '#ffffff',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: isLight ? '#787b86' : '#868993',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 600
                      }}
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Unified Single Gateway Configuration */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: isLight ? '#131722' : '#ffffff' }}>
                  Unified All-in-One Market Gateway
                </span>
                <button
                  onClick={() => handleApplyPreset('local')}
                  style={{
                    background: 'transparent',
                    border: isLight ? '1px solid #d1d4dc' : '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    color: isLight ? '#5d606b' : '#d1d4dc',
                    cursor: 'pointer'
                  }}
                >
                  Reset Local URLs
                </button>
              </div>


              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isLight ? '#5d606b' : '#929aa5' }}>
                  Unified REST / Webhook Gateway Base URL:
                </label>
                <input
                  type="text"
                  value={settings.unified.restUrl}
                  placeholder="https://my-backend.com/api/market"
                  onChange={e => handleUpdateUnifiedConfig('restUrl', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: isLight ? '#ffffff' : '#1c2030',
                    border: isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39',
                    borderRadius: '8px',
                    color: isLight ? '#131722' : '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '11px', color: isLight ? '#787b86' : '#787b86' }}>
                  All market requests (Crypto, Forex, Stocks, etc.) route through this single endpoint with a <code>?market=...</code> parameter.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isLight ? '#5d606b' : '#929aa5' }}>
                  Unified WebSocket Stream URL:
                </label>
                <input
                  type="text"
                  value={settings.unified.wsUrl || ''}
                  placeholder="wss://my-backend.com/ws/market"
                  onChange={e => handleUpdateUnifiedConfig('wsUrl', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: isLight ? '#ffffff' : '#1c2030',
                    border: isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39',
                    borderRadius: '8px',
                    color: isLight ? '#131722' : '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isLight ? '#5d606b' : '#929aa5' }}>
                  Master API Key / Bearer Token:
                </label>
                <input
                  type="password"
                  value={settings.unified.apiKey || ''}
                  placeholder="Bearer token or API Secret"
                  onChange={e => handleUpdateUnifiedConfig('apiKey', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: isLight ? '#ffffff' : '#1c2030',
                    border: isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39',
                    borderRadius: '8px',
                    color: isLight ? '#131722' : '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}

          {/* Test Connection Button & Result */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              style={{
                backgroundColor: isLight ? '#f0f3fa' : 'rgba(255, 255, 255, 0.08)',
                border: isLight ? '1px solid #d1d4dc' : '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: isLight ? '#131722' : '#ffffff',
                cursor: isTesting ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s'
              }}
            >
              <RefreshCw size={14} className={isTesting ? 'animate-spin' : ''} />
              <span>{isTesting ? 'Testing Feed...' : 'Test Connection'}</span>
            </button>

            {testResult && (
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: testResult.success ? '#089981' : '#f23645'
                }}
              >
                {testResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Application Integration Code Snippet */}
          <div
            style={{
              backgroundColor: isLight ? '#f8f9fd' : '#0d0f17',
              border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: isLight ? '#5d606b' : '#868993' }}>
                <Terminal size={14} />
                <span>CONNECT VIA APPLICATION CODE (AUTOMATIC)</span>
              </div>
              <button
                onClick={copyCode}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copiedCode ? '#089981' : (isLight ? '#2962ff' : '#00b0ff'),
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: '11px',
                fontFamily: 'monospace',
                color: isLight ? '#24292f' : '#a0aec0',
                overflowX: 'auto',
                lineHeight: '1.45'
              }}
            >
              {codeSnippet}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)',
            background: isLight ? '#f8f9fd' : '#10121a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <button
            onClick={() => {
              marketDatafeedManager.resetDefaults();
              setSettings(marketDatafeedManager.getSettings());
              setTestResult({ success: true, message: 'Reset to standard defaults.' });
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: isLight ? '#787b86' : '#868993',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Reset to Defaults
          </button>

          <button
            onClick={onClose}
            style={{
              backgroundColor: '#2962ff',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              padding: '9px 24px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(41, 98, 255, 0.3)',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1a56ff'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2962ff'}
          >
            Save & Connect
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MarketConnectionModal;
