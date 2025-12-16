import { Story } from '../engine/Story';
import { ASMLParser } from './ASMLParser';
import { ASMLGenerator } from './ASMLGenerator';

export class ASMLProcessor {
  private parser: ASMLParser;
  private generator: ASMLGenerator;

  constructor() {
    this.parser = new ASMLParser();
    this.generator = new ASMLGenerator();
  }

  /**
   * Parse ASML XML content into a Story object
   */
  async parseASML(xmlContent: string): Promise<{
    success: boolean;
    story?: Story;
    errors: string[];
    warnings: string[];
  }> {
    console.warn('[ASMLProcessor] ★★★ parseASML called, calling parser.parse() ★★★');
    // Use the new parser's parse method
    const result = await this.parser.parse(xmlContent);
    console.warn('[ASMLProcessor] ★★★ parser.parse() returned ★★★');
    return result;
  }

  /**
   * Generate ASML XML from a Story object
   */
  generateASML(story: Story): string {
    return this.generator.generate(story);
  }
}