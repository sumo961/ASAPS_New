#!/bin/bash

echo "🚀 Setting up ASAPS Modern project..."

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p packages/core/{src/{beats,engine,xml,types},tests}
mkdir -p packages/builder/{src/{components,editors,hooks,styles},public}
mkdir -p packages/renderer/{src,tests}
mkdir -p beat-definitions
mkdir -p examples

# Create placeholder files for missing components
touch packages/core/src/beats/Beat.ts
touch packages/core/src/beats/BeatRegistry.ts
touch packages/core/src/beats/TitleScreenBeat.ts
touch packages/core/src/beats/IntroTextBeat.ts
touch packages/core/src/beats/DialogTreeBeat.ts

touch packages/core/src/engine/StoryEngine.ts
touch packages/core/src/engine/StoryContext.ts
touch packages/core/src/engine/Story.ts

touch packages/core/src/xml/ASMLParser.ts
touch packages/core/src/xml/ASMLGenerator.ts

touch packages/builder/src/components/Sidebar.tsx
touch packages/builder/src/components/Canvas.tsx
touch packages/builder/src/components/Inspector.tsx

# Install dependencies
echo "📦 Installing dependencies..."
npm install -g

# Build core package first
echo "🔨 Building core package..."
npm run build --workspace=@asaps/core

echo "✅ Setup complete! Run 'npm run dev' to start development."