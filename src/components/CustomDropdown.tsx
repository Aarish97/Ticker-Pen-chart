import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
  value: string | number;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface CustomDropdownProps {
  value: string | number;
  options: (DropdownOption | string | number)[];
  onChange: (value: any) => void;
  width?: string | number;
  height?: string | number;
  placeholder?: string;
  showCheckmark?: boolean;
  align?: 'left' | 'right';
  className?: string;
  style?: React.CSSProperties;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  options,
  onChange,
  width = 'auto',
  height = 28,
  placeholder = 'Select...',
  showCheckmark = true,
  align = 'left',
  style
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number; minWidth: number } | null>(null);

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

  // Normalize options to DropdownOption objects
  const normalizedOptions: DropdownOption[] = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null && 'value' in opt) {
      return opt as DropdownOption;
    }
    return { value: opt, label: String(opt) };
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  const getComputedCoords = () => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const estHeight = Math.min(220, normalizedOptions.length * 32 + 8);
    const minWidth = Math.max(rect.width, 90);

    let top = rect.bottom + 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < estHeight && spaceAbove > estHeight) {
      top = rect.top - estHeight - 4;
    } else if (top + estHeight > window.innerHeight) {
      top = Math.max(10, window.innerHeight - estHeight - 10);
    }

    let left = rect.left;
    if (align === 'right') {
      left = rect.right - minWidth;
    }
    if (left + minWidth > window.innerWidth - 10) {
      left = window.innerWidth - minWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    return { top, left, minWidth };
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
  }, [isOpen, normalizedOptions.length]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', width: typeof width === 'number' ? `${width}px` : width, ...style }}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          height: typeof height === 'number' ? `${height}px` : height,
          backgroundColor: isLight ? '#ffffff' : '#131722',
          color: isLight ? '#131722' : '#d1d4dc',
          border: isOpen ? '1px solid #2962ff' : (isLight ? '1px solid #d1d4dc' : '1px solid #363a45'),
          borderRadius: '4px',
          padding: '0 8px 0 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          outline: 'none',
          fontSize: '13px',
          fontFamily: "'Rubik', sans-serif",
          boxSizing: 'border-box',
          userSelect: 'none',
          gap: '6px',
          transition: 'border-color 0.15s, background-color 0.15s'
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = isLight ? '#b2b5be' : '#434651';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = isLight ? '#d1d4dc' : '#363a45';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption?.icon && <span style={{ display: 'flex', alignItems: 'center' }}>{selectedOption.icon}</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          size={14}
          color="#787b86"
          style={{
            flexShrink: 0,
            transition: 'transform 0.15s ease',
            transform: isOpen ? 'rotate(180deg)' : 'none'
          }}
        />
      </button>

      {/* Popover Dropdown Portal */}
      {isOpen && popoverCoords && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            top: `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
            minWidth: `${popoverCoords.minWidth}px`,
            backgroundColor: isLight ? '#ffffff' : '#1e222d',
            border: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
            borderRadius: '6px',
            padding: '4px 0',
            boxShadow: isLight ? '0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06)' : '0 8px 24px rgba(0, 0, 0, 0.75), 0 2px 6px rgba(0, 0, 0, 0.4)',
            zIndex: 9999999,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '220px',
            overflowY: 'auto',
            fontFamily: "'Rubik', sans-serif",
            boxSizing: 'border-box'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {normalizedOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={String(opt.value)}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  padding: '7px 12px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: isSelected ? '#2962ff' : (isLight ? '#131722' : '#d1d4dc'),
                  backgroundColor: isSelected ? (isLight ? 'rgba(41, 98, 255, 0.08)' : 'rgba(41, 98, 255, 0.12)') : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  userSelect: 'none',
                  transition: 'background-color 0.1s, color 0.1s'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = isLight ? '#f0f3fa' : 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.color = isLight ? '#131722' : '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = isLight ? '#131722' : '#d1d4dc';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {opt.icon && <span style={{ display: 'flex', alignItems: 'center' }}>{opt.icon}</span>}
                  <span>{opt.label}</span>
                </div>
                {isSelected && showCheckmark && (
                  <Check size={14} color="#2962ff" style={{ flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

export default CustomDropdown;
