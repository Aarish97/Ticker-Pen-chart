import React, { useState, useEffect, useRef } from 'react';
import {
  ALL_SHORTCUT_DEFINITIONS,
  getCustomShortcuts,
  saveCustomShortcuts,
  resetCustomShortcuts,
  parseKeyEventToShortcutString,
  type ShortcutDefinition
} from '../utils/shortcutManager';
import { Search, RotateCcw, X, Keyboard, Check, AlertTriangle, Sparkles } from 'lucide-react';

interface ShortcutsSettingsTabProps {
  onShortcutChange?: () => void;
}

export const ShortcutsSettingsTab: React.FC<ShortcutsSettingsTabProps> = ({ onShortcutChange }) => {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>(() => getCustomShortcuts());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [currentRecordingKeys, setCurrentRecordingKeys] = useState<string>('');
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState(false);

  const [chromeTheme, setChromeTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return (document.body.getAttribute('data-chrome-theme') === 'light' ||
              document.documentElement.getAttribute('data-chrome-theme') === 'light') ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const handleThemeChange = (e: any) => {
      setChromeTheme(e.detail?.effective === 'light' ? 'light' : 'dark');
    };
    window.addEventListener('chrome-theme-changed', handleThemeChange);

    const checkTheme = () => {
      const isLightMode = document.body.getAttribute('data-chrome-theme') === 'light' || 
                          document.documentElement.getAttribute('data-chrome-theme') === 'light';
      setChromeTheme(isLightMode ? 'light' : 'dark');
    };

    const observer = new MutationObserver(checkTheme);
    if (typeof document !== 'undefined') {
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-chrome-theme', 'class'] });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-chrome-theme', 'class'] });
    }
    return () => {
      window.removeEventListener('chrome-theme-changed', handleThemeChange);
      observer.disconnect();
    };
  }, []);

  const isLight = chromeTheme === 'light';

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync state if shortcuts are updated externally
  useEffect(() => {
    const handleUpdate = () => {
      setShortcuts(getCustomShortcuts());
    };
    window.addEventListener('custom-shortcuts-updated', handleUpdate);
    return () => window.removeEventListener('custom-shortcuts-updated', handleUpdate);
  }, []);

  // Keyboard recording listener
  useEffect(() => {
    if (!recordingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording without changing
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecordingId(null);
        setCurrentRecordingKeys('');
        setConflictMessage(null);
        return;
      }

      // Backspace or Delete clears the shortcut if pressed alone
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const next = { ...shortcuts, [recordingId]: '' };
        setShortcuts(next);
        saveCustomShortcuts(next);
        setRecordingId(null);
        setCurrentRecordingKeys('');
        setConflictMessage(null);
        showSavedBanner();
        onShortcutChange?.();
        return;
      }

      const parsed = parseKeyEventToShortcutString(e);
      if (parsed) {
        // Check for conflicts
        const conflictingDef = ALL_SHORTCUT_DEFINITIONS.find(
          d => d.id !== recordingId && shortcuts[d.id]?.toUpperCase() === parsed.toUpperCase()
        );

        if (conflictingDef) {
          setConflictMessage(`"${parsed}" is currently used for ${conflictingDef.name}. Assigning will replace it.`);
        } else {
          setConflictMessage(null);
        }

        const next = { ...shortcuts };
        if (conflictingDef) {
          next[conflictingDef.id] = ''; // remove from conflicting action
        }
        next[recordingId] = parsed;

        setShortcuts(next);
        saveCustomShortcuts(next);
        setRecordingId(null);
        setCurrentRecordingKeys('');
        showSavedBanner();
        onShortcutChange?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [recordingId, shortcuts]);

  const showSavedBanner = () => {
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const handleClearShortcut = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...shortcuts, [id]: '' };
    setShortcuts(next);
    saveCustomShortcuts(next);
    showSavedBanner();
    onShortcutChange?.();
  };

  const handleResetSingle = (def: ShortcutDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...shortcuts, [def.id]: def.defaultShortcut };
    setShortcuts(next);
    saveCustomShortcuts(next);
    showSavedBanner();
    onShortcutChange?.();
  };

  const handleResetAll = () => {
    if (window.confirm('Reset all keyboard shortcuts to their default settings?')) {
      const resetMap = resetCustomShortcuts();
      setShortcuts(resetMap);
      setRecordingId(null);
      setConflictMessage(null);
      showSavedBanner();
      onShortcutChange?.();
    }
  };

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'lines', label: 'Lines & Channels' },
    { id: 'fib', label: 'Fibonacci & Gann' },
    { id: 'shapes', label: 'Shapes & Brushes' },
    { id: 'forecasting', label: 'Forecasting' },
    { id: 'annotations', label: 'Annotations' },
    { id: 'actions', label: 'Chart Actions' }
  ];

  const filteredDefinitions = ALL_SHORTCUT_DEFINITIONS.filter(def => {
    const matchesCat = selectedCategory === 'all' || def.category === selectedCategory;
    const q = searchQuery.trim().toLowerCase();
    const currentShortcut = (shortcuts[def.id] || '').toLowerCase();
    const matchesSearch = !q ||
      def.name.toLowerCase().includes(q) ||
      def.categoryLabel.toLowerCase().includes(q) ||
      currentShortcut.includes(q);
    return matchesCat && matchesSearch;
  });

  const modifiedCount = ALL_SHORTCUT_DEFINITIONS.filter(
    def => (shortcuts[def.id] || '') !== def.defaultShortcut
  ).length;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '16px',
        color: isLight ? '#131722' : '#d1d4dc',
        fontFamily: 'var(--font-sans)',
        userSelect: 'none'
      }}
    >
      {/* Search and Category Filter Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Search Box */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: isLight ? '#f0f3fa' : '#131722',
              borderRadius: '6px',
              border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.1)',
              padding: '0 10px',
              height: '34px'
            }}
          >
            <Search size={14} color="#868993" style={{ marginRight: '8px', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search tools or shortcuts..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: isLight ? '#131722' : '#ffffff',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isLight ? '#787b86' : '#868993',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Reset All Button */}
          <button
            onClick={handleResetAll}
            title="Reset all shortcuts to defaults"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isLight ? '#f0f3fa' : 'rgba(255, 255, 255, 0.04)',
              border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: isLight ? '#5d606b' : '#868993',
              padding: '0 12px',
              height: '34px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = isLight ? '#131722' : '#ffffff';
              e.currentTarget.style.backgroundColor = isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = isLight ? '#5d606b' : '#868993';
              e.currentTarget.style.backgroundColor = isLight ? '#f0f3fa' : 'rgba(255, 255, 255, 0.04)';
            }}
          >
            <RotateCcw size={13} />
            Reset Defaults
          </button>
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {categories.map(cat => {
            const isSel = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '16px',
                  border: isSel ? '1px solid #2962ff' : (isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)'),
                  backgroundColor: isSel 
                    ? (isLight ? 'rgba(41, 98, 255, 0.1)' : 'rgba(41, 98, 255, 0.15)') 
                    : (isLight ? '#f0f3fa' : 'rgba(255, 255, 255, 0.03)'),
                  color: isSel ? '#2962ff' : (isLight ? '#5d606b' : '#868993'),
                  fontSize: '12px',
                  fontWeight: isSel ? 600 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recording Prompt Banner */}
      {recordingId && (
        <div
          style={{
            backgroundColor: 'rgba(41, 98, 255, 0.15)',
            border: '1px solid #2962ff',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'pulse 1.5s infinite'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Keyboard size={18} color="#2962ff" />
            <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#ffffff', fontWeight: 500 }}>
              Press desired key combination (e.g. <kbd style={{ background: isLight ? '#ffffff' : '#1e222d', padding: '2px 6px', borderRadius: '4px', border: isLight ? '1px solid #d1d4dc' : '1px solid #363a45', fontSize: '11px', color: isLight ? '#131722' : '#ffffff' }}>Alt</kbd> + <kbd style={{ background: isLight ? '#ffffff' : '#1e222d', padding: '2px 6px', borderRadius: '4px', border: isLight ? '1px solid #d1d4dc' : '1px solid #363a45', fontSize: '11px', color: isLight ? '#131722' : '#ffffff' }}>T</kbd>) or <kbd style={{ background: isLight ? '#ffffff' : '#1e222d', padding: '2px 6px', borderRadius: '4px', border: isLight ? '1px solid #d1d4dc' : '1px solid #363a45', fontSize: '11px', color: isLight ? '#131722' : '#ffffff' }}>Esc</kbd> to cancel
            </span>
          </div>
          <button
            onClick={() => setRecordingId(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: isLight ? '#787b86' : '#868993',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Conflict Warning */}
      {conflictMessage && (
        <div
          style={{
            backgroundColor: 'rgba(255, 152, 0, 0.12)',
            border: '1px solid rgba(255, 152, 0, 0.3)',
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#ffa726'
          }}
        >
          <AlertTriangle size={15} />
          <span>{conflictMessage}</span>
        </div>
      )}

      {/* Saved Feedback Toast */}
      {savedFeedback && (
        <div
          style={{
            backgroundColor: 'rgba(38, 166, 154, 0.15)',
            border: '1px solid #26a69a',
            borderRadius: '6px',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#26a69a'
          }}
        >
          <Check size={14} />
          <span>Shortcut saved successfully!</span>
        </div>
      )}

      {/* Shortcuts List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          paddingRight: '4px'
        }}
      >
        {filteredDefinitions.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '160px',
              color: isLight ? '#787b86' : '#868993',
              gap: '8px'
            }}
          >
            <Search size={24} />
            <span style={{ fontSize: '13px' }}>No matching shortcuts found</span>
          </div>
        ) : (
          filteredDefinitions.map(def => {
            const currentShortcut = shortcuts[def.id] || '';
            const isRecording = recordingId === def.id;
            const isModified = currentShortcut !== def.defaultShortcut;

            return (
              <div
                key={def.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  backgroundColor: isRecording
                    ? 'rgba(41, 98, 255, 0.12)'
                    : (isLight ? '#f8f9fd' : 'rgba(255, 255, 255, 0.02)'),
                  border: isRecording
                    ? '1px solid #2962ff'
                    : (isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.04)'),
                  transition: 'all 0.12s ease'
                }}
              >
                {/* Left: Tool/Action Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: isLight ? '#131722' : '#ffffff' }}>
                      {def.name}
                    </span>
                    {isModified && (
                      <span
                        title="Customized shortcut"
                        style={{
                          fontSize: '10px',
                          color: '#2962ff',
                          backgroundColor: 'rgba(41, 98, 255, 0.15)',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          fontWeight: 600
                        }}
                      >
                        Custom
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: isLight ? '#787b86' : '#6a6d78' }}>
                    {def.categoryLabel}
                  </span>
                </div>

                {/* Right: Keycap / Record Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Keycap Badge or Recording Pill */}
                  <button
                    onClick={() => {
                      if (isRecording) {
                        setRecordingId(null);
                      } else {
                        setRecordingId(def.id);
                        setConflictMessage(null);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      backgroundColor: isRecording
                        ? '#2962ff'
                        : currentShortcut
                        ? (isLight ? '#ffffff' : '#1e222d')
                        : (isLight ? '#f0f3fa' : 'rgba(255, 255, 255, 0.04)'),
                      border: isRecording
                        ? '1px solid #2962ff'
                        : currentShortcut
                        ? (isLight ? '1px solid #d1d4dc' : '1px solid rgba(255, 255, 255, 0.12)')
                        : (isLight ? '1px dashed #d1d4dc' : '1px dashed rgba(255, 255, 255, 0.15)'),
                      color: isRecording 
                        ? '#ffffff' 
                        : currentShortcut 
                        ? (isLight ? '#131722' : '#e0e3eb') 
                        : (isLight ? '#787b86' : '#6a6d78'),
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      outline: 'none',
                      minWidth: '90px',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      boxShadow: currentShortcut && !isRecording ? (isLight ? '0 1px 3px rgba(0, 0, 0, 0.08)' : '0 2px 4px rgba(0, 0, 0, 0.2)') : 'none'
                    }}
                    title="Click to record new shortcut"
                  >
                    {isRecording ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Sparkles size={12} /> Press key...
                      </span>
                    ) : currentShortcut ? (
                      currentShortcut.split('+').map((k, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span style={{ color: isLight ? '#787b86' : '#6a6d78', margin: '0 1px' }}>+</span>}
                          <span>{k.trim()}</span>
                        </React.Fragment>
                      ))
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 400 }}>+ Add shortcut</span>
                    )}
                  </button>

                  {/* Clear Button */}
                  {currentShortcut && (
                    <button
                      onClick={e => handleClearShortcut(def.id, e)}
                      title="Remove shortcut"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isLight ? '#787b86' : '#6a6d78',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '4px'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#ef5350';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = isLight ? '#787b86' : '#6a6d78';
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}

                  {/* Reset single button if modified */}
                  {isModified && (
                    <button
                      onClick={e => handleResetSingle(def, e)}
                      title={`Reset to default (${def.defaultShortcut || 'none'})`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isLight ? '#787b86' : '#6a6d78',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '4px'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#2962ff';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = isLight ? '#787b86' : '#6a6d78';
                      }}
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '8px',
          borderTop: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '11px',
          color: isLight ? '#787b86' : '#6a6d78'
        }}
      >
        <span>
          {modifiedCount > 0
            ? `${modifiedCount} custom shortcut${modifiedCount > 1 ? 's' : ''} active`
            : 'Default shortcuts active'}
        </span>
        <span>Click any key badge to record a new key combination</span>
      </div>
    </div>
  );
};
