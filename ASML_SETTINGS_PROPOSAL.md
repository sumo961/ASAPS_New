# ASML Settings Structure Proposal

## Current Issues
Many global settings are not represented in the ASML export, including:
- NPC color and alpha
- Text box border color  
- Hotspot highlight color
- Text box appearance settings (radius, padding, border width, opacity, position)
- Text effects (animation type, speed)
- Font sizes for title, text, and buttons

## Proposed ASML Structure

```xml
<settings>
  <!-- Debug settings (existing) -->
  <debug firstbeat="0" showvals="off" />
  
  <!-- Enhanced colors with all properties -->
  <colors 
    pcolor="#7D8DA3" 
    palpha="90"
    nonpcolor="#CCCCCC" 
    nonpalpha="90"
    bgColor="#1a1a1a"
    textBoxBg="#000000"
    textBoxBorder="#333333"
  />
  
  <!-- Enhanced fonts with sizes -->
  <fonts 
    titleFont="Gothic" 
    textFont="Handwriting2" 
    btnFont="Handwriting2"
    titleSize="48"
    textSize="18"
    buttonSize="16"
  />
  
  <!-- NEW: Text box appearance settings -->
  <textbox
    radius="20"
    padding="20"
    borderWidth="2"
    opacity="80"
    position="bottom"
    backgroundAsset="textbox_bg.png"  <!-- Optional: custom background asset -->
  />
  
  <!-- NEW: Text effects settings -->
  <textEffects
    animation="typewriter"
    typewriterSpeed="30"
    fadeInDuration="500"
  />
  
  <!-- NEW: Hotspot settings -->
  <hotspots
    visible="true"
    labels="true"
    highlightColor="#ffff00"
  />
  
  <!-- NEW: Asset references for fonts -->
  <fontAssets>
    <font name="CustomFont1" file="fonts/myfont.ttf" />
    <font name="CustomFont2" file="fonts/otherfont.woff" />
  </fontAssets>
</settings>
```

## Implementation Notes

1. **Backward Compatibility**: All new elements are optional. If not present, use defaults.

2. **Asset References**: 
   - Fonts can reference loaded font files via `<fontAssets>`
   - Text box can have optional `backgroundAsset` attribute for custom backgrounds

3. **Units**:
   - Colors: Hex strings (#RRGGBB)
   - Alpha: 0-100 (percentage)
   - Sizes: Pixels
   - Duration: Milliseconds
   - Speed: Characters per second

4. **Validation**: Parser should validate ranges (e.g., alpha 0-100, position enum)

This structure maintains clarity while being comprehensive and extensible for future additions.
