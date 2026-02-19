import React from 'react';

/**
 * Dock mode: relative to character or fixed to screen corner
 */
export type InventoryFrameDockMode = 'character' | 'screen';

/**
 * Anchor position for inventory frame relative to character
 */
export type InventoryFrameAnchor =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Screen corner positions for fixed docking
 */
export type InventoryFrameScreenPosition =
  | 'screen-top-left' | 'screen-top-right'
  | 'screen-bottom-left' | 'screen-bottom-right';

/**
 * Inventory frame style configuration
 */
export interface InventoryFrameStyle {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  opacity: number;  // 0-100
}

/**
 * Configuration for the inventory frame
 */
export interface InventoryFrameConfig {
  dockMode: InventoryFrameDockMode;
  anchor: InventoryFrameAnchor;
  screenPosition: InventoryFrameScreenPosition;
  offset: { x: number; y: number };
  style: InventoryFrameStyle;
  itemSize: number;
  columns: number;
  itemSpacing: number;
  showLabels: boolean;
  showOnDemand: boolean;
}

/**
 * Inventory item data needed for rendering
 */
export interface InventoryItemData {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;  // URL or data URI
  quantity: number;
  category: string;
}

/**
 * Props for CharacterInventoryFrame component
 */
export interface CharacterInventoryFrameProps {
  /** Items to display */
  items: InventoryItemData[];
  /** Inventory frame configuration */
  config: InventoryFrameConfig;
  /** Character position on stage */
  characterPosition: { x: number; y: number };
  /** Character dimensions */
  characterDimensions: { width: number; height: number };
  /** Container/viewport dimensions (required for screen docking) */
  containerDimensions?: { width: number; height: number };
  /** Whether inventory is currently visible (for showOnDemand mode) */
  isVisible?: boolean;
  /** Optional resolver to get asset URLs by item name (for prop icons) */
  assetResolver?: (itemName: string) => string | undefined;
  /** Optional title for the inventory frame */
  title?: string;
  /** Font scale multiplier (default 1.0) */
  fontScale?: number;
  /** Auto-minimize on load (shows collapsed badge, click to expand) */
  autoMinimize?: boolean;
}

/**
 * Calculate frame position based on anchor and character position/dimensions
 */
function calculateCharacterAnchorPosition(
  anchor: InventoryFrameAnchor,
  charPos: { x: number; y: number },
  charDims: { width: number; height: number },
  offset: { x: number; y: number },
  frameWidth: number,
  frameHeight: number
): { x: number; y: number } {
  const charCenterX = charPos.x + charDims.width / 2;
  const charCenterY = charPos.y + charDims.height / 2;

  let x: number;
  let y: number;

  switch (anchor) {
    case 'top':
      x = charCenterX - frameWidth / 2;
      y = charPos.y - frameHeight;
      break;
    case 'bottom':
      x = charCenterX - frameWidth / 2;
      y = charPos.y + charDims.height;
      break;
    case 'left':
      x = charPos.x - frameWidth;
      y = charCenterY - frameHeight / 2;
      break;
    case 'right':
      x = charPos.x + charDims.width;
      y = charCenterY - frameHeight / 2;
      break;
    case 'top-left':
      x = charPos.x - frameWidth;
      y = charPos.y - frameHeight;
      break;
    case 'top-right':
      x = charPos.x + charDims.width;
      y = charPos.y - frameHeight;
      break;
    case 'bottom-left':
      x = charPos.x - frameWidth;
      y = charPos.y + charDims.height;
      break;
    case 'bottom-right':
      x = charPos.x + charDims.width;
      y = charPos.y + charDims.height;
      break;
    default:
      x = charCenterX - frameWidth / 2;
      y = charPos.y - frameHeight;
  }

  return {
    x: x + offset.x,
    y: y + offset.y,
  };
}

/**
 * Calculate frame position for screen corner docking
 */
function calculateScreenPosition(
  screenPosition: InventoryFrameScreenPosition,
  containerDims: { width: number; height: number },
  offset: { x: number; y: number },
  frameWidth: number,
  frameHeight: number
): { x: number; y: number } {
  const margin = 10; // Base margin from screen edges

  let x: number;
  let y: number;

  switch (screenPosition) {
    case 'screen-top-left':
      x = margin;
      y = margin;
      break;
    case 'screen-top-right':
      x = containerDims.width - frameWidth - margin;
      y = margin;
      break;
    case 'screen-bottom-left':
      x = margin;
      y = containerDims.height - frameHeight - margin;
      break;
    case 'screen-bottom-right':
      x = containerDims.width - frameWidth - margin;
      y = containerDims.height - frameHeight - margin;
      break;
    default:
      x = margin;
      y = margin;
  }

  return {
    x: x + offset.x,
    y: y + offset.y,
  };
}

/**
 * Individual inventory item component
 */
const InventoryItem: React.FC<{
  item: InventoryItemData;
  size: number;
  showLabel: boolean;
  fontScale?: number;
}> = ({ item, size, showLabel, fontScale = 1.0 }) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const [tooltipPosition, setTooltipPosition] = React.useState<'above' | 'below'>('above');
  const itemRef = React.useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    setShowTooltip(true);
    // Determine tooltip position based on item position in viewport
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      if (rect.top < 100) {
        setTooltipPosition('below');
      } else {
        setTooltipPosition('above');
      }
    }
  };

  // Generate a consistent color from the item name for items without icons
  const getItemColor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 50%)`;
  };

  const hasIcon = item.icon && item.icon.trim() !== '';

  return (
    <div
      ref={itemRef}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Item icon/placeholder */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          backgroundColor: hasIcon ? 'rgba(255, 255, 255, 0.1)' : getItemColor(item.name),
          border: '1px solid rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {hasIcon ? (
          <img
            src={item.icon}
            alt={item.displayName}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <span
            style={{
              fontSize: size * 0.5,
              fontWeight: 'bold',
              color: 'white',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            }}
          >
            {item.displayName.charAt(0).toUpperCase()}
          </span>
        )}

        {/* Quantity badge */}
        {item.quantity > 1 && (
          <div
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              fontSize: Math.round(10 * fontScale),
              fontWeight: 'bold',
              padding: '1px 4px',
              borderRadius: 4,
              minWidth: 16,
              textAlign: 'center',
            }}
          >
            {item.quantity}
          </div>
        )}
      </div>

      {/* Item label */}
      {showLabel && (
        <span
          style={{
            marginTop: 2,
            fontSize: Math.round(9 * fontScale),
            color: 'white',
            textShadow: '0 1px 1px rgba(0, 0, 0, 0.5)',
            maxWidth: size + 10,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          {item.displayName}
        </span>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            [tooltipPosition === 'above' ? 'bottom' : 'top']: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: tooltipPosition === 'above' ? 8 : 0,
            marginTop: tooltipPosition === 'below' ? 8 : 0,
            backgroundColor: 'rgba(20, 20, 30, 0.95)',
            border: '1px solid rgba(100, 100, 255, 0.5)',
            borderRadius: 6,
            padding: '8px 12px',
            minWidth: 120,
            maxWidth: 200,
            zIndex: 1100,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Tooltip arrow */}
          <div
            style={{
              position: 'absolute',
              [tooltipPosition === 'above' ? 'bottom' : 'top']: -6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              [tooltipPosition === 'above' ? 'borderTop' : 'borderBottom']: '6px solid rgba(20, 20, 30, 0.95)',
            }}
          />
          <div style={{ fontWeight: 'bold', color: 'white', marginBottom: 4, fontSize: Math.round(12 * fontScale) }}>
            {item.displayName}
          </div>
          {item.description && (
            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: Math.round(11 * fontScale), marginBottom: 4 }}>
              {item.description}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: Math.round(10 * fontScale) }}>
            {item.category && (
              <span style={{ color: 'rgba(150, 150, 255, 0.9)', fontStyle: 'italic' }}>
                {item.category}
              </span>
            )}
            {item.quantity > 1 && (
              <span style={{ color: 'rgba(255, 200, 100, 0.9)' }}>
                x{item.quantity}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * CharacterInventoryFrame - HUD overlay for character inventory
 *
 * Renders inventory items in a grid layout with hover tooltips.
 */
export const CharacterInventoryFrame: React.FC<CharacterInventoryFrameProps> = ({
  items,
  config,
  characterPosition,
  characterDimensions,
  containerDimensions,
  isVisible = true,
  assetResolver,
  title = 'Inventory',
  fontScale = 1.0,
  autoMinimize = false,
}) => {
  const [minimized, setMinimized] = React.useState(autoMinimize);

  // Hide if no items or not visible
  if (items.length === 0 || !isVisible) {
    return null;
  }

  const { style, itemSize, columns, itemSpacing, showLabels } = config;
  const dockMode = config.dockMode ?? 'screen';

  // Resolve item icons using asset resolver if available
  const resolvedItems = items.map(item => {
    if (item.icon) return item; // Already has icon
    if (assetResolver) {
      const resolvedIcon = assetResolver(item.name);
      if (resolvedIcon) {
        return { ...item, icon: resolvedIcon };
      }
    }
    return item;
  });

  // Calculate frame dimensions based on content
  const headerHeight = 24; // Height for "Inventory" title
  const rows = Math.ceil(items.length / columns);
  const labelHeight = showLabels ? 14 : 0;
  const itemTotalHeight = itemSize + labelHeight;
  const frameContentWidth = columns * itemSize + (columns - 1) * itemSpacing;
  const frameContentHeight = rows * itemTotalHeight + (rows - 1) * itemSpacing;
  const frameWidth = frameContentWidth + style.padding * 2;
  const frameHeight = frameContentHeight + style.padding * 2 + headerHeight;

  // Calculate position based on dock mode
  const rawPosition = dockMode === 'screen' && containerDimensions
    ? calculateScreenPosition(
        config.screenPosition ?? 'screen-bottom-right',
        containerDimensions,
        config.offset,
        frameWidth,
        frameHeight
      )
    : calculateCharacterAnchorPosition(
        config.anchor,
        characterPosition,
        characterDimensions,
        config.offset,
        frameWidth,
        frameHeight
      );

  // Clamp position to stay within stage bounds (prevent clipping by overflow:hidden)
  const stageW = containerDimensions?.width ?? 1024;
  const stageH = containerDimensions?.height ?? 768;
  const position = {
    x: Math.max(0, Math.min(rawPosition.x, stageW - frameWidth)),
    y: Math.max(0, Math.min(rawPosition.y, stageH - frameHeight)),
  };

  // Minimized badge: small grid icon that looks like inventory slots + item count
  if (minimized) {
    const badgeWidth = Math.round(44 * fontScale);
    const badgeHeight = Math.round(36 * fontScale);
    const slotSize = Math.round(8 * fontScale);
    const slotGap = Math.round(2 * fontScale);
    // Show up to 2x2 grid of colored slots representing items
    const previewItems = resolvedItems.slice(0, 4);
    return (
      <div
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: badgeWidth,
          height: badgeHeight,
          backgroundColor: style.backgroundColor,
          border: `${style.borderWidth}px solid ${style.borderColor}`,
          borderRadius: style.borderRadius,
          opacity: style.opacity / 100,
          display: 'flex',
          alignItems: 'center',
          gap: Math.round(4 * fontScale),
          padding: `${Math.round(4 * fontScale)}px ${Math.round(6 * fontScale)}px`,
          pointerEvents: 'auto',
          cursor: 'pointer',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
        onClick={() => setMinimized(false)}
        title={`${title} (${items.length} items) - click to expand`}
      >
        {/* Mini grid icon */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(2, ${slotSize}px)`,
            gap: slotGap,
          }}
        >
          {[0, 1, 2, 3].map((i) => {
            const item = previewItems[i];
            const hasItem = !!item;
            const itemColor = hasItem && item.icon ? 'rgba(255, 255, 255, 0.6)' : hasItem ? `hsl(${Math.abs(item.name.split('').reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0) % 360)}, 60%, 50%)` : 'rgba(255, 255, 255, 0.15)';
            return (
              <div
                key={i}
                style={{
                  width: slotSize,
                  height: slotSize,
                  borderRadius: 2,
                  backgroundColor: itemColor,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              />
            );
          })}
        </div>
        {/* Item count */}
        <span style={{ fontSize: Math.round(11 * fontScale), fontWeight: 'bold', color: 'white', textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)' }}>
          {items.length}
        </span>
      </div>
    );
  }

  const frameStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: frameWidth,
    backgroundColor: style.backgroundColor,
    border: `${style.borderWidth}px solid ${style.borderColor}`,
    borderRadius: style.borderRadius,
    padding: style.padding,
    opacity: style.opacity / 100,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'auto', // Allow hover interactions
    zIndex: 1000,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    transition: 'opacity 0.2s ease-out',
  };

  const headerStyle: React.CSSProperties = {
    fontSize: Math.round(12 * fontScale),
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
    cursor: autoMinimize ? 'pointer' : undefined,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, ${itemSize}px)`,
    gap: itemSpacing,
  };

  return (
    <div style={frameStyle}>
      <div style={headerStyle} onClick={autoMinimize ? () => setMinimized(true) : undefined}>
        {title}{autoMinimize ? ' \u25BC' : ''}
      </div>
      <div style={gridStyle}>
        {resolvedItems.map((item) => (
          <InventoryItem
            key={item.id}
            item={item}
            size={itemSize}
            showLabel={showLabels}
            fontScale={fontScale}
          />
        ))}
      </div>
    </div>
  );
};

export default CharacterInventoryFrame;
