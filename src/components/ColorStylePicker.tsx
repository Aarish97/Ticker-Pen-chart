import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ColorStylePickerProps {
  color: string; // hex or rgb/rgba or 'transparent'
  opacity: number; // 0 to 1
  style?: 'solid' | 'dashed' | 'dotted';
  hideStyleSelector?: boolean;
  isTextColorPicker?: boolean;
  isFillColorPicker?: boolean;
  isBorderColorPicker?: boolean;
  isPureColorBox?: boolean;
  boxSize?: number;
  alignLeft?: boolean;
  forceDark?: boolean;
  onChange: (color: string, opacity: number, style: 'solid' | 'dashed' | 'dotted') => void;
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
  } else if (cleanHex.length === 4) {
    cleanHex = cleanHex.slice(0, 3).split('').map(char => char + char).join('');
  } else if (cleanHex.length > 6) {
    cleanHex = cleanHex.slice(0, 6);
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return { r: 41, g: 98, b: 255 };
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return { r, g, b };
}

export function isColorTransparent(color: string | undefined | null): boolean {
  if (!color) return true;
  const cleaned = String(color).replace(/\s+/g, '').toLowerCase();
  if (cleaned === 'transparent' || cleaned === 'none' || cleaned === 'rgba(0,0,0,0)' || cleaned === '#00000000' || cleaned === '#0000') return true;
  if (cleaned.startsWith('rgba(')) {
    const parts = cleaned.match(/[\d.]+/g);
    if (parts && parts.length >= 4) {
      return parseFloat(parts[3]) === 0;
    }
  }
  if (cleaned.startsWith('#') && (cleaned.length === 5 || cleaned.length === 9)) {
    const raw = cleaned.slice(1);
    const alphaHex = raw.length === 4 ? raw[3] + raw[3] : raw.slice(6, 8);
    return parseInt(alphaHex, 16) === 0;
  }
  return false;
}

export function parseColorAndAlpha(colorStr: string | undefined | null, fallbackOpacity: number = 1): { hex: string; opacity: number } {
  if (!colorStr || isColorTransparent(colorStr)) {
    return { hex: '#2962ff', opacity: 0 };
  }

  const str = String(colorStr).trim();

  // Handle #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  if (str.startsWith('#')) {
    const raw = str.slice(1);
    if (raw.length === 3) {
      const r = raw[0] + raw[0];
      const g = raw[1] + raw[1];
      const b = raw[2] + raw[2];
      return { hex: `#${r}${g}${b}`.toLowerCase(), opacity: fallbackOpacity };
    }
    if (raw.length === 4) {
      const r = raw[0] + raw[0];
      const g = raw[1] + raw[1];
      const b = raw[2] + raw[2];
      const a = parseInt(raw[3] + raw[3], 16) / 255;
      return { hex: `#${r}${g}${b}`.toLowerCase(), opacity: Math.round(a * 100) / 100 };
    }
    if (raw.length === 6) {
      return { hex: str.toLowerCase(), opacity: fallbackOpacity };
    }
    if (raw.length === 8) {
      const hex = `#${raw.slice(0, 6)}`.toLowerCase();
      const a = parseInt(raw.slice(6, 8), 16) / 255;
      return { hex, opacity: Math.round(a * 100) / 100 };
    }
  }

  // Handle rgba(...)
  if (str.startsWith('rgba')) {
    const parts = str.match(/[\d.]+/g);
    if (parts && parts.length >= 4) {
      const r = Math.min(255, Math.max(0, parseInt(parts[0])));
      const g = Math.min(255, Math.max(0, parseInt(parts[1])));
      const b = Math.min(255, Math.max(0, parseInt(parts[2])));
      const a = parseFloat(parts[3]);
      if (a === 0) {
        return { hex: '#2962ff', opacity: 0 };
      }
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toLowerCase();
      return { hex, opacity: isNaN(a) ? fallbackOpacity : Math.min(1, Math.max(0, Math.round(a * 100) / 100)) };
    }
  }

  // Handle rgb(...)
  if (str.startsWith('rgb')) {
    const parts = str.match(/[\d.]+/g);
    if (parts && parts.length >= 3) {
      const r = Math.min(255, Math.max(0, parseInt(parts[0])));
      const g = Math.min(255, Math.max(0, parseInt(parts[1])));
      const b = Math.min(255, Math.max(0, parseInt(parts[2])));
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toLowerCase();
      return { hex, opacity: fallbackOpacity };
    }
  }

  // Handle named colors / hsl via canvas fallback if available
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = str;
        const computed = ctx.fillStyle;
        if (computed && computed !== str) {
          if (computed.startsWith('#') || computed.startsWith('rgb') || computed.startsWith('rgba')) {
            return parseColorAndAlpha(computed, fallbackOpacity);
          }
        }
      }
    } catch (e) {}
  }

  return { hex: str.startsWith('#') ? str.toLowerCase() : '#2962ff', opacity: fallbackOpacity };
}

export default function ColorStylePicker({
  color,
  opacity,
  style = 'solid',
  hideStyleSelector = false,
  isTextColorPicker = false,
  isFillColorPicker = false,
  isBorderColorPicker = false,
  isPureColorBox = false,
  boxSize = 28,
  alignLeft = false,
  forceDark = false,
  onChange
}: ColorStylePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { hex, opacity: parsedAlpha } = parseColorAndAlpha(color, opacity !== undefined ? opacity : 1);
  const effectiveOpacity = opacity !== undefined ? opacity : parsedAlpha;
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
    if (forceDark) return;
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
  }, [forceDark]);

  const isLight = !forceDark && chromeTheme === 'light';

  const isNone = isColorTransparent(color) || effectiveOpacity === 0;
  const finalOpacity = isNone ? 0 : (effectiveOpacity > 0 ? effectiveOpacity : 1);
  const rgba = isNone ? 'transparent' : `rgba(${r}, ${g}, ${b}, ${finalOpacity})`;

  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number } | null>(null);

  const getComputedCoords = () => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const estHeight = hideStyleSelector ? 285 : 340;
    const estWidth = 236;

    let top = rect.bottom + 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < estHeight && spaceAbove > estHeight) {
      top = rect.top - estHeight - 4;
    } else if (top + estHeight > window.innerHeight) {
      top = Math.max(10, window.innerHeight - estHeight - 10);
    }

    let left = alignLeft ? rect.left : (rect.right - estWidth);
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

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      
      const handleScrollOrResize = () => {
        const nextCoords = getComputedCoords();
        if (nextCoords) setPopoverCoords(nextCoords);
      };

      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
        window.removeEventListener('resize', handleScrollOrResize);
        window.removeEventListener('scroll', handleScrollOrResize, true);
      };
    }
  }, [isOpen, alignLeft, hideStyleSelector]);

  const handleSelectColor = (selectedHex: string) => {
    const nextOpacity = isNone || effectiveOpacity === 0 ? 1 : effectiveOpacity;
    onChange(selectedHex, nextOpacity, style);
  };

  const handleSelectNone = () => {
    onChange('transparent', 0, style);
  };

  const triggerCustomColorPicker = () => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.click();
    }
  };

  const handleOpacityChange = (newOpacity: number) => {
    if (newOpacity === 0) {
      onChange('transparent', 0, style);
    } else {
      const targetHex = isNone || !hex ? '#2962ff' : hex;
      onChange(targetHex, newOpacity, style);
    }
  };

  const handleStyleChange = (newStyle: 'solid' | 'dashed' | 'dotted') => {
    onChange(isNone ? 'transparent' : hex, isNone ? 0 : effectiveOpacity, newStyle);
  };

  const renderStyleIcon = (btnStyle: 'solid' | 'dashed' | 'dotted', isSelected = false) => {
    const strokeColor = isSelected ? '#ffffff' : (isLight ? '#5d606b' : '#868993');
    if (btnStyle === 'solid') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <line x1="2" y1="12" x2="22" y2="12" stroke={strokeColor} strokeWidth="2.5" />
        </svg>
      );
    }
    if (btnStyle === 'dashed') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <line x1="2" y1="12" x2="22" y2="12" stroke={strokeColor} strokeWidth="2.5" strokeDasharray="5,3" />
        </svg>
      );
    }
    // dotted
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <line x1="2" y1="12" x2="22" y2="12" stroke={strokeColor} strokeWidth="2.5" strokeDasharray="0, 5" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={isPureColorBox ? {
          width: hideStyleSelector ? '28px' : `${boxSize}px`,
          height: '26px',
          borderRadius: '4px',
          border: isOpen ? '1.5px solid #2962ff' : (isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39'),
          backgroundColor: isLight ? '#ffffff' : '#1c2030',
          cursor: 'pointer',
          padding: '2px',
          outline: 'none',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s, background-color 0.15s'
        } : isTextColorPicker ? {
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '0',
          outline: 'none',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px'
        } : (isFillColorPicker || isBorderColorPicker) ? {
          backgroundColor: isHovered || isOpen ? (isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.08)') : 'transparent',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          padding: '4px',
          outline: 'none',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '26px',
          gap: '1px',
          transition: 'background-color 0.15s'
        } : {
          width: hideStyleSelector ? '28px' : '76px',
          height: '26px',
          borderRadius: '4px',
          border: isOpen ? '1.5px solid #2962ff' : (isLight ? '1px solid #d1d4dc' : '1px solid #2a2e39'),
          backgroundColor: isLight ? '#ffffff' : '#1c2030',
          cursor: 'pointer',
          padding: '2px',
          outline: 'none',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: hideStyleSelector ? 'center' : 'flex-start',
          gap: '6px',
          transition: 'border-color 0.15s, background-color 0.15s'
        }}
      >
        {isPureColorBox ? (
          <div 
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '3px',
              background: isNone
                ? `repeating-conic-gradient(${isLight ? '#d1d4dc 0% 25%, #ffffff 0% 50%' : '#2a2e39 0% 25%, #131722 0% 50%'}) 50% / 6px 6px`
                : `linear-gradient(to right, ${rgba}, ${rgba}), repeating-conic-gradient(${isLight ? '#d1d4dc 0% 25%, #ffffff 0% 50%' : '#2a2e39 0% 25%, #131722 0% 50%'}) 50% / 6px 6px`,
              border: isLight ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.1)',
              boxSizing: 'border-box',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isNone && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <line x1="2" y1="14" x2="14" y2="2" stroke="#f23645" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </div>
        ) : isTextColorPicker ? (
          <>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: isLight ? '#131722' : '#d1d4dc', lineHeight: '1' }}>A</span>
            {isNone ? (
              <div style={{ width: '14px', height: '3px', backgroundColor: '#f23645', marginTop: '2px', borderRadius: '1px' }} />
            ) : (
              <div style={{ width: '14px', height: '3px', backgroundColor: rgba, marginTop: '2px', borderRadius: '1px' }} />
            )}
          </>
        ) : isBorderColorPicker ? (
          <>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ marginTop: '1px' }}>
              <rect x="2" y="2" width="12" height="12" rx="1.5" stroke={isHovered || isOpen ? (isLight ? "#131722" : "#ffffff") : (isLight ? "#5d606b" : "#d1d4dc")} strokeWidth="1.4" />
              <line x1="8" y1="2" x2="8" y2="14" stroke={isHovered || isOpen ? (isLight ? "#131722" : "#ffffff") : (isLight ? "#5d606b" : "#d1d4dc")} strokeWidth="1" strokeDasharray="1.5 1.5" />
              <line x1="2" y1="8" x2="14" y2="8" stroke={isHovered || isOpen ? (isLight ? "#131722" : "#ffffff") : (isLight ? "#5d606b" : "#d1d4dc")} strokeWidth="1" strokeDasharray="1.5 1.5" />
            </svg>
            {isNone ? (
              <div style={{ width: '14px', height: '3px', backgroundColor: '#f23645', marginTop: '2px', borderRadius: '1px' }} />
            ) : (
              <div style={{ width: '14px', height: '3px', backgroundColor: rgba, marginTop: '2px', borderRadius: '1px' }} />
            )}
          </>
        ) : isFillColorPicker ? (
          <>
            <svg width="15" height="15" viewBox="0 0 991.5 991.5" style={{ marginTop: '1px', transform: 'scaleX(-1)' }}>
              <path d="M100.8,540.801H501c11.5,0,20.8,9.299,20.8,20.799v26.6c0.2,0,0.5,0,0.7,0h78.6c0.2,0,0.5,0,0.7,0v-26.6 C601.8,506,556.6,460.8,501,460.8H100.8c-11.5,0-20.8-9.3-20.8-20.8V273.5c0-11.5,9.3-20.8,20.8-20.8h11.1v-80h-11.1 C45.2,172.7,0,217.9,0,273.5V440C0,495.6,45.2,540.801,100.8,540.801z" fill={isHovered || isOpen ? (isLight ? '#131722' : '#ffffff') : (isLight ? '#5d606b' : '#868993')} style={{ transition: 'fill 0.15s' }} />
              <path d="M931.5,21.5H231.9c-33.1,0-60,26.9-60,60v206.3c0,33.1,26.9,60,60,60h699.6c33.1,0,60-26.9,60-60V81.5 C991.5,48.3,964.6,21.5,931.5,21.5z" fill={isNone ? 'transparent' : rgba} />
              <path d="M601.7,618.199c-0.2,0-0.5,0-0.7,0h-78.5c-0.2,0-0.5,0-0.7,0c-32.8,0.4-59.3,27.102-59.3,60V910c0,33.1,26.9,60,60,60h78.6 c33.101,0,60-26.9,60-60V678.199C661,645.301,634.6,618.6,601.7,618.199z" fill={isHovered || isOpen ? (isLight ? '#131722' : '#ffffff') : (isLight ? '#5d606b' : '#868993')} style={{ transition: 'fill 0.15s' }} />
            </svg>
            {isNone ? (
              <div
                style={{
                  width: '14px',
                  height: '3px',
                  borderRadius: '1px',
                  background: `repeating-conic-gradient(${isLight ? '#d1d4dc 0% 25%, #ffffff 0% 50%' : '#2a2e39 0% 25%, #131722 0% 50%'}) 50% / 3px 3px`,
                  border: '1px solid #f23645',
                  boxSizing: 'border-box',
                  marginTop: '2px'
                }}
              />
            ) : (
              <div style={{ width: '14px', height: '3px', backgroundColor: rgba, marginTop: '2px', borderRadius: '1px' }} />
            )}
          </>
        ) : (
          <>
            {/* Color Block */}
            <div 
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '3px',
                background: isNone
                  ? `repeating-conic-gradient(${isLight ? '#d1d4dc 0% 25%, #ffffff 0% 50%' : '#2a2e39 0% 25%, #131722 0% 50%'}) 50% / 6px 6px`
                  : `linear-gradient(to right, ${rgba}, ${rgba}), repeating-conic-gradient(${isLight ? '#d1d4dc 0% 25%, #ffffff 0% 50%' : '#2a2e39 0% 25%, #131722 0% 50%'}) 50% / 6px 6px`,
                border: isLight ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.1)',
                boxSizing: 'border-box',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {isNone && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <line x1="2" y1="14" x2="14" y2="2" stroke="#f23645" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>

            {/* Style preview line overlay */}
            {!hideStyleSelector && (
              <div style={{ pointerEvents: 'none', flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {style === 'solid' && (
                  <svg width="34" height="2" viewBox="0 0 34 2" fill="none">
                    <line x1="0" y1="1" x2="34" y2="1" stroke={isNone ? (isLight ? '#b2b5be' : '#787b86') : rgba} strokeWidth="2" />
                  </svg>
                )}
                {style === 'dashed' && (
                  <svg width="34" height="2" viewBox="0 0 34 2" fill="none">
                    <line x1="0" y1="1" x2="34" y2="1" stroke={isNone ? (isLight ? '#b2b5be' : '#787b86') : rgba} strokeWidth="2.5" strokeDasharray="5,3" />
                  </svg>
                )}
                {style === 'dotted' && (
                  <svg width="34" height="2" viewBox="0 0 34 2" fill="none">
                    <line x1="2" y1="1" x2="32" y2="1" stroke={isNone ? (isLight ? '#b2b5be' : '#787b86') : rgba} strokeWidth="2.5" strokeDasharray="0, 5" strokeLinecap="round" />
                  </svg>
                )}
              </div>
            )}
          </>
        )}
      </button>

      {/* Hidden native input for custom color picker "+" */}
      <input
        ref={hiddenInputRef}
        type="color"
        value={hex}
        onChange={(e) => {
          const nextOpacity = effectiveOpacity === 0 ? 1 : effectiveOpacity;
          onChange(e.target.value, nextOpacity, style);
        }}
        style={{ display: 'none' }}
      />

      {/* Popover Dropdown Portal (Floats seamlessly outside all modals/panels) */}
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
                {row.map((swatchHex, colIndex) => {
                  const isSelected = !isNone && hex.toLowerCase() === swatchHex.toLowerCase();
                  return (
                    <button
                      key={colIndex}
                      onClick={() => handleSelectColor(swatchHex)}
                      style={{
                        width: '18px',
                        height: '18px',
                        backgroundColor: swatchHex,
                        border: isSelected ? '1.5px solid #2962ff' : (isLight ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.1)'),
                        borderRadius: '2px',
                        cursor: 'pointer',
                        padding: 0,
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'transform 0.1s, border-color 0.1s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                        e.currentTarget.style.zIndex = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.zIndex = '0';
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
                value={Math.round(finalOpacity * 100)}
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
              {Math.round(finalOpacity * 100)}%
            </div>
          </div>

          {/* Line Style Selector */}
          {!hideStyleSelector && (
            <div style={{ marginTop: '12px', borderTop: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', color: isLight ? '#787b86' : '#868993', marginBottom: '6px' }}>Line Style</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['solid', 'dashed', 'dotted'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStyleChange(s)}
                    style={{
                      flex: 1,
                      height: '26px',
                      backgroundColor: style === s ? '#2962ff' : (isLight ? '#f0f3fa' : '#2a2e39'),
                      border: isLight && style !== s ? '1px solid #e0e3eb' : 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                  >
                    {renderStyleIcon(s, style === s)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Action Row: Custom Color Button "+" and None box right beside it */}
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
