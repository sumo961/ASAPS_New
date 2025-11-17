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
    // Use the new parser's parse method
    return await this.parser.parse(xmlContent);
  }

  /**
   * Generate ASML XML from a Story object
   */
  generateASML(story: Story): string {
    return this.generator.generate(story);
  }
}