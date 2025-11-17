// ============= UNIVERSAL POSITIONED RENDERING SYSTEM =============
// This single method handles positioning for ALL beat types
// No more duplicate code - one implementation serves all beats!

/**
 * Generic positioned rendering that works for any beat type
 * Maps locations to React elements automatically
 * 
 * @param beatType - Type of beat (titleScreen, introText, endScreen, etc.)
 * @param content - Content object with all beat-specific data
 * @param locations - Array of Location objects from visual editor
 * @param waitForAction - Whether to wait for user action (button click)
 */
private async renderPositioned(
  beatType: string,
  content: Record<string, any>,
  locations: Location[],
  waitForAction: boolean = true
): Promise<void> {
  console.log(`[ReactRenderer ${this.instanceId}] Rendering positioned ${beatType} with ${locations.length} elements`);
  
  return new Promise(resolve => {
    if (waitForAction) {
      this.resolveAction = (id: string) => {
        this.resolveAction = null;
        resolve();
      };
    } else {
      resolve();
    }
    
    // Get background style for beat type
    const background = this.getBackgroundForBeat(beatType);
    
    // Render container with positioned elements
    this.renderComponent(
      <div className={`relative w-full h-screen ${background} overflow-hidden`}>
        {locations.map((loc, index) => this.renderLocationElement(loc, index, content, beatType))}
      </div>
    );
  });
}

/**
 * Get appropriate background styling for beat type
 */
private getBackgroundForBeat(beatType: string): string {
  const backgrounds: Record<string, string> = {
    titleScreen: 'bg-gradient-to-b from-blue-900 to-blue-700',
    introText: 'bg-gray-100',
    durScreen: 'bg-gray-100',
    endScreen: 'bg-gradient-to-br from-purple-600 to-pink-600',
    inputText: 'bg-gradient-to-br from-indigo-500 to-purple-600',
    hyperText: 'bg-gradient-to-br from-teal-400 to-blue-500',
    dialogTree: 'bg-gray-100',
    // Add more as needed
  };
  return backgrounds[beatType] || 'bg-gray-100';
}

/**
 * Render a single element based on its location data
 * Automatically determines element type and content
 */
private renderLocationElement(
  loc: Location,
  index: number,
  content: Record<string, any>,
  beatType: string
): React.ReactNode {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${loc.x}px`,
    top: `${loc.y}px`,
    width: `${loc.width}px`,
    height: `${loc.height}px`,
    zIndex: loc.zIndex || 0,
  };

  // Get text content for this element
  const text = this.getContentForLocation(loc, content, beatType);
  
  if (!text && loc.kind !== 'character' && loc.kind !== 'prop') {
    return null; // Skip elements with no content
  }

  // Render based on element kind
  switch (loc.kind) {
    case 'text':
      // Text elements - titles, labels, etc.
      const fontSize = loc.height > 50 ? '48px' : loc.height > 30 ? '24px' : '16px';
      return (
        <div
          key={index}
          className="absolute flex items-center justify-center text-white font-bold"
          style={{ ...baseStyle, fontSize }}
        >
          {text}
        </div>
      );

    case 'button':
    case 'hotspot':
      // Clickable buttons
      return (
        <button
          key={index}
          onClick={() => this.handleAction(loc.name || 'continue')}
          className="absolute bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
          style={{ ...baseStyle, fontSize: '18px' }}
        >
          {text}
        </button>
      );

    case 'dialog':
      // Dialog text boxes
      return (
        <div
          key={index}
          className="absolute bg-white rounded-lg shadow-lg p-4 text-gray-800 flex items-center"
          style={baseStyle}
        >
          <p className="text-lg whitespace-pre-wrap">{text}</p>
        </div>
      );

    case 'character':
    case 'prop':
      // Visual assets (placeholder for now)
      return (
        <div
          key={index}
          className="absolute bg-gray-300 rounded flex items-center justify-center text-xs text-gray-600"
          style={baseStyle}
        >
          {loc.name}
        </div>
      );

    default:
      return null;
  }
}

/**
 * Smart content resolution - finds the right content for each location
 * Works across all beat types automatically
 */
private getContentForLocation(
  loc: Location,
  content: Record<string, any>,
  beatType: string
): string {
  const nameLower = loc.name?.toLowerCase() || '';
  
  // Try location name mapping first
  if (nameLower.includes('title')) return content.title || '';
  if (nameLower.includes('author')) return content.author ? `by ${content.author}` : '';
  if (nameLower.includes('start')) return content.buttonText || 'Start';
  if (nameLower.includes('continue') || nameLower.includes('submit')) {
    return content.buttonText || 'Continue';
  }
  if (nameLower.includes('restart')) return content.buttonText || 'Play Again';
  
  // Beat-specific content mapping
  if (nameLower.includes('main') || nameLower.includes('text') || loc.kind === 'dialog') {
    return content.text || '';
  }
  if (nameLower.includes('end') || nameLower.includes('message')) {
    return content.message || 'The End';
  }
  if (nameLower.includes('prompt')) {
    return content.prompt || '';
  }
  
  // For buttons/hotspots without specific names
  if (loc.kind === 'button' || loc.kind === 'hotspot') {
    return content.buttonText || loc.name || 'Continue';
  }
  
  // Fallback: try to find any text content
  return content.text || content.message || content.prompt || loc.name || '';
}

// ============= UPDATED RENDER METHODS =============
// All render methods now use the general positioning system

async renderTitleScreen(title: string, author: string, buttonText: string, locations?: Location[]): Promise<void> {
  if (locations?.length > 0) {
    return this.renderPositioned('titleScreen', { title, author, buttonText }, locations);
  }
  // Fallback to centered layout
  return new Promise(resolve => {
    this.resolveAction = () => { this.resolveAction = null; resolve(); };
    this.renderComponent(<TitleScreen title={title} author={author} buttonText={buttonText} onAction={this.handleAction} />);
  });
}

async renderText(text: string, buttonText: string, locations?: Location[]): Promise<void> {
  if (locations?.length > 0) {
    return this.renderPositioned('introText', { text, buttonText }, locations);
  }
  // Fallback to centered layout
  return new Promise(resolve => {
    this.resolveAction = () => { this.resolveAction = null; resolve(); };
    this.renderComponent(<TextDisplay text={text} buttonText={buttonText} onAction={this.handleAction} />);
  });
}

async renderEndScreen(message: string, showRestart: boolean, showCredits: boolean, locations?: Location[]): Promise<void> {
  if (locations?.length > 0) {
    const buttonText = showRestart ? 'Play Again' : showCredits ? 'Credits' : 'Close';
    return this.renderPositioned('endScreen', { message, buttonText, showRestart, showCredits }, locations);
  }
  // Fallback to centered layout
  return new Promise(resolve => {
    this.resolveAction = () => { this.resolveAction = null; resolve(); };
    this.renderComponent(<EndScreen message={message} showRestart={showRestart} showCredits={showCredits} onAction={this.handleAction} />);
  });
}
