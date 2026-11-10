import React, { useState, useMemo, useEffect } from 'react';
import catalogData from '../data/emoji_2d_catalog.json';
import { Search, X, Clock, Smile, User, Cat, Utensils, Trophy, Plane, Lightbulb, Hash, Flag } from 'lucide-react';

export interface Emoji2DItem {
  id: string;
  name: string;
  unified: string;
  category: string;
  tags?: string[];
  aliases?: string[];
}

interface EmojiStickerPickerProps {
  onSelect: (emoji: { id: string; name: string; unified: string }) => void;
  onClose?: () => void;
}

const CATEGORIES = [
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'Smileys & Emotion', label: 'Smileys', icon: Smile },
  { id: 'People & Body', label: 'People', icon: User },
  { id: 'Animals & Nature', label: 'Animals', icon: Cat },
  { id: 'Food & Drink', label: 'Food', icon: Utensils },
  { id: 'Activities', label: 'Activity', icon: Trophy },
  { id: 'Travel & Places', label: 'Travel', icon: Plane },
  { id: 'Objects', label: 'Objects', icon: Lightbulb },
  { id: 'Symbols', label: 'Symbols', icon: Hash },
  { id: 'Flags', label: 'Flags', icon: Flag },
];

export const EmojiStickerPicker: React.FC<EmojiStickerPickerProps> = ({ onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<string>('Smileys & Emotion');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredEmoji, setHoveredEmoji] = useState<Emoji2DItem | null>(null);
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [recentUnifieds, setRecentUnifieds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('trading_recent_2d_emojis');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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
  const catalog = catalogData as Emoji2DItem[];

  const filteredList = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return catalog.filter(item => 
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.tags && item.tags.some(t => t.toLowerCase().includes(q))) ||
        (item.aliases && item.aliases.some(a => a.toLowerCase().includes(q)))
      );
    }

    if (activeCategory === 'recent') {
      const recents: Emoji2DItem[] = [];
      for (const u of recentUnifieds) {
        const found = catalog.find(item => item.unified === u);
        if (found) recents.push(found);
      }
      return recents;
    }

    return catalog.filter(item => item.category === activeCategory);
  }, [catalog, activeCategory, searchQuery, recentUnifieds]);

  const handleEmojiClick = (item: Emoji2DItem) => {
    const updated = [item.unified, ...recentUnifieds.filter(u => u !== item.unified)].slice(0, 40);
    setRecentUnifieds(updated);
    try {
      localStorage.setItem('trading_recent_2d_emojis', JSON.stringify(updated));
    } catch {}

    onSelect({
      id: item.id,
      name: item.name,
      unified: item.unified
    });
  };

  return (
    <div
      className="custom-emoji-picker-container"
      style={{
        width: '350px',
        maxWidth: '90vw',
        height: '460px',
        maxHeight: 'calc(100vh - 60px)',
        backgroundColor: isLight ? '#ffffff' : '#1e222d',
        border: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
        borderRadius: '8px',
        boxShadow: isLight ? '0 8px 32px rgba(0, 0, 0, 0.12)' : '0 8px 32px rgba(0, 0, 0, 0.75)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: "'Rubik', sans-serif",
        color: isLight ? '#131722' : '#d1d4dc',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header / Search */}
      <div
        style={{
          padding: '10px 12px 8px 12px',
          borderBottom: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          backgroundColor: isLight ? '#f8f9fd' : '#191d26'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: isLight ? '#131722' : '#f0f3fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>2D Emojis & Stickers</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#787b86',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = isLight ? '#131722' : '#f0f3fa'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#787b86'}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Search size={14} style={{ position: 'absolute', left: '10px', color: '#787b86', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search 2D stickers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '32px',
              backgroundColor: isLight ? '#ffffff' : '#131722',
              border: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
              borderRadius: '4px',
              padding: '0 28px 0 30px',
              color: isLight ? '#131722' : '#d1d4dc',
              fontSize: '12px',
              outline: 'none',
              transition: 'border-color 0.15s'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#2962ff'}
            onBlur={(e) => e.currentTarget.style.borderColor = isLight ? '#e0e3eb' : '#2a2e39'}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: '#787b86',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs Bar */}
      {!searchQuery && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            padding: '4px 8px',
            backgroundColor: isLight ? '#f8f9fd' : '#191d26',
            borderBottom: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}
        >
          {CATEGORIES.map((cat) => {
            const IconComp = cat.icon;
            const isActive = activeCategory === cat.id;
            const isCatHovered = hoveredCat === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                onMouseEnter={() => setHoveredCat(cat.id)}
                onMouseLeave={() => setHoveredCat(null)}
                title={cat.label}
                style={{
                  minWidth: '28px',
                  height: '28px',
                  padding: '0 4px',
                  background: isActive ? 'rgba(41, 98, 255, 0.15)' : (isCatHovered ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.06)') : 'transparent'),
                  border: 'none',
                  borderRadius: '4px',
                  color: isActive ? '#2962ff' : (isCatHovered ? (isLight ? '#131722' : '#ffffff') : '#787b86'),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <IconComp size={15} />
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px',
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: '4px',
          alignContent: 'start',
          backgroundColor: isLight ? '#ffffff' : 'transparent'
        }}
      >
        {filteredList.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '40px 10px',
              color: '#787b86',
              fontSize: '13px'
            }}
          >
            {searchQuery ? 'No 2D stickers found' : 'No recent items'}
          </div>
        ) : (
          filteredList.map((item) => (
            <button
              key={`${item.category}-${item.unified}-${item.id}`}
              onClick={() => handleEmojiClick(item)}
              title={item.name}
              style={{
                width: '36px',
                height: '36px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: '4px',
                transition: 'background-color 0.12s, transform 0.12s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isLight ? '#f0f3fa' : 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'scale(1.15)';
                setHoveredEmoji(item);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
                setHoveredEmoji(null);
              }}
            >
              <img
                src={`/emojis/twemoji/${item.unified}.svg`}
                alt={item.name}
                style={{
                  width: '24px',
                  height: '24px',
                  pointerEvents: 'none'
                }}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('-fe0f')) {
                    target.src = `/emojis/twemoji/${item.unified}-fe0f.svg`;
                  } else {
                    if (target.parentElement) {
                      target.parentElement.style.display = 'none';
                    }
                  }
                }}
              />
            </button>
          ))
        )}
      </div>

      {/* Footer Preview Bar */}
      <div
        style={{
          height: '38px',
          borderTop: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
          backgroundColor: isLight ? '#f8f9fd' : '#191d26',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: '8px',
          fontSize: '12px',
          color: '#787b86',
          overflow: 'hidden'
        }}
      >
        {hoveredEmoji ? (
          <>
            <img
              src={`/emojis/twemoji/${hoveredEmoji.unified}.svg`}
              alt=""
              style={{ width: '20px', height: '20px' }}
            />
            <span style={{ color: isLight ? '#131722' : '#d1d4dc', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {hoveredEmoji.name}
            </span>
          </>
        ) : (
          <span>Select a 2D sticker to place on chart</span>
        )}
      </div>
    </div>
  );
};
