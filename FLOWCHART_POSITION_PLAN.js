/**
 * FLOWCHART POSITION SAVING - Implementation Plan
 * 
 * PROBLEM: Beat positions in flowchart are lost when exporting/importing ASML
 * 
 * SOLUTION: Add position attributes to beat elements in ASML
 * 
 * CHANGES NEEDED:
 * 
 * 1. ASMLGenerator.ts - Export positions
 *    - Add x and y attributes to <beat> element
 *    - Example: <beat x="100" y="200" cluster="main">
 * 
 * 2. ASMLParser.ts - Import positions  
 *    - Read x and y attributes from <beat> element
 *    - Apply to beat instance
 * 
 * 3. Beat.ts - Already has x and y properties ✅
 * 
 * IMPLEMENTATION:
 */

// In ASMLGenerator.ts, modify generateBeat method:
// Change from:
//   const beatAttrs: string[] = [];
//   if (beat.cluster) beatAttrs.push(`cluster="${beat.cluster}"`);
//
// To:
//   const beatAttrs: string[] = [];
//   if (beat.x !== undefined) beatAttrs.push(`x="${Math.round(beat.x)}"`);
//   if (beat.y !== undefined) beatAttrs.push(`y="${Math.round(beat.y)}"`);
//   if (beat.cluster) beatAttrs.push(`cluster="${beat.cluster}"`);

// This will export positions like:
// <beat x="150" y="300" cluster="intro">
//   <id id="beat_1" name="Start" />
//   ...
// </beat>

// In ASMLParser.ts, when parsing beat element:
// Read attributes:
//   const x = beatElement.getAttribute('x');
//   const y = beatElement.getAttribute('y');
//   
// Apply to beat:
//   if (x) beat.x = parseInt(x);
//   if (y) beat.y = parseInt(y);

module.exports = {
  description: 'Add flowchart position saving to ASML export/import',
  files: [
    'packages/core/src/xml/ASMLGenerator.ts',
    'packages/core/src/xml/ASMLParser.ts'
  ],
  priority: 'HIGH',
  status: 'READY_TO_IMPLEMENT'
};
