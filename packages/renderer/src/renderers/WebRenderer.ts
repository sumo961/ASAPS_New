import { BaseRenderer } from './BaseRenderer';
//import type { RenderContext, RenderOptions } from '@asaps/renderer';
import type { RenderContext, RenderOptions } from '../types';

export class WebRenderer extends BaseRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private currentScreen: 'title' | 'text' | 'dialog' | 'choice' | 'video' | 'end' | null = null;

  protected initialize(): void {
    if (!this.context.canvas) {
      throw new Error('WebRenderer requires a canvas element');
    }
    
    this.ctx = this.context.canvas.getContext('2d');
    if (!this.ctx) {
      throw new Error('Could not get 2D context from canvas');
    }

    // Set default styles
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
  }

  async renderTitleScreen(title: string, author: string, buttonText: string): Promise<void> {
    if (!this.ctx) return;
    
    this.clear();
    this.currentScreen = 'title';
    
    const { width, height } = this.context;
    
    // Background gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1e3c72');
    gradient.addColorStop(1, '#2a5298');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
    
    // Title
    this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 48px serif';
    this.ctx.fillText(title, width / 2, height / 3);
    
    // Author
    this.ctx.font = '24px serif';
    this.ctx.fillText(`by ${author}`, width / 2, height / 3 + 60);
    
    // Start button
    this.drawButton(width / 2 - 100, height * 2 / 3, 200, 50, buttonText);
  }

  async renderText(text: string, buttonText: string): Promise<void> {
    if (!this.ctx) return;
    
    this.clear();
    this.currentScreen = 'text';
    
    const { width, height } = this.context;
    
    // Background
    this.ctx.fillStyle = '#f8f9fa';
    this.ctx.fillRect(0, 0, width, height);
    
    // Text box
    const boxMargin = 50;
    const boxWidth = width - (boxMargin * 2);
    const boxHeight = height - 200;
    
    this.ctx.fillStyle = 'white';
    this.ctx.strokeStyle = '#dee2e6';
    this.ctx.lineWidth = 2;
    this.roundRect(boxMargin, boxMargin, boxWidth, boxHeight, 10);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Text content
    this.ctx.fillStyle = '#212529';
    this.ctx.font = '18px sans-serif';
    this.ctx.textAlign = 'left';
    this.wrapText(text, boxMargin + 30, boxMargin + 40, boxWidth - 60, 24);
    
    // Continue button
    this.ctx.textAlign = 'center';
    this.drawButton(width / 2 - 100, height - 100, 200, 50, buttonText);
  }

  async renderDurScreen(text: string, duration: number): Promise<void> {
    if (!this.ctx) return;
    
    this.clear();
    this.currentScreen = 'text';
    
    const { width, height } = this.context;
    
    // Background
    this.ctx.fillStyle = '#f8f9fa';
    this.ctx.fillRect(0, 0, width, height);
    
    // Text box
    const boxMargin = 50;
    const boxWidth = width - (boxMargin * 2);
    const boxHeight = height - 150;
    
    this.ctx.fillStyle = 'white';
    this.ctx.strokeStyle = '#dee2e6';
    this.ctx.lineWidth = 2;
    this.roundRect(boxMargin, boxMargin, boxWidth, boxHeight, 10);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Text content
    this.ctx.fillStyle = '#212529';
    this.ctx.font = '18px sans-serif';
    this.ctx.textAlign = 'left';
    this.wrapText(text, boxMargin + 30, boxMargin + 40, boxWidth - 60, 24);
    
    // Duration indicator
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#6c757d';
    this.ctx.font = '14px sans-serif';
    this.ctx.fillText(`(Auto-advancing in ${duration}s)`, width / 2, height - 50);
    
    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
  }

  async renderDialog(speaker: string, text: string, emotion?: string): Promise<void> {
    if (!this.ctx) return;
    
    this.clear();
    this.currentScreen = 'dialog';
    
    const { width, height } = this.context;
    
    // Background
    this.ctx.fillStyle = '#f8f9fa';
    this.ctx.fillRect(0, 0, width, height);
    
    // Speaker name box
    const nameBoxHeight = 40;
    const nameBoxWidth = 200;
    const dialogBoxMargin = 50;
    
    this.ctx.fillStyle = '#6c757d';
    this.roundRect(dialogBoxMargin, height - 250, nameBoxWidth, nameBoxHeight, [10, 10, 0, 0]);
    this.ctx.fill();
    
    this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 16px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(speaker, dialogBoxMargin + nameBoxWidth / 2, height - 230);
    
    // Dialog box
    const dialogBoxWidth = width - (dialogBoxMargin * 2);
    const dialogBoxHeight = 150;
    
    this.ctx.fillStyle = 'white';
    this.ctx.strokeStyle = '#dee2e6';
    this.ctx.lineWidth = 2;
    this.roundRect(dialogBoxMargin, height - 210, dialogBoxWidth, dialogBoxHeight, 10);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Dialog text
    this.ctx.fillStyle = '#212529';
    this.ctx.font = '16px sans-serif';
    this.ctx.textAlign = 'left';
    this.wrapText(text, dialogBoxMargin + 20, height - 180, dialogBoxWidth - 40, 22);
    
    // Emotion indicator if present
    if (emotion) {
      this.ctx.fillStyle = this.getEmotionColor(emotion);
      this.ctx.font = '24px sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(this.getEmotionEmoji(emotion), width - dialogBoxMargin - 20, height - 230);
    }
  }

  async renderChoices(choices: { id: string; text: string }[]): Promise<string> {
    if (!this.ctx) return choices[0]?.id || '';
    
    const { width, height } = this.context;
    const choiceHeight = 60;
    const choiceMargin = 20;
    const totalHeight = choices.length * (choiceHeight + choiceMargin);
    const startY = (height - totalHeight) / 2;
    
    // Draw choice buttons
    choices.forEach((choice, index) => {
      const y = startY + index * (choiceHeight + choiceMargin);
      this.drawButton(width / 2 - 250, y, 500, choiceHeight, choice.text, choice.id);
    });
    
    // Wait for user selection
    return this.waitForChoice(choices);
  }

  async renderMovement(question: string, choices: { id: string; text: string; location: string }[]): Promise<string> {
    if (!this.ctx) return choices[0]?.id || '';
    
    this.clear();
    this.currentScreen = 'choice';
    
    const { width, height } = this.context;
    
    // Background
    this.ctx.fillStyle = '#e8f4f8';
    this.ctx.fillRect(0, 0, width, height);
    
    // Question
    this.ctx.fillStyle = '#212529';
    this.ctx.font = 'bold 24px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(question, width / 2, 100);
    
    // Movement choices with location icons
    const choiceHeight = 80;
    const choiceMargin = 20;
    const totalHeight = choices.length * (choiceHeight + choiceMargin);
    const startY = (height - totalHeight) / 2;
    
    choices.forEach((choice, index) => {
      const y = startY + index * (choiceHeight + choiceMargin);
      
      // Draw location card
      this.ctx!.fillStyle = 'white';
      this.ctx!.strokeStyle = '#0066cc';
      this.ctx!.lineWidth = 2;
      this.roundRect(width / 2 - 250, y, 500, choiceHeight, 10);
      this.ctx!.fill();
      this.ctx!.stroke();
      
      // Location icon
      this.ctx!.fillStyle = '#0066cc';
      this.ctx!.font = '32px sans-serif';
      this.ctx!.textAlign = 'left';
      this.ctx!.fillText('📍', width / 2 - 220, y + choiceHeight / 2);
      
      // Choice text
      this.ctx!.fillStyle = '#212529';
      this.ctx!.font = '18px sans-serif';
      this.ctx!.fillText(choice.text, width / 2 - 170, y + choiceHeight / 2 - 10);
      
      // Location name
      this.ctx!.fillStyle = '#6c757d';
      this.ctx!.font = '14px sans-serif';
      this.ctx!.fillText(choice.location, width / 2 - 170, y + choiceHeight / 2 + 10);
    });
    
    return this.waitForChoice(choices);
  }

  async renderPropSelection(question: string, props: { id: string; name: string; description: string }[]): Promise<string> {
    if (!this.ctx) return props[0]?.id || '';
    
    this.clear();
    this.currentScreen = 'choice';
    
    const { width, height } = this.context;
    
    // Background
    this.ctx.fillStyle = '#f5f3f0';
    this.ctx.fillRect(0, 0, width, height);
    
    // Question
    this.ctx.fillStyle = '#212529';
    this.ctx.font = 'bold 24px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(question, width / 2, 80);
    
    // Prop grid
    const cols = 3;
    const cardWidth = 150;
    const cardHeight = 180;
    const cardMargin = 20;
    const gridWidth = cols * cardWidth + (cols - 1) * cardMargin;
    const startX = (width - gridWidth) / 2;
    const startY = 150;
    
    props.forEach((prop, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (cardWidth + cardMargin);
      const y = startY + row * (cardHeight + cardMargin);
      
      // Draw prop card
      this.ctx!.fillStyle = 'white';
      this.ctx!.strokeStyle = '#8b7355';
      this.ctx!.lineWidth = 2;
      this.roundRect(x, y, cardWidth, cardHeight, 10);
      this.ctx!.fill();
      this.ctx!.stroke();
      
      // Prop icon
      this.ctx!.fillStyle = '#8b7355';
      this.ctx!.font = '48px sans-serif';
      this.ctx!.textAlign = 'center';
      this.ctx!.fillText('🎒', x + cardWidth / 2, y + 50);
      
      // Prop name
      this.ctx!.fillStyle = '#212529';
      this.ctx!.font = 'bold 16px sans-serif';
      this.ctx!.fillText(prop.name, x + cardWidth / 2, y + 100);
      
      // Prop description
      this.ctx!.fillStyle = '#6c757d';
      this.ctx!.font = '12px sans-serif';
      this.wrapText(prop.description, x + 10, y + 120, cardWidth - 20, 14);
    });
    
    return this.waitForChoice(props);
  }

  async renderInputText(prompt: string, placeholder?: string, buttonText?: string, options?: {
    validation?: 'none' | 'numeric' | 'email' | 'alphanumeric';
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  }): Promise<string> {
    if (!this.ctx) return '';
    
    this.clear();
    this.currentScreen = 'choice';
    
    const { width, height } = this.context;
    
    // Background
    this.ctx.fillStyle = '#f8f9fa';
    this.ctx.fillRect(0, 0, width, height);
    
    // Prompt
    this.ctx.fillStyle = '#212529';
    this.ctx.font = 'bold 24px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(prompt, width / 2, height / 3);
    
    // Input box simulation
    const inputWidth = 400;
    const inputHeight = 50;
    const inputX = (width - inputWidth) / 2;
    const inputY = height / 2 - inputHeight / 2;
    
    this.ctx.fillStyle = 'white';
    this.ctx.strokeStyle = '#007bff';
    this.ctx.lineWidth = 2;
    this.roundRect(inputX, inputY, inputWidth, inputHeight, 5);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Placeholder text
    this.ctx.fillStyle = '#aaa';
    this.ctx.font = '16px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(placeholder || 'Enter text...', inputX + 15, inputY + inputHeight / 2);
    
    // Validation hint
    if (options?.validation && options.validation !== 'none') {
      this.ctx.fillStyle = '#6c757d';
      this.ctx.font = '14px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`Format: ${options.validation}`, width / 2, inputY + inputHeight + 30);
    }
    
    // Length constraints
    if (options?.minLength || options?.maxLength) {
      this.ctx.fillStyle = '#6c757d';
      this.ctx.font = '12px sans-serif';
      this.ctx.textAlign = 'center';
      const lengthText = options.minLength && options.maxLength 
        ? `Length: ${options.minLength}-${options.maxLength} characters`
        : options.minLength
        ? `Minimum: ${options.minLength} characters`
        : `Maximum: ${options.maxLength} characters`;
      this.ctx.fillText(lengthText, width / 2, inputY + inputHeight + 50);
    }
    
    // Submit button
    this.drawButton(width / 2 - 75, height * 2 / 3, 150, 50, buttonText || 'Submit');
    
    // In a real implementation, this would create an actual input element
    // For now, return a placeholder
    return new Promise(resolve => {
      // Simulate input
      setTimeout(() => resolve('user_input'), 1000);
    });
  }

  async renderHyperText(data: {
    text: string;
    links: Array<{
      word: string;
      targetBeatId: string;
      style: {
        color: string;
        hoverColor: string;
        underline: boolean;
        bold: boolean;
      };
    }>;
    allowMultiple: boolean;
  }): Promise<string> {
    if (!this.ctx) return data.links[0]?.targetBeatId || '';
    
    this.clear();
    this.currentScreen = 'text';
    
    const { width, height } = this.context;
    
    // Background
    this.ctx.fillStyle = '#f8f9fa';
    this.ctx.fillRect(0, 0, width, height);
    
    // Text box
    const boxMargin = 50;
    const boxWidth = width - (boxMargin * 2);
    const boxHeight = height - 150;
    
    this.ctx.fillStyle = 'white';
    this.ctx.strokeStyle = '#dee2e6';
    this.ctx.lineWidth = 2;
    this.roundRect(boxMargin, boxMargin, boxWidth, boxHeight, 10);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Render text with highlighted links
    this.ctx.fillStyle = '#212529';
    this.ctx.font = '18px sans-serif';
    this.ctx.textAlign = 'left';
    
    // Split text and highlight links
    let displayText = data.text;
    data.links.forEach(link => {
      // Replace link words with markers that show styling
      const marker = link.style.bold ? `**[${link.word}]**` : `[${link.word}]`;
      displayText = displayText.replace(link.word, marker);
    });
    
    this.wrapText(displayText, boxMargin + 30, boxMargin + 40, boxWidth - 60, 24);
    
    // Instruction
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#6c757d';
    this.ctx.font = '14px sans-serif';
    const instruction = data.allowMultiple 
      ? 'Click on any highlighted word to continue'
      : 'Click on the highlighted word to continue';
    this.ctx.fillText(instruction, width / 2, height - 50);
    
    // Return first link target as default
    // In a real implementation, this would detect which link was clicked
    return this.waitForLinkClick(data.links);
  }

  private async waitForLinkClick(links: Array<{
    word: string;
    targetBeatId: string;
    style: { color: string; hoverColor: string; underline: boolean; bold: boolean; };
  }>): Promise<string> {
    // Simplified - return first link after a delay
    return new Promise(resolve => {
      setTimeout(() => resolve(links[0]?.targetBeatId || ''), 2000);
    });
  }

  async renderVideo(videoFile: string, autoplay: boolean, controls: boolean): Promise<void> {
    this.clear();
    this.currentScreen = 'video';
    
    const { width, height } = this.context;
    
    // Create video element
    const video = await this.loadVideo(videoFile);
    video.width = width;
    video.height = height;
    video.controls = controls;
    video.autoplay = autoplay;
    
    // Add to container or draw on canvas
    if (this.context.container) {
      this.context.container.appendChild(video);
      
      if (autoplay) {
        await video.play();
      }
      
      // Wait for video to end or skip
      await new Promise<void>(resolve => {
        video.onended = () => resolve();
        
        // Add skip button if needed
        if (!controls) {
          const skipButton = document.createElement('button');
          skipButton.textContent = 'Skip';
          skipButton.style.position = 'absolute';
          skipButton.style.bottom = '20px';
          skipButton.style.right = '20px';
          skipButton.onclick = () => resolve();
          this.context.container!.appendChild(skipButton);
        }
      });
      
      // Clean up
      this.context.container.removeChild(video);
    }
  }

  async renderEndScreen(message: string, showRestart: boolean, showCredits: boolean): Promise<void> {
    if (!this.ctx) return;
    
    this.clear();
    this.currentScreen = 'end';
    
    const { width, height } = this.context;
    
    // Background gradient
    const gradient = this.ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
    
    // End message
    this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 48px serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(message, width / 2, height / 3);
    
    // Buttons
    const buttonY = height * 2 / 3;
    const buttonWidth = 150;
    const buttonHeight = 50;
    const buttonSpacing = 20;
    
    let totalWidth = 0;
    if (showRestart) totalWidth += buttonWidth;
    if (showCredits) totalWidth += buttonWidth + (showRestart ? buttonSpacing : 0);
    
    let currentX = (width - totalWidth) / 2;
    
    if (showRestart) {
      this.drawButton(currentX, buttonY, buttonWidth, buttonHeight, 'Restart');
      currentX += buttonWidth + buttonSpacing;
    }
    
    if (showCredits) {
      this.drawButton(currentX, buttonY, buttonWidth, buttonHeight, 'Credits');
    }
  }

  // Helper methods
  private drawButton(x: number, y: number, width: number, height: number, text: string, id?: string): void {
    if (!this.ctx) return;
    
    // Button background
    this.ctx.fillStyle = '#007bff';
    this.roundRect(x, y, width, height, 5);
    this.ctx.fill();
    
    // Button text
    this.ctx.fillStyle = 'white';
    this.ctx.font = '16px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x + width / 2, y + height / 2);
    
    // Store button position for click detection
    if (id) {
      this.setState(`button_${id}`, { x, y, width, height });
    }
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number | number[]): void {
    if (!this.ctx) return;
    
    const radii = typeof radius === 'number' 
      ? [radius, radius, radius, radius] 
      : radius;
    
    this.ctx.beginPath();
    this.ctx.moveTo(x + radii[0], y);
    this.ctx.lineTo(x + width - radii[1], y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radii[1]);
    this.ctx.lineTo(x + width, y + height - radii[2]);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radii[2], y + height);
    this.ctx.lineTo(x + radii[3], y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radii[3]);
    this.ctx.lineTo(x, y + radii[0]);
    this.ctx.quadraticCurveTo(x, y, x + radii[0], y);
    this.ctx.closePath();
  }

  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    if (!this.ctx) return;
    
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    
    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = this.ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > maxWidth && line.length > 0) {
        this.ctx.fillText(line, x, currentY);
        line = word + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    
    this.ctx.fillText(line, x, currentY);
  }

  private async waitForChoice(choices: { id: string; [key: string]: any }[]): Promise<string> {
    return new Promise(resolve => {
      const handleClick = (event: MouseEvent) => {
        if (!this.context.canvas) return;
        
        const rect = this.context.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Check which choice was clicked
        for (const choice of choices) {
          const button = this.getState(`button_${choice.id}`);
          if (button && 
              x >= button.x && x <= button.x + button.width &&
              y >= button.y && y <= button.y + button.height) {
            this.context.canvas.removeEventListener('click', handleClick);
            resolve(choice.id);
            return;
          }
        }
      };
      
      this.context.canvas!.addEventListener('click', handleClick);
    });
  }

  private getEmotionColor(emotion: string): string {
    const emotions: Record<string, string> = {
      happy: '#28a745',
      sad: '#007bff',
      angry: '#dc3545',
      surprised: '#ffc107',
      neutral: '#6c757d'
    };
    return emotions[emotion.toLowerCase()] || emotions.neutral;
  }

  private getEmotionEmoji(emotion: string): string {
    const emojis: Record<string, string> = {
      happy: '😊',
      sad: '😢',
      angry: '😠',
      surprised: '😮',
      neutral: '😐'
    };
    return emojis[emotion.toLowerCase()] || emojis.neutral;
  }
}
