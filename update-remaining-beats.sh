#!/bin/bash

echo "Updating all remaining beat files..."

cd packages/core/src/beats

# Update all remaining files
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" EndScreenBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" HyperTextBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" InputTextBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" IntroTextBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" MovementChoiceBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" PickPropBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer} from '..\/types';/g" RandomTargetBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" SetTimerBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" SetVariableBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" SWFBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" TitleScreenBeat.ts
sed -i '' "s/import type { IRenderer } from '@asaps\/renderer';/import type { IRenderer } from '..\/types';/g" VideoBeat.ts

cd ../../../..

echo "✅ All beat files updated!"
echo ""
echo "Files updated:"
echo "  - EndScreenBeat.ts"
echo "  - HyperTextBeat.ts"
echo "  - InputTextBeat.ts"
echo "  - IntroTextBeat.ts"
echo "  - MovementChoiceBeat.ts"
echo "  - PickPropBeat.ts"
echo "  - RandomTargetBeat.ts"
echo "  - SetTimerBeat.ts"
echo "  - SetVariableBeat.ts"
echo "  - SWFBeat.ts"
echo "  - TitleScreenBeat.ts"
echo "  - VideoBeat.ts"
echo ""
echo "Circular dependency fixed! Run rebuild-and-check.sh to compile."
