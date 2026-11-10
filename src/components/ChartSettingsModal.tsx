import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ColorPicker from './ColorPicker';
import ColorStylePicker from './ColorStylePicker';
import CustomDropdown from './CustomDropdown';
import { ShortcutsSettingsTab } from './ShortcutsSettingsTab';

export interface ChartSettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onApply?: (styles: any) => void;
}


interface CustomNumberInputProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  width?: string;
  suffix?: string;
}

const CustomNumberInput = ({ value, min, max, onChange, width = '94px', suffix = '%' }: CustomNumberInputProps) => {
  const intervalRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const startChanging = (direction: 'up' | 'down') => {
    stopChanging();
    const step = direction === 'up' ? 1 : -1;
    const nextVal = Math.max(min, Math.min(max, valueRef.current + step));
    onChangeRef.current(nextVal);

    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        const next = Math.max(min, Math.min(max, valueRef.current + step));
        onChangeRef.current(next);
      }, 80);
    }, 350);
  };

  const stopChanging = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return stopChanging;
  }, []);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return (document.body.getAttribute('data-chrome-theme') === 'light' ||
              document.documentElement.getAttribute('data-chrome-theme') === 'light') ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const handleTheme = (e: any) => {
      setTheme(e.detail?.theme || (document.body.getAttribute('data-chrome-theme') === 'light' ? 'light' : 'dark'));
    };
    window.addEventListener('chrome-theme-changed', handleTheme);
    return () => window.removeEventListener('chrome-theme-changed', handleTheme);
  }, []);

  const isLight = theme === 'light';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div 
        style={{ 
          position: 'relative', 
          width: width, 
          height: '34px',
          boxSizing: 'border-box'
        }}
      >
        <input 
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
          className="custom-spinner-input"
          style={{ 
            backgroundColor: isLight ? '#ffffff' : '#131722', 
            color: isLight ? '#131722' : '#ffffff', 
            border: isLight ? '1px solid #d1d4dc' : '1px solid #434651', 
            borderRadius: '6px', 
            padding: '6px 28px 6px 12px', 
            width: '100%', 
            height: '34px',
            outline: 'none', 
            fontSize: '14px', 
            textAlign: 'center',
            boxSizing: 'border-box',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'textfield'
          }} 
        />
        <style>{`
          .custom-spinner-input::-webkit-inner-spin-button, 
          .custom-spinner-input::-webkit-outer-spin-button { 
            -webkit-appearance: none !important; 
            margin: 0 !important; 
          }
        `}</style>
        <div 
          style={{ 
            position: 'absolute', 
            right: '6px', 
            top: '2px', 
            bottom: '2px', 
            width: '20px', 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '2px'
          }}
        >
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); startChanging('up'); }}
            onMouseUp={stopChanging}
            onTouchStart={(e) => { e.preventDefault(); startChanging('up'); }}
            onTouchEnd={stopChanging}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '14px',
              color: isLight ? '#787b86' : '#868993',
              outline: 'none',
              userSelect: 'none'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = isLight ? '#131722' : '#ffffff'}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = isLight ? '#787b86' : '#868993';
              stopChanging();
            }}
          >
            <svg width="8" height="4" viewBox="0 0 8.66 4.54" style={{ transform: 'rotate(180deg)', display: 'block', pointerEvents: 'none' }}>
              <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M0,0.752L0.66,0l3.67,3.212L8,0l0.66,0.752L4.33,4.54L0,0.752z"/>
            </svg>
          </button>
          
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); startChanging('down'); }}
            onMouseUp={stopChanging}
            onTouchStart={(e) => { e.preventDefault(); startChanging('down'); }}
            onTouchEnd={stopChanging}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '14px',
              color: isLight ? '#787b86' : '#868993',
              outline: 'none',
              userSelect: 'none'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = isLight ? '#131722' : '#ffffff'}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = isLight ? '#787b86' : '#868993';
              stopChanging();
            }}
          >
            <svg width="8" height="4" viewBox="0 0 8.66 4.54" style={{ display: 'block', pointerEvents: 'none' }}>
              <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M0,0.752L0.66,0l3.67,3.212L8,0l0.66,0.752L4.33,4.54L0,0.752z"/>
            </svg>
          </button>
        </div>
      </div>
      <span style={{ fontSize: '14px', color: isLight ? '#131722' : '#d1d4dc' }}>{suffix}</span>
    </div>
  );
};

interface CustomSelectProps {
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (val: any) => void;
  width?: string;
}

const CustomSelect = ({ value, options, onChange, width = '180px' }: CustomSelectProps) => {
  return (
    <CustomDropdown
      value={value}
      options={options}
      onChange={onChange}
      width={width}
      height={28}
    />
  );
};

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
}

const CustomCheckbox = ({ checked, onChange, label }: CustomCheckboxProps) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return (document.body.getAttribute('data-chrome-theme') === 'light' ||
              document.documentElement.getAttribute('data-chrome-theme') === 'light') ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const handleTheme = (e: any) => {
      setTheme(e.detail?.theme || (document.body.getAttribute('data-chrome-theme') === 'light' ? 'light' : 'dark'));
    };
    window.addEventListener('chrome-theme-changed', handleTheme);
    return () => window.removeEventListener('chrome-theme-changed', handleTheme);
  }, []);

  const isLight = theme === 'light';

  return (
    <label 
      style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: '10px', 
        cursor: 'pointer', 
        userSelect: 'none' 
      }}
    >
      <div 
        onClick={() => onChange(!checked)}
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: checked 
            ? '1px solid #2962ff' 
            : (isLight ? '2px solid #b2b5be' : '2px solid #868993'),
          backgroundColor: checked 
            ? '#2962ff' 
            : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
          boxSizing: 'border-box'
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ display: 'block' }}>
            <path 
              d="M1.5 4L4 6.5L8.5 1.5" 
              stroke="#ffffff" 
              strokeWidth="2.2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
        )}
      </div>
      {label && <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>{label}</span>}
    </label>
  );
};


export const ChartSettingsModal: React.FC<ChartSettingsModalProps> = ({ isOpen: propIsOpen, onClose, onApply }) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isSettingsOpen = propIsOpen !== undefined ? propIsOpen : internalIsOpen;

  const setIsSettingsOpen = (val: boolean) => {
    setInternalIsOpen(val);
    if (!val && onClose) {
      onClose();
    }
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return (document.body.getAttribute('data-chrome-theme') === 'light' ||
              document.documentElement.getAttribute('data-chrome-theme') === 'light') ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const handleTheme = (e: any) => {
      setTheme(e.detail?.theme || (document.body.getAttribute('data-chrome-theme') === 'light' ? 'light' : 'dark'));
    };
    window.addEventListener('chrome-theme-changed', handleTheme);
    return () => window.removeEventListener('chrome-theme-changed', handleTheme);
  }, []);

  const isLight = theme === 'light';

  const [chartType, setChartType] = useState<string>(() => {
    return localStorage.getItem('chart_type') || 'candle_solid';
  });

  // Listen for chart type changes from the top bar dropdown in TickerPenProWidget
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'chart_type' && e.newValue) {
        setChartType(e.newValue);
      }
    };
    // Also poll localStorage for same-window changes (StorageEvent only fires cross-tab)
    const interval = setInterval(() => {
      const current = localStorage.getItem('chart_type') || 'candle_solid';
      setChartType(prev => prev !== current ? current : prev);
    }, 300);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  // Load saved styles from localStorage on initial render
  const savedStylesObj = (() => {
    try {
      const saved = localStorage.getItem('__custom_settings_styles__');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.warn('Error reading from localStorage', e);
      return null;
    }
  })();

  const getSavedStyle = (key: string, defaultValue: any) => {
    if (savedStylesObj && savedStylesObj[key] !== undefined) {
      let val = savedStylesObj[key];
      if (val === '#00e676') return '#089981';
      if (val === '#ff3d00') return '#f23645';
      return val;
    }
    if (defaultValue === '#00e676') return '#089981';
    if (defaultValue === '#ff3d00') return '#f23645';
    return defaultValue;
  };


  const [candleUpColor, setCandleUpColor] = useState<string>(() => getSavedStyle('candleUpColor', '#089981'));
  const [candleDownColor, setCandleDownColor] = useState<string>(() => getSavedStyle('candleDownColor', '#f23645'));
  const [candleUpBorderColor, setCandleUpBorderColor] = useState<string>(() => getSavedStyle('candleUpBorderColor', '#089981'));
  const [candleDownBorderColor, setCandleDownBorderColor] = useState<string>(() => getSavedStyle('candleDownBorderColor', '#f23645'));
  const [candleUpWickColor, setCandleUpWickColor] = useState<string>(() => getSavedStyle('candleUpWickColor', '#089981'));
  const [candleDownWickColor, setCandleDownWickColor] = useState<string>(() => getSavedStyle('candleDownWickColor', '#f23645'));
  // Area chart specific colors
  const [areaLineColor, setAreaLineColor] = useState<string>(() => getSavedStyle('areaLineColor', '#2979ff'));
  const [areaFillColor, setAreaFillColor] = useState<string>(() => getSavedStyle('areaFillColor', '#2979ff'));
  const [gridShow, setGridShow] = useState<boolean>(() => getSavedStyle('gridShow', true));
  const [gridHorizontalShow, setGridHorizontalShow] = useState<boolean>(() => getSavedStyle('gridHorizontalShow', true));
  const [gridVerticalShow, setGridVerticalShow] = useState<boolean>(() => getSavedStyle('gridVerticalShow', true));
  const [gridVerticalColor, setGridVerticalColor] = useState<string>(() => getSavedStyle('gridVerticalColor', '#3c4050'));
  const [gridVerticalOpacity, setGridVerticalOpacity] = useState<number>(() => getSavedStyle('gridVerticalOpacity', 0.1));
  const [gridVerticalStyle, setGridVerticalStyle] = useState<'solid' | 'dashed' | 'dotted'>(() => getSavedStyle('gridVerticalStyle', 'dashed'));
  const [gridHorizontalColor, setGridHorizontalColor] = useState<string>(() => getSavedStyle('gridHorizontalColor', '#3c4050'));
  const [gridHorizontalOpacity, setGridHorizontalOpacity] = useState<number>(() => getSavedStyle('gridHorizontalOpacity', 0.1));
  const [gridHorizontalStyle, setGridHorizontalStyle] = useState<'solid' | 'dashed' | 'dotted'>(() => getSavedStyle('gridHorizontalStyle', 'dashed'));
  const [bgType, setBgType] = useState<'solid' | 'gradient'>(() => getSavedStyle('bgType', 'gradient'));
  const [bgColor, setBgColor] = useState<string>(() => getSavedStyle('bgColor', '#131722'));
  const [bgColor2, setBgColor2] = useState<string>(() => getSavedStyle('bgColor2', '#1e222d'));
  const [bgOpacity, setBgOpacity] = useState<number>(() => getSavedStyle('bgOpacity', 1.0));
  
  // Crosshair states
  const [crosshairShow, setCrosshairShow] = useState<boolean>(() => getSavedStyle('crosshairShow', true));
  const [crosshairColor, setCrosshairColor] = useState<string>(() => getSavedStyle('crosshairColor', '#2979ff'));
  const [crosshairOpacity, setCrosshairOpacity] = useState<number>(() => getSavedStyle('crosshairOpacity', 1.0));
  const [crosshairStyle, setCrosshairStyle] = useState<'solid' | 'dashed' | 'dotted'>(() => getSavedStyle('crosshairStyle', 'solid'));
  const [crosshairWidth, setCrosshairWidth] = useState<number>(() => getSavedStyle('crosshairWidth', 1));
  const [crosshairHorizontalShow, setCrosshairHorizontalShow] = useState<boolean>(() => getSavedStyle('crosshairHorizontalShow', true));
  const [crosshairVerticalShow, setCrosshairVerticalShow] = useState<boolean>(() => getSavedStyle('crosshairVerticalShow', true));
  const [crosshairLabelBgColor, setCrosshairLabelBgColor] = useState<string>(() => getSavedStyle('crosshairLabelBgColor', '#2a2e39'));
  const [crosshairLabelTextColor, setCrosshairLabelTextColor] = useState<string>(() => getSavedStyle('crosshairLabelTextColor', '#ffffff'));

  // Watermark states
  const [watermarkType, setWatermarkType] = useState<'all' | 'none'>(() => getSavedStyle('watermarkType', 'all'));
  const [watermarkColor, setWatermarkColor] = useState<string>(() => getSavedStyle('watermarkColor', '#ffffff'));
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(() => getSavedStyle('watermarkOpacity', 0.04));
  const [watermarkShowTicker, setWatermarkShowTicker] = useState<boolean>(() => getSavedStyle('watermarkShowTicker', true));
  const [watermarkShowInterval, setWatermarkShowInterval] = useState<boolean>(() => getSavedStyle('watermarkShowInterval', true));
  const [watermarkShowDescription, setWatermarkShowDescription] = useState<boolean>(() => getSavedStyle('watermarkShowDescription', true));
  const [watermarkShowReplay, setWatermarkShowReplay] = useState<boolean>(() => getSavedStyle('watermarkShowReplay', true));

  // Scales states
  const [scalesTextColor, setScalesTextColor] = useState<string>(() => getSavedStyle('scalesTextColor', '#868993'));
  const [scalesTextSize, setScalesTextSize] = useState<number>(() => getSavedStyle('scalesTextSize', 11));
  const [scalesLineColor, setScalesLineColor] = useState<string>(() => getSavedStyle('scalesLineColor', '#2a2e39'));
  const [scalesLineOpacity, setScalesLineOpacity] = useState<number>(() => getSavedStyle('scalesLineOpacity', 1.0));

  // Buttons states
  const [navigationVisibility, setNavigationVisibility] = useState<'always' | 'hover' | 'hidden'>(() => getSavedStyle('navigationVisibility', 'hover'));
  const [paneButtonsVisibility, setPaneButtonsVisibility] = useState<'always' | 'hover' | 'hidden'>(() => getSavedStyle('paneButtonsVisibility', 'hover'));

  // Margins states
  const [marginTop, setMarginTop] = useState<number>(() => getSavedStyle('marginTop', 0));
  const [marginBottom, setMarginBottom] = useState<number>(() => getSavedStyle('marginBottom', 0));
  const [marginRight, setMarginRight] = useState<number>(() => getSavedStyle('marginRight', 10));

  // Interaction states
  const [zoomEnabled, setZoomEnabled] = useState<boolean>(() => getSavedStyle('zoomEnabled', true));
  const [scrollEnabled, setScrollEnabled] = useState<boolean>(() => getSavedStyle('scrollEnabled', true));
  const [zoomSpeed, setZoomSpeed] = useState<number>(() => getSavedStyle('zoomSpeed', 2));

  // Scales & Lines tab states
  const [scalesCurrencyUnit, setScalesCurrencyUnit] = useState<string>(() => getSavedStyle('scalesCurrencyUnit', 'always'));
  const [scalesModes, setScalesModes] = useState<string>(() => getSavedStyle('scalesModes', 'hover'));
  const [scalesLockRatio, setScalesLockRatio] = useState<boolean>(() => getSavedStyle('scalesLockRatio', false));
  const [scalesLockRatioValue, setScalesLockRatioValue] = useState<string>(() => getSavedStyle('scalesLockRatioValue', '1735155.6128899'));
  const [scalesPlacement, setScalesPlacement] = useState<string>(() => getSavedStyle('scalesPlacement', 'right'));
  const [scalesNoOverlap, setScalesNoOverlap] = useState<boolean>(() => getSavedStyle('scalesNoOverlap', true));
  const [scalesPlusButton, setScalesPlusButton] = useState<boolean>(() => getSavedStyle('scalesPlusButton', true));
  const [scalesCountdown, setScalesCountdown] = useState<boolean>(() => getSavedStyle('scalesCountdown', false));
  const [scalesHighPrice, setScalesHighPrice] = useState<boolean>(() => getSavedStyle('scalesHighPrice', false));
  const [scalesLowPrice, setScalesLowPrice] = useState<boolean>(() => getSavedStyle('scalesLowPrice', false));
  const [scalesPriceScaleType, setScalesPriceScaleType] = useState<string>(() => getSavedStyle('scalesPriceScaleType', 'normal'));
  const [scalesPriceScaleReverse, setScalesPriceScaleReverse] = useState<boolean>(() => getSavedStyle('scalesPriceScaleReverse', false));
  const [scalesSymbolType, setScalesSymbolType] = useState<string>(() => getSavedStyle('scalesSymbolType', 'name_value_line'));
  const [scalesSymbolValueType, setScalesSymbolValueType] = useState<string>(() => getSavedStyle('scalesSymbolValueType', 'scale'));
  const [scalesSymbolColor, setScalesSymbolColor] = useState<string>(() => getSavedStyle('scalesSymbolColor', 'rgba(0, 230, 118, 0.8)'));
  const [scalesPrevClose, setScalesPrevClose] = useState<string>(() => getSavedStyle('scalesPrevClose', 'value'));
  const [scalesPrevCloseColor, setScalesPrevCloseColor] = useState<string>(() => getSavedStyle('scalesPrevCloseColor', '#787b86'));
  const [scalesIndicators, setScalesIndicators] = useState<string>(() => getSavedStyle('scalesIndicators', 'hidden'));
  const [scalesHighLow, setScalesHighLow] = useState<string>(() => getSavedStyle('scalesHighLow', 'hidden'));
  const [scalesHighLowColor, setScalesHighLowColor] = useState<string>(() => getSavedStyle('scalesHighLowColor', 'rgba(255, 61, 0, 0.8)'));
  const [scalesBidAsk, setScalesBidAsk] = useState<string>(() => getSavedStyle('scalesBidAsk', 'hidden'));
  const [scalesBidColor, setScalesBidColor] = useState<string>(() => getSavedStyle('scalesBidColor', '#2979ff'));
  const [scalesAskColor, setScalesAskColor] = useState<string>(() => getSavedStyle('scalesAskColor', '#f23645'));
  const [scalesDayOfWeek, setScalesDayOfWeek] = useState<boolean>(() => getSavedStyle('scalesDayOfWeek', true));
  const [scalesDateFormat, setScalesDateFormat] = useState<string>(() => getSavedStyle('scalesDateFormat', "Mon 29 Sep '97"));
  const [scalesTimeFormat, setScalesTimeFormat] = useState<string>(() => getSavedStyle('scalesTimeFormat', '24h'));
  const [scalesSaveLeftEdge, setScalesSaveLeftEdge] = useState<boolean>(() => getSavedStyle('scalesSaveLeftEdge', false));
  const [scalesTimezone, setScalesTimezone] = useState<string>(() => getSavedStyle('scalesTimezone', 'Asia/Kolkata'));

  // Status Line style states
  const [statusLogo, setStatusLogo] = useState<boolean>(() => getSavedStyle('statusLogo', true));
  const [statusTitle, setStatusTitle] = useState<boolean>(() => getSavedStyle('statusTitle', true));
  const [statusTitleType, setStatusTitleType] = useState<'name' | 'symbol' | 'symbol_name'>(() => getSavedStyle('statusTitleType', 'symbol_name'));
  const [statusMarketStatus, setStatusMarketStatus] = useState<boolean>(() => getSavedStyle('statusMarketStatus', true));
  const [statusValues, setStatusValues] = useState<boolean>(() => getSavedStyle('statusValues', true));
  const [statusBarChange, setStatusBarChange] = useState<boolean>(() => getSavedStyle('statusBarChange', true));
  const [statusVolume, setStatusVolume] = useState<boolean>(() => getSavedStyle('statusVolume', true));
  const [statusLastDayChange, setStatusLastDayChange] = useState<boolean>(() => getSavedStyle('statusLastDayChange', true));
  const [statusIndicatorTitles, setStatusIndicatorTitles] = useState<boolean>(() => getSavedStyle('statusIndicatorTitles', true));
  const [statusIndicatorInputs, setStatusIndicatorInputs] = useState<boolean>(() => getSavedStyle('statusIndicatorInputs', false));
  const [statusIndicatorValues, setStatusIndicatorValues] = useState<boolean>(() => getSavedStyle('statusIndicatorValues', true));
  const [statusIndicatorBg, setStatusIndicatorBg] = useState<boolean>(() => getSavedStyle('statusIndicatorBg', true));
  const [statusIndicatorBgColor, setStatusIndicatorBgColor] = useState<string>(() => getSavedStyle('statusIndicatorBgColor', 'rgba(30, 34, 45, 0.6)'));

  // Backup styles for "Cancel" reversion
  const [backupStyles, setBackupStyles] = useState({
    candleUpColor: '#089981',
    candleDownColor: '#f23645',
    candleUpBorderColor: '#089981',
    candleDownBorderColor: '#f23645',
    candleUpWickColor: '#089981',
    candleDownWickColor: '#f23645',
    areaLineColor: '#2979ff',
    areaFillColor: '#2979ff',
    gridShow: true,
    gridHorizontalShow: true,
    gridVerticalShow: true,
    gridVerticalColor: '#3c4050',
    gridVerticalOpacity: 0.1,
    gridVerticalStyle: 'dashed' as 'solid' | 'dashed' | 'dotted',
    gridHorizontalColor: '#3c4050',
    gridHorizontalOpacity: 0.1,
    gridHorizontalStyle: 'dashed' as 'solid' | 'dashed' | 'dotted',
    bgType: 'gradient' as 'solid' | 'gradient',
    bgColor: '#131722',
    bgColor2: '#1e222d',
    bgOpacity: 1.0,
    crosshairShow: true,
    crosshairColor: '#2979ff',
    crosshairOpacity: 1.0,
    crosshairStyle: 'solid' as 'solid' | 'dashed' | 'dotted',
    crosshairWidth: 1,
    crosshairHorizontalShow: true,
    crosshairVerticalShow: true,
    crosshairLabelBgColor: '#2a2e39',
    crosshairLabelTextColor: '#ffffff',
    watermarkType: 'all' as 'all' | 'none',
    watermarkColor: '#ffffff',
    watermarkOpacity: 0.04,
    watermarkShowTicker: true,
    watermarkShowInterval: true,
    watermarkShowDescription: true,
    watermarkShowReplay: true,
    scalesTextColor: '#868993',
    scalesTextSize: 11,
    scalesLineColor: '#2a2e39',
    scalesLineOpacity: 1.0,
    navigationVisibility: 'hover' as 'always' | 'hover' | 'hidden',
    paneButtonsVisibility: 'hover' as 'always' | 'hover' | 'hidden',
    marginTop: 0,
    marginBottom: 0,
    marginRight: 10,
    zoomEnabled: true,
    scrollEnabled: true,
    zoomSpeed: 2,
    
    // Scales & Lines
    scalesCurrencyUnit: 'always',
    scalesModes: 'hover',
    scalesLockRatio: false,
    scalesLockRatioValue: '1735155.6128899',
    scalesPlacement: 'right',
    scalesNoOverlap: true,
    scalesPlusButton: true,
    scalesCountdown: false,
    scalesHighPrice: false,
    scalesLowPrice: false,
    scalesPriceScaleType: 'normal',
    scalesPriceScaleReverse: false,
    scalesSymbolType: 'name_value_line',
    scalesSymbolValueType: 'scale',
    scalesSymbolColor: 'rgba(0, 230, 118, 0.8)',
    scalesPrevClose: 'value',
    scalesPrevCloseColor: '#787b86',
    scalesIndicators: 'hidden',
    scalesHighLow: 'hidden',
    scalesHighLowColor: 'rgba(255, 61, 0, 0.8)',
    scalesBidAsk: 'hidden',
    scalesBidColor: '#2979ff',
    scalesAskColor: '#f23645',
    scalesDayOfWeek: true,
    scalesDateFormat: "Mon 29 Sep '97",
    scalesTimeFormat: '24h',
    scalesSaveLeftEdge: false,
    scalesTimezone: 'Asia/Kolkata',

    statusLogo: true,
    statusTitle: true,
    statusTitleType: 'symbol_name' as 'name' | 'symbol' | 'symbol_name',
    statusMarketStatus: true,
    statusValues: true,
    statusBarChange: true,
    statusVolume: true,
    statusLastDayChange: true,
    statusIndicatorTitles: true,
    statusIndicatorInputs: false,
    statusIndicatorValues: true,
    statusIndicatorBg: true,
    statusIndicatorBgColor: 'rgba(30, 34, 45, 0.6)'
  });


  const [masterSettingsPos, setMasterSettingsPos] = useState<{ x: number; y: number } | null>(null);
  const [isMasterDragging, setIsMasterDragging] = useState<boolean>(false);
  const masterDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const watermarkBtnRef = useRef<HTMLDivElement>(null);

  const handleMasterHeaderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const posX = masterSettingsPos?.x ?? Math.max(10, Math.round(window.innerWidth / 2 - 330));
    const posY = masterSettingsPos?.y ?? Math.max(10, Math.round(window.innerHeight / 2 - 235));
    masterDragOffsetRef.current = {
      x: e.clientX - posX,
      y: e.clientY - posY
    };
    setIsMasterDragging(true);
  };

  useEffect(() => {
    if (!isMasterDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const nextX = e.clientX - masterDragOffsetRef.current.x;
      const nextY = e.clientY - masterDragOffsetRef.current.y;

      const boundedX = Math.max(10, Math.min(window.innerWidth - 100, nextX));
      const boundedY = Math.max(10, Math.min(window.innerHeight - 100, nextY));

      setMasterSettingsPos({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsMasterDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMasterDragging]);
  const [activeTab, setActiveTab] = useState<'symbol' | 'statusLine' | 'scalesAndLines' | 'canvas' | 'shortcuts' | 'logs'>('symbol');
  const [logCopied, setLogCopied] = useState<boolean>(false);
  const [watermarkDropdownOpen, setWatermarkDropdownOpen] = useState<boolean>(false);
  const [watermarkOpenUpward, setWatermarkOpenUpward] = useState<boolean>(false);

  useEffect(() => {
    if (watermarkDropdownOpen && watermarkBtnRef.current) {
      const rect = watermarkBtnRef.current.getBoundingClientRect();
      const estHeight = 160;
      const modalElement = watermarkBtnRef.current.closest('.settings-modal-box');
      if (modalElement) {
        const modalRect = modalElement.getBoundingClientRect();
        const spaceBelow = modalRect.bottom - rect.bottom;
        if (spaceBelow < estHeight && (rect.top - modalRect.top) > estHeight) {
          setWatermarkOpenUpward(true);
          return;
        }
      }
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < estHeight && rect.top > estHeight) {
        setWatermarkOpenUpward(true);
      } else {
        setWatermarkOpenUpward(false);
      }
    }
  }, [watermarkDropdownOpen]);


  const stylesRef = useRef({
    candleUpColor,
    candleDownColor,
    candleUpBorderColor,
    candleDownBorderColor,
    candleUpWickColor,
    candleDownWickColor,
    areaLineColor,
    areaFillColor,
    gridShow,
    gridHorizontalShow,
    gridVerticalShow,
    gridVerticalColor,
    gridVerticalOpacity,
    gridVerticalStyle,
    gridHorizontalColor,
    gridHorizontalOpacity,
    gridHorizontalStyle,
    bgType,
    bgColor,
    bgColor2,
    bgOpacity,
    crosshairShow,
    crosshairColor,
    crosshairOpacity,
    crosshairStyle,
    crosshairWidth,
    crosshairHorizontalShow,
    crosshairVerticalShow,
    crosshairLabelBgColor,
    crosshairLabelTextColor,
    watermarkType,
    watermarkColor,
    watermarkOpacity,
    watermarkShowTicker,
    watermarkShowInterval,
    watermarkShowDescription,
    watermarkShowReplay,
    scalesTextColor,
    scalesTextSize,
    scalesLineColor,
    scalesLineOpacity,
    navigationVisibility,
    paneButtonsVisibility,
    marginTop,
    marginBottom,
    marginRight,
    zoomEnabled,
    scrollEnabled,
    zoomSpeed,
    
    // Scales & Lines
    scalesCurrencyUnit,
    scalesModes,
    scalesLockRatio,
    scalesLockRatioValue,
    scalesPlacement,
    scalesNoOverlap,
    scalesPlusButton,
    scalesCountdown,
    scalesHighPrice,
    scalesLowPrice,
    scalesPriceScaleType,
    scalesPriceScaleReverse,
    scalesSymbolType,
    scalesSymbolValueType,
    scalesSymbolColor,
    scalesPrevClose,
    scalesPrevCloseColor,
    scalesIndicators,
    scalesHighLow,
    scalesHighLowColor,
    scalesBidAsk,
    scalesBidColor,
    scalesAskColor,
    scalesDayOfWeek,
    scalesDateFormat,
    scalesTimeFormat,
    scalesSaveLeftEdge,
    scalesTimezone,

    statusLogo,
    statusTitle,
    statusTitleType,
    statusMarketStatus,
    statusValues,
    statusBarChange,
    statusVolume,
    statusLastDayChange,
    statusIndicatorTitles,
    statusIndicatorInputs,
    statusIndicatorValues,
    statusIndicatorBg,
    statusIndicatorBgColor
  });

  stylesRef.current = {
    candleUpColor,
    candleDownColor,
    candleUpBorderColor,
    candleDownBorderColor,
    candleUpWickColor,
    candleDownWickColor,
    areaLineColor,
    areaFillColor,
    gridShow,
    gridHorizontalShow,
    gridVerticalShow,
    gridVerticalColor,
    gridVerticalOpacity,
    gridVerticalStyle,
    gridHorizontalColor,
    gridHorizontalOpacity,
    gridHorizontalStyle,
    bgType,
    bgColor,
    bgColor2,
    bgOpacity,
    crosshairShow,
    crosshairColor,
    crosshairOpacity,
    crosshairStyle,
    crosshairWidth,
    crosshairHorizontalShow,
    crosshairVerticalShow,
    crosshairLabelBgColor,
    crosshairLabelTextColor,
    watermarkType,
    watermarkColor,
    watermarkOpacity,
    watermarkShowTicker,
    watermarkShowInterval,
    watermarkShowDescription,
    watermarkShowReplay,
    scalesTextColor,
    scalesTextSize,
    scalesLineColor,
    scalesLineOpacity,
    navigationVisibility,
    paneButtonsVisibility,
    marginTop,
    marginBottom,
    marginRight,
    zoomEnabled,
    scrollEnabled,
    zoomSpeed,
    
    // Scales & Lines
    scalesCurrencyUnit,
    scalesModes,
    scalesLockRatio,
    scalesLockRatioValue,
    scalesPlacement,
    scalesNoOverlap,
    scalesPlusButton,
    scalesCountdown,
    scalesHighPrice,
    scalesLowPrice,
    scalesPriceScaleType,
    scalesPriceScaleReverse,
    scalesSymbolType,
    scalesSymbolValueType,
    scalesSymbolColor,
    scalesPrevClose,
    scalesPrevCloseColor,
    scalesIndicators,
    scalesHighLow,
    scalesHighLowColor,
    scalesBidAsk,
    scalesBidColor,
    scalesAskColor,
    scalesDayOfWeek,
    scalesDateFormat,
    scalesTimeFormat,
    scalesSaveLeftEdge,
    scalesTimezone,

    statusLogo,
    statusTitle,
    statusTitleType,
    statusMarketStatus,
    statusValues,
    statusBarChange,
    statusVolume,
    statusLastDayChange,
    statusIndicatorTitles,
    statusIndicatorInputs,
    statusIndicatorValues,
    statusIndicatorBg,
    statusIndicatorBgColor
  };


  const handleOpenSettings = () => {
    // Save backup of current styles
    setBackupStyles(stylesRef.current);
    setIsSettingsOpen(true);
  };

  // Listen to open settings event dispatched from the top/bottom custom buttons
  useEffect(() => {
    const handleOpen = () => {
      handleOpenSettings();
    };
    window.addEventListener('open-custom-settings', handleOpen);
    return () => {
      window.removeEventListener('open-custom-settings', handleOpen);
    };
  }, []);

  const handleCancel = () => {
    // Revert changes back to backup
    setCandleUpColor(backupStyles.candleUpColor);
    setCandleDownColor(backupStyles.candleDownColor);
    setCandleUpBorderColor(backupStyles.candleUpBorderColor);
    setCandleDownBorderColor(backupStyles.candleDownBorderColor);
    setCandleUpWickColor(backupStyles.candleUpWickColor);
    setCandleDownWickColor(backupStyles.candleDownWickColor);
    setAreaLineColor(backupStyles.areaLineColor);
    setAreaFillColor(backupStyles.areaFillColor);
    setGridShow(backupStyles.gridShow);
    setGridHorizontalShow(backupStyles.gridHorizontalShow);
    setGridVerticalShow(backupStyles.gridVerticalShow);
    setGridVerticalColor(backupStyles.gridVerticalColor);
    setGridVerticalOpacity(backupStyles.gridVerticalOpacity);
    setGridVerticalStyle(backupStyles.gridVerticalStyle);
    setGridHorizontalColor(backupStyles.gridHorizontalColor);
    setGridHorizontalOpacity(backupStyles.gridHorizontalOpacity);
    setGridHorizontalStyle(backupStyles.gridHorizontalStyle);
    setBgType(backupStyles.bgType);
    setBgColor(backupStyles.bgColor);
    setBgColor2(backupStyles.bgColor2 || '#1e222d');
    setBgOpacity(backupStyles.bgOpacity);
    setCrosshairShow(backupStyles.crosshairShow);
    setCrosshairColor(backupStyles.crosshairColor);
    setCrosshairOpacity(backupStyles.crosshairOpacity);
    setCrosshairStyle(backupStyles.crosshairStyle);
    setCrosshairWidth(backupStyles.crosshairWidth);
    setCrosshairHorizontalShow(backupStyles.crosshairHorizontalShow);
    setCrosshairVerticalShow(backupStyles.crosshairVerticalShow);
    setCrosshairLabelBgColor(backupStyles.crosshairLabelBgColor);
    setCrosshairLabelTextColor(backupStyles.crosshairLabelTextColor);
    setWatermarkType(backupStyles.watermarkType);
    setWatermarkColor(backupStyles.watermarkColor);
    setWatermarkOpacity(backupStyles.watermarkOpacity);
    setWatermarkShowTicker(backupStyles.watermarkShowTicker);
    setWatermarkShowInterval(backupStyles.watermarkShowInterval);
    setWatermarkShowDescription(backupStyles.watermarkShowDescription);
    setWatermarkShowReplay(backupStyles.watermarkShowReplay);
    setScalesTextColor(backupStyles.scalesTextColor);
    setScalesTextSize(backupStyles.scalesTextSize);
    setScalesLineColor(backupStyles.scalesLineColor);
    setScalesLineOpacity(backupStyles.scalesLineOpacity);
    setNavigationVisibility(backupStyles.navigationVisibility);
    setPaneButtonsVisibility(backupStyles.paneButtonsVisibility);
    setMarginTop(backupStyles.marginTop);
    setMarginBottom(backupStyles.marginBottom);
    setMarginRight(backupStyles.marginRight);
    setZoomEnabled(backupStyles.zoomEnabled);
    setScrollEnabled(backupStyles.scrollEnabled);
    setZoomSpeed(backupStyles.zoomSpeed);
    
    // Scales & Lines
    setScalesCurrencyUnit(backupStyles.scalesCurrencyUnit);
    setScalesModes(backupStyles.scalesModes);
    setScalesLockRatio(backupStyles.scalesLockRatio);
    setScalesLockRatioValue(backupStyles.scalesLockRatioValue);
    setScalesPlacement(backupStyles.scalesPlacement);
    setScalesNoOverlap(backupStyles.scalesNoOverlap);
    setScalesPlusButton(backupStyles.scalesPlusButton);
    setScalesCountdown(backupStyles.scalesCountdown);
    setScalesHighPrice(backupStyles.scalesHighPrice);
    setScalesLowPrice(backupStyles.scalesLowPrice);
    setScalesPriceScaleType(backupStyles.scalesPriceScaleType || 'normal');
    setScalesPriceScaleReverse(!!backupStyles.scalesPriceScaleReverse);
    setScalesSymbolType(backupStyles.scalesSymbolType);
    setScalesSymbolValueType(backupStyles.scalesSymbolValueType);
    setScalesSymbolColor(backupStyles.scalesSymbolColor);
    setScalesPrevClose(backupStyles.scalesPrevClose);
    setScalesPrevCloseColor(backupStyles.scalesPrevCloseColor);
    setScalesIndicators(backupStyles.scalesIndicators);
    setScalesHighLow(backupStyles.scalesHighLow);
    setScalesHighLowColor(backupStyles.scalesHighLowColor);
    setScalesBidAsk(backupStyles.scalesBidAsk);
    setScalesBidColor(backupStyles.scalesBidColor);
    setScalesAskColor(backupStyles.scalesAskColor);
    setScalesDayOfWeek(backupStyles.scalesDayOfWeek);
    setScalesDateFormat(backupStyles.scalesDateFormat);
    setScalesTimeFormat(backupStyles.scalesTimeFormat);
    setScalesSaveLeftEdge(backupStyles.scalesSaveLeftEdge);
    setScalesTimezone(backupStyles.scalesTimezone || 'Asia/Kolkata');

    // Status Line
    setStatusLogo(backupStyles.statusLogo);
    setStatusTitle(backupStyles.statusTitle);
    setStatusTitleType(backupStyles.statusTitleType);
    setStatusMarketStatus(backupStyles.statusMarketStatus);
    setStatusValues(backupStyles.statusValues);
    setStatusBarChange(backupStyles.statusBarChange);
    setStatusVolume(backupStyles.statusVolume);
    setStatusLastDayChange(backupStyles.statusLastDayChange);
    setStatusIndicatorTitles(backupStyles.statusIndicatorTitles);
    setStatusIndicatorInputs(backupStyles.statusIndicatorInputs);
    setStatusIndicatorValues(backupStyles.statusIndicatorValues);
    setStatusIndicatorBg(backupStyles.statusIndicatorBg);
    setStatusIndicatorBgColor(backupStyles.statusIndicatorBgColor);
    
    setIsSettingsOpen(false);
  };


  const handleOk = () => {
    // Save styles as committed
    setIsSettingsOpen(false);

    // Save styles to localStorage
    try {
      const stylesToSave = {
        candleUpColor,
        candleDownColor,
        candleUpBorderColor,
        candleDownBorderColor,
        candleUpWickColor,
        candleDownWickColor,
        areaLineColor,
        areaFillColor,
        gridShow,
        gridHorizontalShow,
        gridVerticalShow,
        gridVerticalColor,
        gridVerticalOpacity,
        gridVerticalStyle,
        gridHorizontalColor,
        gridHorizontalOpacity,
        gridHorizontalStyle,
        bgType,
        bgColor,
        bgColor2,
        bgOpacity,
        crosshairShow,
        crosshairColor,
        crosshairOpacity,
        crosshairStyle,
        crosshairWidth,
        crosshairHorizontalShow,
        crosshairVerticalShow,
        crosshairLabelBgColor,
        crosshairLabelTextColor,
        watermarkType,
        watermarkColor,
        watermarkOpacity,
        watermarkShowTicker,
        watermarkShowInterval,
        watermarkShowDescription,
        watermarkShowReplay,
        scalesTextColor,
        scalesTextSize,
        scalesLineColor,
        scalesLineOpacity,
        navigationVisibility,
        paneButtonsVisibility,
        marginTop,
        marginBottom,
        marginRight,
        zoomEnabled,
        scrollEnabled,
        zoomSpeed,
        scalesCurrencyUnit,
        scalesModes,
        scalesLockRatio,
        scalesLockRatioValue,
        scalesPlacement,
        scalesNoOverlap,
        scalesPlusButton,
        scalesCountdown,
        scalesHighPrice,
        scalesLowPrice,
        scalesPriceScaleType,
        scalesPriceScaleReverse,
        scalesSymbolType,
        scalesSymbolValueType,
        scalesSymbolColor,
        scalesPrevClose,
        scalesPrevCloseColor,
        scalesIndicators,
        scalesHighLow,
        scalesHighLowColor,
        scalesBidAsk,
        scalesBidColor,
        scalesAskColor,
        scalesDayOfWeek,
        scalesDateFormat,
        scalesTimeFormat,
        scalesSaveLeftEdge,
        scalesTimezone,
        statusLogo,
        statusTitle,
        statusTitleType,
        statusMarketStatus,
        statusValues,
        statusBarChange,
        statusVolume,
        statusLastDayChange,
        statusIndicatorTitles,
        statusIndicatorInputs,
        statusIndicatorValues,
        statusIndicatorBg,
        statusIndicatorBgColor
      };
      localStorage.setItem('__custom_settings_styles__', JSON.stringify(stylesToSave));
    } catch (e) {
      console.warn('Error saving styles to localStorage', e);
    }
  };

  const handleResetDefaults = () => {
    setCandleUpColor('#089981');
    setCandleDownColor('#f23645');
    setCandleUpBorderColor('#089981');
    setCandleDownBorderColor('#f23645');
    setCandleUpWickColor('#089981');
    setCandleDownWickColor('#f23645');
    setBgType('gradient');
    setBgColor('#131722');
    setBgColor2('#1e222d');
    setBgOpacity(1.0);
    setGridVerticalColor('#3c4050');
    setGridHorizontalColor('#3c4050');
    setStatusLogo(true);
    setStatusTitle(true);
    setStatusMarketStatus(true);
    setStatusValues(true);
    setStatusBarChange(true);
    setStatusVolume(true);
    setStatusIndicatorTitles(true);
    setStatusIndicatorInputs(false);
    setStatusIndicatorValues(true);
    setStatusIndicatorBg(true);
    setScalesSymbolType('name_value_line');
    setScalesIndicators('hidden');
    setScalesHighLow('hidden');
    setScalesBidAsk('hidden');
  };


  // Hook onApply into handleOk
  const origHandleOk = handleOk;
  const wrappedHandleOk = () => {
    origHandleOk();
    if (onApply && stylesRef.current) {
      onApply(stylesRef.current);
    }
    window.dispatchEvent(new CustomEvent('chart-styles-changed', { detail: stylesRef.current }));
  };

  const finalHandleCancel = () => {
    handleCancel();
    if (onClose) onClose();
  };

  if (!isSettingsOpen) return null;

          const masterPos = masterSettingsPos || {
          x: Math.max(10, Math.round(window.innerWidth / 2 - 330)),
          y: Math.max(10, Math.round(window.innerHeight / 2 - 235))
        };

        return createPortal(
          <div 
            onClick={finalHandleCancel}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(6px)',
              zIndex: 100001,
              pointerEvents: 'auto'
            }}
          >
            {/* Modal Container */}
            <div 
              className="settings-modal-box"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: `${masterPos.x}px`,
                top: `${masterPos.y}px`,
                width: '660px',
                height: '470px',
                backgroundColor: isLight ? '#ffffff' : '#161720',
                border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '12px',
                boxShadow: isLight ? '0 24px 60px rgba(0, 0, 0, 0.15)' : '0 24px 60px rgba(0, 0, 0, 0.75)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                fontFamily: 'var(--font-sans)',
                color: isLight ? '#131722' : '#d1d4dc'
              }}
            >
              {/* Header */}
              <div 
                onMouseDown={handleMasterHeaderMouseDown}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: isLight ? '#ffffff' : '#11131a',
                  cursor: 'move',
                  userSelect: 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: isLight ? '#131722' : '#ffffff', letterSpacing: '0.3px' }}>Settings</span>
                </div>
                <button 
                  onClick={finalHandleCancel}
                  title="Close settings"
                  style={{
                    background: isLight ? 'transparent' : 'rgba(255, 255, 255, 0.04)',
                    border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isLight ? '#787b86' : '#868993',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#f23645';
                    e.currentTarget.style.backgroundColor = isLight ? 'rgba(242, 54, 69, 0.1)' : 'rgba(242, 54, 69, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(242, 54, 69, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isLight ? '#787b86' : '#868993';
                    e.currentTarget.style.backgroundColor = isLight ? 'transparent' : 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.borderColor = isLight ? '#e0e3eb' : 'rgba(255, 255, 255, 0.08)';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

            {/* Content Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left Sidebar */}
              <div style={{
                width: '180px',
                backgroundColor: isLight ? '#f0f3fa' : '#101217',
                borderRight: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)',
                padding: '12px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}>
                <button 
                  onClick={() => setActiveTab('symbol')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 20px',
                    background: activeTab === 'symbol' ? (isLight ? '#ffffff' : 'rgba(41, 98, 255, 0.08)') : 'transparent',
                    border: 'none',
                    borderLeft: activeTab === 'symbol' ? '3px solid #2962ff' : '3px solid transparent',
                    color: activeTab === 'symbol' ? '#2962ff' : (isLight ? '#5d606b' : '#868993'),
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: activeTab === 'symbol' ? 600 : 500,
                    transition: 'all 0.15s ease',
                    width: '100%',
                    outline: 'none',
                    paddingLeft: '17px'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'symbol') {
                      e.currentTarget.style.color = isLight ? '#131722' : '#ffffff';
                      e.currentTarget.style.background = isLight ? '#e4e8f0' : 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'symbol') {
                      e.currentTarget.style.color = isLight ? '#5d606b' : '#868993';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 13 20">
                    <g id="Symbol">
                      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M3,0H2v3H0.5C0.224,3,0,3.224,0,3.5v13C0,16.776,0.224,17,0.5,17H2v3h1v-3h1.5C4.776,17,5,16.776,5,16.5v-13C5,3.224,4.776,3,4.5,3H3V0z M1,4v12h3V4H1z M11,3h-1v3H8.5C8.224,6,8,6.224,8,6.5v7C8,13.776,8.224,14,8.5,14H10v3h1v-3h1.5c0.276,0,0.5-0.224,0.5-0.5v-7C13,6.224,12.776,6,12.5,6H11V3z M9,13V7h3v6H9z"/>
                    </g>
                  </svg>
                  Symbol
                </button>

                <button 
                  onClick={() => setActiveTab('statusLine')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 20px',
                    background: activeTab === 'statusLine' ? (isLight ? '#ffffff' : 'rgba(41, 98, 255, 0.08)') : 'transparent',
                    border: 'none',
                    borderLeft: activeTab === 'statusLine' ? '3px solid #2962ff' : '3px solid transparent',
                    color: activeTab === 'statusLine' ? '#2962ff' : (isLight ? '#5d606b' : '#868993'),
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: activeTab === 'statusLine' ? 600 : 500,
                    transition: 'all 0.15s ease',
                    width: '100%',
                    outline: 'none',
                    paddingLeft: '17px'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'statusLine') {
                      e.currentTarget.style.color = isLight ? '#131722' : '#ffffff';
                      e.currentTarget.style.background = isLight ? '#e4e8f0' : 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'statusLine') {
                      e.currentTarget.style.color = isLight ? '#5d606b' : '#868993';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 18 16">
                    <g id="Status_line">
                      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M2,1h14c0.552,0,1,0.448,1,1s-0.448,1-1,1H2C1.448,3,1,2.552,1,2S1.448,1,2,1z M0,2c0-1.1,0.9-2,2-2h14c1.105,0,2,0.895,2,2s-0.895,2-2,2H2C0.895,4,0,3.105,0,2z M13,7H1v1h12V7z M13,11H1v1h12V11z M1,15h12v1H1V15z"/>
                    </g>
                  </svg>
                  Status line
                </button>

                <button 
                  onClick={() => setActiveTab('scalesAndLines')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 20px',
                    background: activeTab === 'scalesAndLines' ? (isLight ? '#ffffff' : 'rgba(41, 98, 255, 0.08)') : 'transparent',
                    border: 'none',
                    borderLeft: activeTab === 'scalesAndLines' ? '3px solid #2962ff' : '3px solid transparent',
                    color: activeTab === 'scalesAndLines' ? '#2962ff' : (isLight ? '#5d606b' : '#868993'),
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: activeTab === 'scalesAndLines' ? 600 : 500,
                    transition: 'all 0.15s ease',
                    width: '100%',
                    outline: 'none',
                    paddingLeft: '17px'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'scalesAndLines') {
                      e.currentTarget.style.color = isLight ? '#131722' : '#ffffff';
                      e.currentTarget.style.background = isLight ? '#e4e8f0' : 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'scalesAndLines') {
                      e.currentTarget.style.color = isLight ? '#5d606b' : '#868993';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20.557 20.548">
                    <g id="Scale_and_lines">
                      <path fill="currentColor" d="M16.707,20.548L16,19.841l2.646-2.646H6.303c-0.232,1.14-1.242,2-2.45,2c-1.378,0-2.5-1.121-2.5-2.5c0-1.207,0.86-2.218,2-2.45V1.902L0.707,4.548L0,3.841l3.5-3.5L3.854,0l0.354,0.341l3.5,3.5L7,4.548L4.354,1.902v12.343c0.978,0.2,1.75,0.972,1.95,1.95h12.343L16,13.548l0.707-0.707l3.5,3.5l0.35,0.354l-0.35,0.354L16.707,20.548z M3.854,15.195c-0.827,0-1.5,0.673-1.5,1.5c0,0.827,0.673,1.5,1.5,1.5s1.5-0.673,1.5-1.5l0,0C5.354,15.868,4.681,15.195,3.854,15.195z"/>
                    </g>
                  </svg>
                  Scales and lines
                </button>

                <button 
                  onClick={() => setActiveTab('canvas')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 20px',
                    background: activeTab === 'canvas' ? (isLight ? '#ffffff' : 'rgba(41, 98, 255, 0.08)') : 'transparent',
                    border: 'none',
                    borderLeft: activeTab === 'canvas' ? '3px solid #2962ff' : '3px solid transparent',
                    color: activeTab === 'canvas' ? '#2962ff' : (isLight ? '#5d606b' : '#868993'),
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: activeTab === 'canvas' ? 600 : 500,
                    transition: 'all 0.15s ease',
                    width: '100%',
                    outline: 'none',
                    paddingLeft: '17px'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'canvas') {
                      e.currentTarget.style.color = isLight ? '#131722' : '#ffffff';
                      e.currentTarget.style.background = isLight ? '#e4e8f0' : 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'canvas') {
                      e.currentTarget.style.color = isLight ? '#5d606b' : '#868993';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 16.714 16.704" fill="none" stroke="currentColor" strokeWidth={0.75}>
                    <path id="Canvas" d="M1.375,11.329L0.41,12.294c-0.023,0.023-0.035,0.053-0.035,0.085v3.95h3.95c0.032,0,0.063-0.013,0.085-0.035l0.965-0.965 M1.375,11.329l9-9 M1.375,11.329l4,4 M5.375,15.329l9-9 M10.375,2.329l1.922-1.922c0.043-0.043,0.113-0.043,0.156,0l3.854,3.854c0.043,0.043,0.043,0.113,0,0.156l-1.922,1.922 M10.385,2.339l2,2l2,2"/>
                  </svg>
                  Canvas
                </button>

                <button 
                  onClick={() => setActiveTab('shortcuts')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 20px',
                    background: activeTab === 'shortcuts' ? (isLight ? '#ffffff' : 'rgba(41, 98, 255, 0.08)') : 'transparent',
                    border: 'none',
                    borderLeft: activeTab === 'shortcuts' ? '3px solid #2962ff' : '3px solid transparent',
                    color: activeTab === 'shortcuts' ? '#2962ff' : (isLight ? '#5d606b' : '#868993'),
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: activeTab === 'shortcuts' ? 600 : 500,
                    transition: 'all 0.15s ease',
                    width: '100%',
                    outline: 'none',
                    paddingLeft: '17px'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'shortcuts') {
                      e.currentTarget.style.color = isLight ? '#131722' : '#ffffff';
                      e.currentTarget.style.background = isLight ? '#e4e8f0' : 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'shortcuts') {
                      e.currentTarget.style.color = isLight ? '#5d606b' : '#868993';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                    <line x1="6" y1="8" x2="6" y2="8.01"></line>
                    <line x1="10" y1="8" x2="10" y2="8.01"></line>
                    <line x1="14" y1="8" x2="14" y2="8.01"></line>
                    <line x1="18" y1="8" x2="18" y2="8.01"></line>
                    <line x1="6" y1="12" x2="6" y2="12.01"></line>
                    <line x1="10" y1="12" x2="10" y2="12.01"></line>
                    <line x1="14" y1="12" x2="14" y2="12.01"></line>
                    <line x1="18" y1="12" x2="18" y2="12.01"></line>
                    <line x1="8" y1="16" x2="16" y2="16"></line>
                  </svg>
                  Shortcuts
                </button>

                <button 
                  onClick={() => setActiveTab('logs')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 20px',
                    background: activeTab === 'logs' ? (isLight ? '#ffffff' : 'rgba(41, 98, 255, 0.08)') : 'transparent',
                    border: 'none',
                    borderLeft: activeTab === 'logs' ? '3px solid #2962ff' : '3px solid transparent',
                    color: activeTab === 'logs' ? '#2962ff' : (isLight ? '#5d606b' : '#868993'),
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: activeTab === 'logs' ? 600 : 500,
                    transition: 'all 0.15s ease',
                    width: '100%',
                    outline: 'none',
                    paddingLeft: '17px'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'logs') {
                      e.currentTarget.style.color = isLight ? '#131722' : '#ffffff';
                      e.currentTarget.style.background = isLight ? '#e4e8f0' : 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'logs') {
                      e.currentTarget.style.color = isLight ? '#5d606b' : '#868993';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                  </svg>
                  Logs
                </button>

                <div style={{ height: '1px', backgroundColor: isLight ? '#e0e3eb' : 'rgba(255,255,255,0.06)', margin: '8px 16px' }} />

                <button 
                  onClick={() => {
                    setIsSettingsOpen(false);
                    window.dispatchEvent(new CustomEvent('open-market-connection-modal'));
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 20px',
                    background: 'transparent',
                    border: 'none',
                    borderLeft: '3px solid transparent',
                    color: isLight ? '#2962ff' : '#00b0ff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                    width: '100%',
                    outline: 'none',
                    paddingLeft: '17px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isLight ? '#e4e8f0' : 'rgba(41, 98, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                  </svg>
                  Market Feeds & Webhooks
                </button>
              </div>

              {/* Right Panel Contents */}
              <div style={{ flex: 1, padding: '24px 30px', overflowY: activeTab === 'logs' ? 'hidden' : 'auto', display: activeTab === 'logs' ? 'flex' : 'block', flexDirection: 'column', backgroundColor: isLight ? '#ffffff' : 'transparent' }}>
                {activeTab === 'symbol' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {chartType === 'area' ? 'Area' : chartType === 'ohlc' ? 'OHLC Bars' : chartType === 'line' ? 'Line' : chartType === 'heikin_ashi' ? 'Heikin Ashi' : ['candle_stroke', 'candle_up_stroke', 'candle_down_stroke'].includes(chartType) ? 'Hollow Candles' : 'Candles'}
                    </div>
                    
                    {/* Dynamic color pickers based on chart type */}
                    {(() => {
                      if (['candle_stroke', 'candle_up_stroke', 'candle_down_stroke'].includes(chartType)) {
                        // Hollow Candles: selecting color in one box changes the other box to none/transparent.
                        // If both boxes are none/transparent, then neither has body (pure hollow).
                        const isColorTransparent = (c: string) => {
                          if (!c || c === 'transparent') return true;
                          if (c.startsWith('rgba')) {
                            const parts = c.match(/[\d.]+/g);
                            if (parts && parts.length >= 4 && parseFloat(parts[3]) === 0) return true;
                          }
                          return false;
                        };

                        const upBodyColor = chartType === 'candle_down_stroke' ? candleUpColor : 'transparent';
                        const downBodyColor = chartType === 'candle_up_stroke' ? candleDownColor : 'transparent';

                        const handleUpBodyColorChange = (newColor: string) => {
                          if (isColorTransparent(newColor)) {
                            // Turn off body -> both don't have body
                            setChartType('candle_stroke');
                            localStorage.setItem('chart_type', 'candle_stroke');
                            localStorage.setItem('hollow_candle_type', 'candle_stroke');
                            window.dispatchEvent(new CustomEvent('chart-type-changed', { detail: 'candle_stroke' }));
                          } else {
                            // Up candle has body, Down candle changes to none
                            setCandleUpColor(newColor);
                            setChartType('candle_down_stroke');
                            localStorage.setItem('chart_type', 'candle_down_stroke');
                            localStorage.setItem('hollow_candle_type', 'candle_down_stroke');
                            window.dispatchEvent(new CustomEvent('chart-type-changed', { detail: 'candle_down_stroke' }));
                          }
                        };

                        const handleDownBodyColorChange = (newColor: string) => {
                          if (isColorTransparent(newColor)) {
                            // Turn off body -> both don't have body
                            setChartType('candle_stroke');
                            localStorage.setItem('chart_type', 'candle_stroke');
                            localStorage.setItem('hollow_candle_type', 'candle_stroke');
                            window.dispatchEvent(new CustomEvent('chart-type-changed', { detail: 'candle_stroke' }));
                          } else {
                            // Down candle has body, Up candle changes to none
                            setCandleDownColor(newColor);
                            setChartType('candle_up_stroke');
                            localStorage.setItem('chart_type', 'candle_up_stroke');
                            localStorage.setItem('hollow_candle_type', 'candle_up_stroke');
                            window.dispatchEvent(new CustomEvent('chart-type-changed', { detail: 'candle_up_stroke' }));
                          }
                        };

                        return (
                          <>
                            {/* Body row: standard label with two color boxes */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <CustomCheckbox checked={true} onChange={() => {}} label="Body" />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <ColorPicker color={upBodyColor} onChange={handleUpBodyColorChange} />
                                <ColorPicker color={downBodyColor} onChange={handleDownBodyColorChange} />
                              </div>
                            </div>

                            {/* Borders row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <CustomCheckbox checked={true} onChange={() => {}} label="Borders" />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <ColorPicker color={candleUpBorderColor} onChange={setCandleUpBorderColor} />
                                <ColorPicker color={candleDownBorderColor} onChange={setCandleDownBorderColor} />
                              </div>
                            </div>

                            {/* Wick row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <CustomCheckbox checked={true} onChange={() => {}} label="Wick" />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <ColorPicker color={candleUpWickColor} onChange={setCandleUpWickColor} />
                                <ColorPicker color={candleDownWickColor} onChange={setCandleDownWickColor} />
                              </div>
                            </div>
                          </>
                        );
                      }

                      // Define which color rows are relevant for other chart types
                      const colorRows: { label: string; upColor: string; downColor?: string; onUpChange: (c: string) => void; onDownChange?: (c: string) => void }[] = [];

                      if (chartType === 'area') {
                        // Area: Line color + Fill/gradient color
                        colorRows.push({ label: 'Line', upColor: areaLineColor, onUpChange: setAreaLineColor });
                        colorRows.push({ label: 'Fill', upColor: areaFillColor, onUpChange: setAreaFillColor });
                      } else if (chartType === 'line') {
                        // Line: single line color
                        colorRows.push({ label: 'Line', upColor: areaLineColor, onUpChange: setAreaLineColor });
                      } else if (chartType === 'baseline') {
                        // Baseline: Top and Bottom baseline fill/line colors
                        colorRows.push({ label: 'Top Baseline', upColor: candleUpColor, onUpChange: setCandleUpColor });
                        colorRows.push({ label: 'Bottom Baseline', upColor: candleDownColor, onUpChange: setCandleDownColor });
                      } else if (chartType === 'ohlc') {
                        // OHLC: just bar up/down colors
                        colorRows.push({ label: 'Bars', upColor: candleUpColor, downColor: candleDownColor, onUpChange: setCandleUpColor, onDownChange: setCandleDownColor });
                      } else if (['volume_profile', 'market_profile', 'footprint'].includes(chartType)) {
                        // Profile overlays: profile fill colors
                        colorRows.push({ label: 'Profile Bull', upColor: candleUpColor, onUpChange: setCandleUpColor });
                        colorRows.push({ label: 'Profile Bear', upColor: candleDownColor, onUpChange: setCandleDownColor });
                      } else {
                        // candle_solid, heikin_ashi, renko, kagi, point_figure, line_break, range_bars, volume_candles
                        colorRows.push({ label: 'Body', upColor: candleUpColor, downColor: candleDownColor, onUpChange: setCandleUpColor, onDownChange: setCandleDownColor });
                        colorRows.push({ label: 'Borders', upColor: candleUpBorderColor, downColor: candleDownBorderColor, onUpChange: setCandleUpBorderColor, onDownChange: setCandleDownBorderColor });
                        colorRows.push({ label: 'Wick', upColor: candleUpWickColor, downColor: candleDownWickColor, onUpChange: setCandleUpWickColor, onDownChange: setCandleDownWickColor });
                      }

                      return colorRows.map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <CustomCheckbox checked={true} onChange={() => {}} label={row.label} />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <ColorPicker color={row.upColor} onChange={row.onUpChange} />
                            {row.downColor && row.onDownChange && (
                              <ColorPicker color={row.downColor} onChange={row.onDownChange} />
                            )}
                          </div>
                        </div>
                      ));
                    })()}

                    {/* Data Modification Placeholder */}
                    <div style={{ marginTop: '16px', borderTop: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39', paddingTop: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Data Modification</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Timezone</span>
                          <CustomSelect 
                            value={scalesTimezone}
                            options={[
                              { value: 'Etc/UTC', label: '(UTC) UTC' },
                              { value: 'Pacific/Honolulu', label: '(UTC-10:00) Honolulu' },
                              { value: 'America/Juneau', label: '(UTC-09:00) Juneau' },
                              { value: 'America/Los_Angeles', label: '(UTC-08:00) Los Angeles' },
                              { value: 'America/Chicago', label: '(UTC-06:00) Chicago' },
                              { value: 'America/Toronto', label: '(UTC-05:00) Toronto' },
                              { value: 'America/Sao_Paulo', label: '(UTC-03:00) Sao Paulo' },
                              { value: 'Europe/London', label: '(UTC+00:00) London' },
                              { value: 'Europe/Berlin', label: '(UTC+01:00) Berlin' },
                              { value: 'Asia/Bahrain', label: '(UTC+03:00) Bahrain' },
                              { value: 'Asia/Dubai', label: '(UTC+04:00) Dubai' },
                              { value: 'Asia/Kolkata', label: '(UTC+05:30) Kolkata' },
                              { value: 'Asia/Ashkhabad', label: '(UTC+05:00) Ashkhabad' },
                              { value: 'Asia/Almaty', label: '(UTC+06:00) Almaty' },
                              { value: 'Asia/Bangkok', label: '(UTC+07:00) Bangkok' },
                              { value: 'Asia/Shanghai', label: '(UTC+08:00) Shanghai' },
                              { value: 'Asia/Tokyo', label: '(UTC+09:00) Tokyo' },
                              { value: 'Australia/Sydney', label: '(UTC+10:00) Sydney' },
                              { value: 'Pacific/Norfolk', label: '(UTC+11:00) Norfolk' }
                            ]}
                            onChange={(val) => setScalesTimezone(val)}
                            width="160px"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'statusLine' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>Instrument</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <CustomCheckbox checked={statusLogo} onChange={setStatusLogo} label="Logo" />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <CustomCheckbox checked={statusTitle} onChange={setStatusTitle} label="Title" />
                          <CustomSelect 
                            value={statusTitleType} 
                            options={[
                              { value: 'name', label: 'Name' },
                              { value: 'symbol', label: 'Symbol' },
                              { value: 'symbol_name', label: 'Symbol and name' }
                            ]}
                            onChange={(val) => setStatusTitleType(val as any)}
                            width="160px"
                          />
                        </div>

                        <div>
                          <CustomCheckbox checked={statusMarketStatus} onChange={setStatusMarketStatus} label="Open market status" />
                        </div>

                        <div>
                          <CustomCheckbox checked={statusValues} onChange={setStatusValues} label="Chart values" />
                        </div>

                        <div>
                          <CustomCheckbox checked={statusBarChange} onChange={setStatusBarChange} label="Bar change values" />
                        </div>

                        <div>
                          <CustomCheckbox checked={statusVolume} onChange={setStatusVolume} label="Volume" />
                        </div>

                        <div>
                          <CustomCheckbox checked={statusLastDayChange} onChange={setStatusLastDayChange} label="Last day change values" />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <CustomCheckbox checked={statusIndicatorBg} onChange={setStatusIndicatorBg} label="Background" />
                          <ColorPicker color={statusIndicatorBgColor} onChange={setStatusIndicatorBgColor} />
                        </div>
                      </div>
                    </div>

                  </div>
                )}

                {activeTab === 'scalesAndLines' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Price Scale */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>Price Scale</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Currency</span>
                          <CustomSelect 
                            value={scalesCurrencyUnit} 
                            options={[
                              { value: 'always', label: 'Always visible' },
                              { value: 'hidden', label: 'Hidden' }
                            ]}
                            onChange={(val) => setScalesCurrencyUnit(val)}
                            width="180px"
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Scales placement</span>
                          <CustomSelect 
                            value={scalesPlacement} 
                            options={[
                              { value: 'left', label: 'Left' },
                              { value: 'right', label: 'Right' }
                            ]}
                            onChange={(val) => setScalesPlacement(val)}
                            width="180px"
                          />
                        </div>

                        {/* Reverse scale (Moved from Canvas Scales) */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Reverse scale</span>
                          <CustomCheckbox checked={scalesPriceScaleReverse} onChange={setScalesPriceScaleReverse} label="" />
                        </div>
                      </div>
                    </div>

                    {/* Price Labels & Lines */}
                    <div style={{ borderTop: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39', paddingTop: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>Price Labels & Lines</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Text */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Text</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ColorStylePicker 
                              color={scalesTextColor}
                              opacity={1.0}
                              hideStyleSelector={true}
                              onChange={(newColor) => setScalesTextColor(newColor)}
                            />
                            <CustomSelect 
                              value={scalesTextSize}
                              options={[
                                { value: 10, label: '10' },
                                { value: 11, label: '11' },
                                { value: 12, label: '12' },
                                { value: 14, label: '14' },
                                { value: 16, label: '16' },
                                { value: 20, label: '20' }
                              ]}
                              onChange={(val) => setScalesTextSize(Number(val))}
                              width="80px"
                            />
                          </div>
                        </div>

                        {/* Axis Line Color (Moved from Axis Boundaries) */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Axis Line Color</span>
                          <ColorPicker color={scalesLineColor} onChange={setScalesLineColor} />
                        </div>

                        {/* High Price Label */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>High price label</span>
                          <CustomCheckbox checked={scalesHighPrice} onChange={setScalesHighPrice} label="" />
                        </div>

                        {/* Low Price Label */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Low price label</span>
                          <CustomCheckbox checked={scalesLowPrice} onChange={setScalesLowPrice} label="" />
                        </div>

                        {/* Price scale type */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Price scale type</span>
                          <CustomSelect 
                            value={scalesPriceScaleType}
                            options={[
                              { value: 'normal', label: 'Normal' },
                              { value: 'log', label: 'Logarithmic' }
                            ]}
                            onChange={(val) => setScalesPriceScaleType(val)}
                            width="180px"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Time Scale */}
                    <div style={{ borderTop: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39', paddingTop: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>Time Scale</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <CustomCheckbox checked={scalesDayOfWeek} onChange={setScalesDayOfWeek} label="Day of week on labels" />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Date format</span>
                          <CustomSelect 
                            value={scalesDateFormat} 
                            options={[
                              "Mon Q3 '97",
                              "Mon Q3 1997",
                              "Mon 29 Sep '97",
                              "Mon Sep '97",
                              "Mon Sep 29, 1997",
                              "Mon Sep 1997",
                              "Mon Sep 29",
                              "Mon 29 Sep",
                              "Mon 1997-09-29",
                              "Mon 97-09-29",
                              "Mon 97/09/29",
                              "Mon 1997/09/29",
                              "Mon 29-09-1997",
                              "Mon 29-09-97",
                              "Mon 29/09/97",
                              "Mon 29/09/1997",
                              "Mon 09/29/97",
                              "Mon 09/29/1997",
                              "Mon 09-29-1997",
                              "Mon 09-29-97",
                              "Mon 29.09.1997",
                              "Mon 29.09.97",
                              "Mon 1997.09.29",
                              "Mon 97.09.29",
                              "Mon 09.29.1997",
                              "Mon 09.29.97",
                              "Mon 29 Sep 1997",
                              "Mon Sep 29 '97",
                              "Mon Sep/29/97",
                              "Mon Sep/29/1997",
                              "Mon 29/Sep/97",
                              "Mon 29/Sep/1997"
                            ].map(opt => ({
                              value: opt,
                              label: scalesDayOfWeek ? opt : opt.replace('Mon ', '').replace('Mon', '')
                            }))}
                            onChange={(val) => setScalesDateFormat(val)}
                            width="180px"
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Time hours format</span>
                          <CustomSelect 
                            value={scalesTimeFormat} 
                            options={[
                              { value: '24h', label: '24-hours' },
                              { value: '12h', label: '12-hours' }
                            ]}
                            onChange={(val) => setScalesTimeFormat(val)}
                            width="180px"
                          />
                        </div>

                        <div>
                          <CustomCheckbox checked={scalesSaveLeftEdge} onChange={setScalesSaveLeftEdge} label="Save chart left edge position when changing interval" />
                        </div>
                      </div>
                    </div>


                  </div>
                )}

                {activeTab === 'canvas' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* CHART BASIC STYLES */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>CHART BASIC STYLES</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: '14px', alignItems: 'center' }}>
                        {/* Background */}
                        <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Background</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CustomSelect 
                            value={bgType}
                            options={[
                              { value: 'solid', label: 'Solid' },
                              { value: 'gradient', label: 'Gradient' }
                            ]}
                            onChange={(val) => setBgType(val)}
                            width="120px"
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ColorStylePicker 
                              color={bgColor}
                              opacity={bgOpacity}
                              hideStyleSelector={true}
                              onChange={(newColor, newOpacity) => {
                                setBgColor(newColor);
                                setBgOpacity(newOpacity);
                              }}
                            />
                            {bgType === 'gradient' && (
                              <>
                                <ColorStylePicker 
                                  color={bgColor2}
                                  opacity={bgOpacity}
                                  hideStyleSelector={true}
                                  onChange={(newColor) => {
                                    setBgColor2(newColor);
                                  }}
                                />
                              </>
                            )}
                          </div>
                        </div>

                        {/* Show Grid */}
                        <CustomCheckbox 
                          checked={gridShow}
                          onChange={setGridShow}
                          label="Show grid"
                        />
                        <div />

                        {/* Vertical grid lines */}
                        <CustomCheckbox 
                          checked={gridVerticalShow}
                          onChange={setGridVerticalShow}
                          label="Vertical grid lines"
                        />
                        <div>
                          <ColorStylePicker 
                            color={gridVerticalColor}
                            opacity={gridVerticalOpacity}
                            style={gridVerticalStyle}
                            onChange={(newColor, newOpacity, newStyle) => {
                              setGridVerticalColor(newColor);
                              setGridVerticalOpacity(newOpacity);
                              setGridVerticalStyle(newStyle);
                            }}
                          />
                        </div>

                        {/* Horizontal grid lines */}
                        <CustomCheckbox 
                          checked={gridHorizontalShow}
                          onChange={setGridHorizontalShow}
                          label="Horizontal grid lines"
                        />
                        <div>
                          <ColorStylePicker 
                            color={gridHorizontalColor}
                            opacity={gridHorizontalOpacity}
                            style={gridHorizontalStyle}
                            onChange={(newColor, newOpacity, newStyle) => {
                              setGridHorizontalColor(newColor);
                              setGridHorizontalOpacity(newOpacity);
                              setGridHorizontalStyle(newStyle);
                            }}
                          />
                        </div>

                        {/* Crosshair */}
                        <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Crosshair</span>
                        <div>
                          <ColorStylePicker 
                            color={crosshairColor}
                            opacity={crosshairOpacity}
                            style={crosshairStyle}
                            onChange={(newColor, newOpacity, newStyle) => {
                              setCrosshairColor(newColor);
                              setCrosshairOpacity(newOpacity);
                              setCrosshairStyle(newStyle);
                            }}
                          />
                        </div>

                        {/* Watermark */}
                        <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Watermark</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <div 
                              ref={watermarkBtnRef}
                              onClick={() => setWatermarkDropdownOpen(!watermarkDropdownOpen)}
                              style={{
                                backgroundColor: isLight ? '#ffffff' : '#1c2030', 
                                color: isLight ? '#131722' : '#d1d4dc', 
                                border: watermarkDropdownOpen ? '1px solid #2962ff' : (isLight ? '1px solid #d1d4dc' : '1px solid #434651'), 
                                borderRadius: '4px', 
                                padding: '5px 10px', 
                                width: '180px', 
                                outline: 'none', 
                                cursor: 'pointer', 
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                userSelect: 'none',
                                boxSizing: 'border-box',
                                height: '28px'
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                {(() => {
                                  const items = [];
                                  if (watermarkShowTicker) items.push('Ticker');
                                  if (watermarkShowInterval) items.push('Interval');
                                  if (watermarkShowDescription) items.push('Description');
                                  if (watermarkShowReplay) items.push('Replay mode');
                                  
                                  if (items.length === 0) return 'Hidden';
                                  if (items.length > 2) {
                                    return `${items.slice(0, 2).join(', ')}, ...`;
                                  }
                                  return items.join(', ');
                                })()}
                              </span>
                              <svg 
                                width="9" 
                                height="5" 
                                viewBox="0 0 8.66 4.54" 
                                style={{
                                  transition: 'transform 0.15s',
                                  transform: watermarkDropdownOpen ? 'rotate(180deg)' : 'none'
                                }}
                              >
                                <path fillRule="evenodd" clipRule="evenodd" fill={isLight ? '#787b86' : '#868993'} d="M0,0.752L0.66,0l3.67,3.212L8,0l0.66,0.752L4.33,4.54L0,0.752z"/>
                              </svg>
                            </div>

                            {watermarkDropdownOpen && (
                              <>
                                <div 
                                  onClick={() => setWatermarkDropdownOpen(false)}
                                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100002 }}
                                />
                                <div 
                                  style={{
                                    position: 'absolute',
                                    ...(watermarkOpenUpward ? { bottom: '32px' } : { top: '32px' }),
                                    left: 0,
                                    backgroundColor: isLight ? '#ffffff' : '#1c2030',
                                    border: isLight ? '1px solid #e0e3eb' : '1px solid #434651',
                                    borderRadius: '4px',
                                    padding: '8px 0',
                                    width: '180px',
                                    boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 16px rgba(0,0,0,0.5)',
                                    zIndex: 100003,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    boxSizing: 'border-box'
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {[
                                    { label: 'Ticker', value: watermarkShowTicker, setter: setWatermarkShowTicker },
                                    { label: 'Interval', value: watermarkShowInterval, setter: setWatermarkShowInterval },
                                    { label: 'Description', value: watermarkShowDescription, setter: setWatermarkShowDescription },
                                    { label: 'Replay mode', value: watermarkShowReplay, setter: setWatermarkShowReplay }
                                  ].map((item) => (
                                    <div 
                                      key={item.label}
                                      style={{
                                        padding: '6px 14px',
                                        transition: 'background-color 0.15s',
                                        cursor: 'pointer'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isLight ? '#f0f3fa' : 'rgba(255,255,255,0.05)'}
                                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                      <CustomCheckbox 
                                        checked={item.value}
                                        onChange={(checked) => {
                                          item.setter(checked);
                                          const nextTicker = item.label === 'Ticker' ? checked : watermarkShowTicker;
                                          const nextInterval = item.label === 'Interval' ? checked : watermarkShowInterval;
                                          const nextDesc = item.label === 'Description' ? checked : watermarkShowDescription;
                                          const nextReplay = item.label === 'Replay mode' ? checked : watermarkShowReplay;
                                          
                                          if (nextTicker || nextInterval || nextDesc || nextReplay) {
                                            setWatermarkType('all');
                                          } else {
                                            setWatermarkType('none');
                                          }
                                        }}
                                        label={item.label}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          <ColorStylePicker 
                            color={watermarkColor}
                            opacity={watermarkOpacity}
                            hideStyleSelector={true}
                            onChange={(newColor, newOpacity) => {
                              setWatermarkColor(newColor);
                              setWatermarkOpacity(newOpacity);
                            }}
                          />
                        </div>
                      </div>
                    </div>



                    {/* BUTTONS */}
                    <div style={{ borderTop: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39', paddingTop: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>Buttons</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: '12px', alignItems: 'center' }}>
                        {/* Navigation */}
                        <span style={{ fontSize: '13px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Navigation</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CustomSelect 
                            value={navigationVisibility}
                            options={[
                              { value: 'always', label: 'Always visible' },
                              { value: 'hover', label: 'Visible on mouse over' },
                              { value: 'hidden', label: 'Always invisible' }
                            ]}
                            onChange={(val) => setNavigationVisibility(val)}
                            width="180px"
                          />
                        </div>


                      </div>
                    </div>

                    {/* MARGINS */}
                    <div style={{ borderTop: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39', paddingTop: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>MARGINS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: '16px', alignItems: 'center' }}>
                        {/* Top */}
                        <span style={{ fontSize: '14px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Top</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CustomNumberInput 
                            value={marginTop}
                            min={0}
                            max={25}
                            onChange={setMarginTop}
                            suffix="%"
                          />
                        </div>

                        {/* Bottom */}
                        <span style={{ fontSize: '14px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Bottom</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CustomNumberInput 
                            value={marginBottom}
                            min={0}
                            max={25}
                            onChange={setMarginBottom}
                            suffix="%"
                          />
                        </div>

                        {/* Right Bars */}
                        <span style={{ fontSize: '14px', color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500 }}>Right Bars</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CustomNumberInput 
                            value={marginRight}
                            min={0}
                            max={200}
                            onChange={setMarginRight}
                            suffix="bars"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'shortcuts' && (
                  <ShortcutsSettingsTab />
                )}

                {activeTab === 'logs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#787b86' : '#868993', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Diagnostic Logs
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {logCopied && (
                          <span style={{ fontSize: '12px', color: '#089981', marginRight: '4px', animation: 'fadeIn 0.2s' }}>
                            Copied!
                          </span>
                        )}
                        <button
                          onClick={() => {
                            const logsText = ((window as any).__chart_log_buffer__ || []).join('\n');
                            navigator.clipboard.writeText(logsText)
                              .then(() => {
                                setLogCopied(true);
                                setTimeout(() => setLogCopied(false), 2000);
                              })
                              .catch(err => console.error('Failed to copy logs:', err));
                          }}
                          style={{
                            backgroundColor: '#2962ff',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#ffffff',
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2962ff'}
                        >
                          Copy Logs
                        </button>
                        <button
                          onClick={() => {
                            if (typeof (window as any).__downloadChartLogs__ === 'function') {
                              (window as any).__downloadChartLogs__();
                            }
                          }}
                          style={{
                            backgroundColor: isLight ? '#ffffff' : 'transparent',
                            border: isLight ? '1px solid #d1d4dc' : '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '4px',
                            color: isLight ? '#131722' : '#d1d4dc',
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isLight ? '#f0f3fa' : 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = isLight ? '#131722' : '#ffffff'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isLight ? '#ffffff' : 'transparent'; e.currentTarget.style.color = isLight ? '#131722' : '#d1d4dc'; }}
                        >
                          Download Logs
                        </button>
                      </div>
                    </div>
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '4px' }}>
                      <textarea
                        readOnly
                        value={((window as any).__chart_log_buffer__ || []).join('\n')}
                        style={{
                          width: '100%',
                          height: '100%',
                          backgroundColor: isLight ? '#f8f9fd' : '#101217',
                          color: isLight ? '#131722' : '#a3a6b4',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          padding: '10px',
                          border: 'none',
                          resize: 'none',
                          outline: 'none',
                          boxSizing: 'border-box',
                          whiteSpace: 'pre',
                          overflow: 'auto'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 20px',
              borderTop: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: isLight ? '#f0f3fa' : '#11131a'
            }}>
              {/* Apply Defaults button */}
              <button 
                onClick={handleResetDefaults}
                style={{
                  backgroundColor: isLight ? '#ffffff' : 'transparent',
                  border: isLight ? '1px solid #d1d4dc' : '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: isLight ? '#5d606b' : '#d1d4dc',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.backgroundColor = isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.04)'; 
                  e.currentTarget.style.color = isLight ? '#131722' : '#ffffff'; 
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.backgroundColor = isLight ? '#ffffff' : 'transparent'; 
                  e.currentTarget.style.color = isLight ? '#5d606b' : '#d1d4dc'; 
                }}
              >
                Apply Defaults
              </button>

              {/* Ok / Cancel buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={finalHandleCancel}
                  style={{
                    backgroundColor: isLight ? '#ffffff' : 'transparent',
                    border: isLight ? '1px solid #d1d4dc' : '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: isLight ? '#5d606b' : '#d1d4dc',
                    padding: '8px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.backgroundColor = isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.04)'; 
                    e.currentTarget.style.color = isLight ? '#131722' : '#ffffff'; 
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.backgroundColor = isLight ? '#ffffff' : 'transparent'; 
                    e.currentTarget.style.color = isLight ? '#5d606b' : '#d1d4dc'; 
                  }}
                >
                  Cancel
                </button>
                <button 
                  onClick={wrappedHandleOk}
                  style={{
                    backgroundColor: '#2962ff',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '8px 24px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a56ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2962ff'; }}
                >
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      );
};

export default ChartSettingsModal;
