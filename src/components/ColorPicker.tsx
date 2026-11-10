import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ColorPickerProps {
  color: string; // rgba(r, g, b, a) or hex
  onChange: (color: string) => void;
}

const PALETTE = [
  ['#ffffff', '#e0e3eb', '#b2b5be', '#787b86', '#646569', '#434651', '#2a2e39', '#1f222e', '#131722', '#000000'],
  ['#f23645', '#ff6d00', '#ffb300', '#089981', '#00bfa5', '#00e5ff', '#2979ff', '#651fff', '#d500f9', '#f50057'],
  ['#ff8a80', '#ffd180', '#ffe57f', '#b9f6ca', '#a7ffeb', '#84ffff', '#82b1ff', '#b388ff', '#f8bbd0', '#ff80ab'],
  ['#ef5350', '#ffb74d', '#fff176', '#81c784', '#4db6ac', '#4fc3f7', '#64b5f6', '#9575cd', '#e1bee7', '#f06292'],
  ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b', '#00acc1', '#1e88e5', '#5e35b1', '#8e24aa', '#d81b60'],
  ['#c62828', '#ef6c00', '#fbc02d', '#2e7d32', '#00695c', '#00838f', '#1565c0', '#4527a0', '#6a1b9a', '#c2185b'],
  ['#821c1a', '#a04c00', '#a87e00', '#1c5222', '#004035', '#004d56', '#0d407f', '#2a1468', '#400a54', '#780a37']
];

function hexToRgbValues(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  const num = parseInt(cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return { r, g, b };
}

function parseColor(colorStr: string): { hex: string; opacity: number } {
  if (!colorStr || colorStr === 'transparent') {
    return { hex: '#ffffff', opacity: 0 };
  }
  if (colorStr.startsWith('rgba')) {
    const parts = colorStr.match(/[\d.]+/g);
    if (parts && parts.length >= 4) {
      const r = parseInt(parts[0]);
      const g = parseInt(parts[1]);
      const b = parseInt(parts[2]);
      const a = parseFloat(parts[3]);
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      return { hex, opacity: isNaN(a) ? 1 : a };
    }
  } else if (colorStr.startsWith('rgb')) {
    const parts = colorStr.match(/\d+/g);
    if (parts && parts.length >= 3) {
      const r = parseInt(parts[0]);
      const g = parseInt(parts[1]);
      const b = parseInt(parts[2]);
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      return { hex, opacity: 1 };
    }
  } else if (colorStr.startsWith('#')) {
    return { hex: colorStr, opacity: 1 };
  }
  return { hex: '#ffffff', opacity: 1 };
}

export default function ColorPicker({ color, onChange }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { hex, opacity } = parseColor(color);
  const { r, g, b } = hexToRgbValues(hex);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

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

  const isNone = opacity === 0 || color === 'transparent';
  const rgba = isNone ? 'transparent' : `rgba(${r}, ${g}, ${b}, ${opacity})`;

  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number } | null>(null);

  const getComputedCoords = () => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const estHeight = 280;
    const estWidth = 236;

    let top = rect.bottom + 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < estHeight && spaceAbove > estHeight) {
      top = rect.top - estHeight - 4;
    } else if (top + estHeight > window.innerHeight) {
      top = Math.max(10, window.innerHeight - estHeight - 10);
    }

    let left = rect.left;
    if (left + estWidth > window.innerWidth - 10) {
      left = window.innerWidth - estWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    return { top, left };
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      const coords = getComputedCoords();
      if (coords) setPopoverCoords(coords);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      const coords = getComputedCoords();
      if (coords) setPopoverCoords(coords);

      const handleClickOutside = (e: MouseEvent) => {
        if (
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node) &&
          popupRef.current &&
          !popupRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
        }
      };

      const handleScrollOrResize = () => {
        const nextCoords = getComputedCoords();
        if (nextCoords) setPopoverCoords(nextCoords);
      };

      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('resize', handleScrollOrResize);
        window.removeEventListener('scroll', handleScrollOrResize, true);
      };
    }
  }, [isOpen]);

  const handleSelectColor = (selectedHex: string) => {
    const { r: nr, g: ng, b: nb } = hexToRgbValues(selectedHex);
    const nextOpacity = opacity === 0 ? 1 : opacity;
    onChange(`rgba(${nr}, ${ng}, ${nb}, ${nextOpacity})`);
  };

  const handleSelectNone = () => {
    onChange('transparent');
  };

  const handleOpacityChange = (newOpacity: number) => {
    if (newOpacity === 0) {
      onChange('transparent');
    } else {
      onChange(`rgba(${r}, ${g}, ${b}, ${newOpacity})`);
    }
  };

  const triggerCustomColorPicker = () => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.click();
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Active Color Trigger Button */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '4px',
          border: isOpen ? '1.5px solid #2962ff' : (isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39'),
          background: isNone 
            ? `repeating-conic-gradient(${isLight ? '#d1d4dc 0% 25%, #ffffff 0% 50%' : '#2a2e39 0% 25%, #131722 0% 50%'}) 50% / 6px 6px`
            : `linear-gradient(to right, ${rgba}, ${rgba}), repeating-conic-gradient(${isLight ? '#d1d4dc 0% 25%, #ffffff 0% 50%' : '#2a2e39 0% 25%, #131722 0% 50%'}) 50% / 6px 6px`,
          cursor: 'pointer',
          padding: 0,
          outline: 'none',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s'
        }}
      >
        {isNone && (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <line x1="3" y1="17" x2="17" y2="3" stroke="#f23645" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Hidden native input for custom color picker "+" */}
      <input
        ref={hiddenInputRef}
        type="color"
        value={hex}
        onChange={(e) => {
          const customHex = e.target.value;
          const { r: cr, g: cg, b: cb } = hexToRgbValues(customHex);
          const nextOpacity = opacity === 0 ? 1 : opacity;
          onChange(`rgba(${cr}, ${cg}, ${cb}, ${nextOpacity})`);
        }}
        style={{ display: 'none' }}
      />

      {/* TradingView-Style Dropdown Picker via Portal with Viewport Positioning */}
      {isOpen && popoverCoords && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            top: `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
            zIndex: 9999999,
            width: '236px',
            maxHeight: 'calc(100vh - 20px)',
            overflowY: 'auto',
            backgroundColor: isLight ? '#ffffff' : '#1c2030',
            border: isLight ? '1px solid #e0e3eb' : '1px solid #434651',
            borderRadius: '6px',
            padding: '12px',
            boxShadow: isLight ? '0 12px 32px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0,0,0,0.06)' : '0 12px 32px rgba(0, 0, 0, 0.8)',
            boxSizing: 'border-box',
            fontFamily: "'Rubik', sans-serif"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Swatches Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {PALETTE.map((row, rowIndex) => (
              <div key={rowIndex} style={{ display: 'flex', gap: '4px' }}>
                {row.map((swatchHex) => {
                  const isSelected = !isNone && hex.toLowerCase() === swatchHex.toLowerCase();
                  return (
                    <div
                      key={swatchHex}
                      onClick={() => handleSelectColor(swatchHex)}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '2px',
                        backgroundColor: swatchHex,
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        border: isSelected ? '1.5px solid #2979ff' : (isLight ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.1)'),
                        boxShadow: isSelected ? '0 0 4px #2979ff' : 'none',
                        transition: 'transform 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Opacity Label */}
          <div style={{ fontSize: '11px', color: isLight ? '#787b86' : '#868993', marginTop: '10px', marginBottom: '6px', fontWeight: 500 }}>
            Opacity
          </div>

          {/* Opacity Slider Container */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                flex: 1,
                position: 'relative',
                height: '8px',
                borderRadius: '4px',
                background: `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0), rgba(${r}, ${g}, ${b}, 1)),
                             repeating-conic-gradient(${isLight ? '#e0e3eb 0% 25%, #ffffff 0% 50%' : '#3c4050 0% 25%, #252834 0% 50%'}) 50% / 6px 6px`,
                boxShadow: isLight ? 'inset 0 1px 2px rgba(0,0,0,0.1)' : 'inset 0 1px 2px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(opacity * 100)}
                onChange={(e) => handleOpacityChange(parseInt(e.target.value) / 100)}
                style={{
                  width: '100%',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  margin: 0,
                  outline: 'none'
                }}
                className="opacity-slider-input"
              />
            </div>
            
            {/* Value Indicator Box */}
            <div
              style={{
                fontSize: '11px',
                color: isLight ? '#131722' : '#d1d4dc',
                backgroundColor: isLight ? '#f0f3fa' : '#131722',
                border: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
                borderRadius: '3px',
                padding: '2px 6px',
                minWidth: '38px',
                textAlign: 'center',
                boxSizing: 'border-box'
              }}
            >
              {Math.round(opacity * 100)}%
            </div>
          </div>

          {/* Action Row: Custom "+" button and None box right beside it */}
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={triggerCustomColorPicker}
              style={{
                background: 'transparent',
                border: isLight ? '1px dashed #d1d4dc' : '1px dashed #434651',
                borderRadius: '4px',
                color: isLight ? '#5d606b' : '#868993',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#2979ff';
                e.currentTarget.style.color = '#2979ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isLight ? '#d1d4dc' : '#434651';
                e.currentTarget.style.color = isLight ? '#5d606b' : '#868993';
              }}
            >
              <span>+ Custom Color</span>
            </button>

            <button
              onClick={handleSelectNone}
              title="None (Transparent)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isNone ? (isLight ? 'rgba(41, 98, 255, 0.1)' : 'rgba(41, 98, 255, 0.15)') : 'transparent',
                border: isNone ? '1.5px solid #2962ff' : (isLight ? '1px dashed #d1d4dc' : '1px dashed #434651'),
                borderRadius: '4px',
                padding: '4px 8px',
                cursor: 'pointer',
                color: isNone ? '#2962ff' : (isLight ? '#5d606b' : '#868993'),
                fontSize: '12px',
                transition: 'border-color 0.15s, color 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#f23645';
                e.currentTarget.style.color = '#f23645';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isNone ? '#2962ff' : (isLight ? '#d1d4dc' : '#434651');
                e.currentTarget.style.color = isNone ? '#2962ff' : (isLight ? '#5d606b' : '#868993');
              }}
            >
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '2px',
                  background: `repeating-conic-gradient(${isLight ? '#d1d4dc 0% 25%, #ffffff 0% 50%' : '#2a2e39 0% 25%, #131722 0% 50%'}) 50% / 3px 3px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <line x1="2" y1="14" x2="14" y2="2" stroke="#f23645" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <span>None</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Styled range input slider thumb */}
      <style>{`
        .opacity-slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          border: 1px solid ${isLight ? '#d1d4dc' : '#131722'};
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.1s;
        }
        .opacity-slider-input::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        .opacity-slider-input::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          border: 1px solid ${isLight ? '#d1d4dc' : '#131722'};
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.1s;
        }
        .opacity-slider-input::-moz-range-thumb:hover {
          transform: scale(1.15);
        }
      `}</style>
    </div>
  );
}
