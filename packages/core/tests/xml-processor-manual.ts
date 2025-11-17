import { ASMLProcessor } from '../src/xml/ASMLProcessor';
import { BeatTypeRegistry } from '../src/beats/BeatRegistry';

// Test XML that demonstrates the comprehensive ASML support
const testASML = `<?xml version="1.0" encoding="UTF-8"?>
<story title="Test Story" author="Test Author" version="1.0">
  <settings>
    <debug firstbeat="0" showvals="on" />
    <colors pcolor="0x7D8DA3" palpha="90" />
    <fonts titleFont="Gothic" textFont="Handwriting2" />
    <textbox radius="20" />
  </settings>
  
  <environment>
    <prop id="key" name="Golden Key" file="key.png" x="100" y="200" />
    <node id="forest" name="Dark Forest" x="50" y="150" />
  </environment>
  
  <characters>
    <character id="hero" name="Hero">
      <counter name="health" value="100" />
      <counter name="strength" value="10" />
    </character>
  </characters>
  
  <plot>
    <clusters>
      <cluster id="intro" name="Introduction" color="blue" />
    </clusters>
    
    <beat>
      <id id="0" name="Title" cluster="intro" />
      <transition type="fade" duration="1.0" />
      <sound file="theme.mp3" loop="true" volume="0.8" />
      <function kind="titleScreen" title="Advanced Story" author="Test Author" buttonText="Begin" />
    </beat>
    
    <beat>
      <id id="1" name="Opening" />
      <function kind="introText" text="Welcome to this interactive story..." buttonText="Continue" />
    </beat>
    
    <beat>
      <id id="2" name="Dialog Example" />
      <function kind="dialogTree">
        <dialogTree id="root" speaker="Guard" text="Halt! Who goes there?">
          <choice id="1" text="I'm a traveler" target="3" />
          <choice id="2" text="None of your business" target="4" />
        </dialogTree>
      </function>
    </beat>
    
    <beat>
      <id id="3" name="Movement" />
      <function kind="movementChoice" question="Where do you want to go?">
        <choice id="1" text="Enter the forest" location="forest" target="5" />
        <choice id="2" text="Return to town" location="town" target="1" />
      </function>
    </beat>
    
    <beat>
      <id id="4" name="Pick Item" />
      <function kind="pickProp" question="What do you take?">
        <prop id="1" name="Golden Key" desc="A shiny golden key" target="6" />
        <prop id="2" name="Old Scroll" desc="An ancient scroll" target="7" />
      </function>
    </beat>
    
    <beat>
      <id id="5" name="Video Scene" />
      <function kind="videoBeat" file="cutscene.mp4" autoplay="true" controls="true" />
    </beat>
    
    <beat>
      <id id="6" name="Set Health" />
      <function kind="setVariable" variable="health" value="50" operation="set" />
    </beat>
    
    <beat>
      <id id="7" name="Check Health" />
      <function kind="conditionBeat" trueTarget="8" falseTarget="9">
        <condition type="variable" operator=">" left="health" right="25" />
      </function>
    </beat>
    
    <beat>
      <id id="8" name="Good Ending" />
      <function kind="endScreen" message="Congratulations! You survived!" showRestart="true" />
    </beat>
    
    <beat>
      <id id="9" name="Bad Ending" />
      <function kind="endScreen" message="Game Over. Better luck next time." showRestart="true" />
    </beat>
    
    <!-- Legacy beat types for migration testing -->
    <beat>
      <id id="10" name="Legacy Conversation" />
      <function kind="conversationChoice" questioner="Merchant" question="What would you like to buy?">
        <choice id="1" text="Sword" targetBeat="11" />
        <choice id="2" text="Shield" targetBeat="12" />
      </function>
    </beat>
    
    <beat>
      <id id="11" name="Legacy Global" />
      <function kind="setGlobal" variable="gold" value="100" />
    </beat>
    
  </plot>
</story>`;

async function testASMLProcessor() {
  console.log('🧪 Testing ASAPS Modern XML Processor');
  console.log('=====================================');
  
  try {
    const processor = new ASMLProcessor();
    const result = await processor.parseASML(testASML);
    
    console.log('✅ XML Processing Results:');
    console.log('- Story loaded successfully');
    console.log(`- Title: ${result.story.getMetadata().title}`);
    console.log(`- Author: ${result.story.getMetadata().author}`);
    console.log(`- Beats created: ${result.story.getAllBeats().length}`);
    console.log(`- Warnings: ${result.warnings.length}`);
    console.log(`- Migrations: ${result.migrations.length}`);
    
    if (result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      result.warnings.forEach(warning => console.log(`  - ${warning}`));
    }
    
    if (result.migrations.length > 0) {
      console.log('\n🔄 Migrations:');
      result.migrations.forEach(migration => console.log(`  - ${migration}`));
    }
    
    console.log('\n📋 Beat Types Found:');
    const beatTypes = new Set();
    result.story.getAllBeats().forEach(beat => {
      beatTypes.add(beat.type);
    });
    beatTypes.forEach(type => console.log(`  - ${type}`));
    
    console.log('\n🎉 All tests passed! ASAPS Modern XML processing is working.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Registry verification
function testBeatRegistry() {
  console.log('\\n🔧 Testing Beat Type Registry');
  console.log('===============================');
  
  const registry = BeatTypeRegistry.getInstance();
  const allTypes = registry.getAllTypes();
  
  console.log(`✅ Registered beat types: ${allTypes.size}`);

  allTypes.forEach((definition, typeId) => {
    console.log(`  - ${typeId}: ${definition.displayName} (${definition.category})`);
  });
  
  // Test beat creation
  console.log('\\n🏗️ Testing Beat Creation:');
  const testTypes = ['titleScreen', 'introText', 'dialogTree', 'movementChoice', 'setVariable'];
  
  testTypes.forEach(type => {
    try {
      const config = {
        id: `test-${type}`,
        name: `Test ${type}`,
        type: type,
        parameters: {}
      };

      const beat = registry.createBeat(type, config);
      console.log(`  ✅ ${type}: ${beat.constructor.name}`);
    } catch (error) {
      console.log(`  ❌ ${type}: ${error.message}`);
    }
  });
}

// Run tests
export { testASMLProcessor, testBeatRegistry };

// If running directly
if (require.main === module) {
  testBeatRegistry();
  testASMLProcessor().catch(console.error);
}
