# How to Apply Visual Elements Export Patch

## Instructions:
1. Open `/packages/core/src/xml/ASMLGenerator.ts`
2. Find the `generateBeat` method (around line 260-290)
3. Look for the section where sound is generated:
   ```typescript
   // Sound
   if (beat.sound) {
     this.generateSound(beat.sound, lines, beatIndent + this.indent);
   }
   ```
4. Right after the sound section, add the code from `/visual-patches/ASMLGenerator-visual-patch.txt`
5. The visual elements will be exported between `<sound>` and `<defaulttarget>`

## What this adds:
- Exports `<node>` element for background images
- Exports `<locs>` container with `<loc>` elements for visual elements
- Maps element types to ASML kinds (character -> char, dialog -> text, etc.)
- Includes position, size, and optional properties

## Example ASML Output After Patch:
```xml
<beat>
  <id id="1" name="Title Screen"/>
  <transition type="Fade" duration="1"/>
  <sound name=""/>
  <node>background_asset_1</node>
  <locs>
    <loc kind="text" name="My Story" x="400" y="200" z="1" width="400" height="60"/>
    <loc kind="button" name="Start" x="400" y="500" z="2" width="200" height="50"/>
  </locs>
  <defaulttarget targetBeat="2" val="0"/>
  <function kind="titleScreen" title="My Story" author="Author Name"/>
</beat>
```

## Testing:
1. Create a titleScreen beat
2. Add visual elements in the Visual Editor
3. Save visual changes
4. Export the story to ASML
5. Check that the exported XML contains `<node>` and `<locs>` elements

## Troubleshooting:
- If visual elements don't export, ensure you saved visual changes before exporting
- Check that beat parameters include `visualElements` or `locs` array
- Verify the patch was added after sound generation but before defaulttarget
