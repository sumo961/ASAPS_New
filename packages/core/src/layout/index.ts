/**
 * Layout algorithms for story flowcharts and visual elements
 */

export {
  calculateTreeLayout,
  type LayoutNode,
  type LayoutEdge,
  type LayoutOptions,
  type LayoutResult,
} from './TreeLayoutAlgorithm';

export {
  computeAutoLayout,
  applyLayoutWithOverrides,
  calculateOverrides,
  type AutoLayoutTheme,
  type LayoutElement,
  type LayoutElementKind,
  type LayoutResult as ElementLayoutResult,
  type AutoLayoutOutput,
} from './autoLayout';

export {
  measureTextWidth,
  calculateTextDimensions,
  calculateTextBoxDimensions,
  calculateButtonDimensions,
  calculateDialogDimensions,
  calculateSmartButtonDimensions,
  calculateSmartTextBoxDimensions,
  calculateTextBoxDimensionsForLayout,
  getFontFamily,
  isBuiltInFont,
  type ElementDimensions,
  type TextBoxDimensions,
  type SizingOptions,
  type ConstrainedSizingOptions,
  type SmartTextBoxOptions,
  type SmartButtonOptions,
} from './elementSizing';

export {
  computeDialogTreeLayout,
  DEFAULT_DIALOG_TREE_THEME,
  type DialogTreePhase,
  type DialogTreeLayoutTheme,
  type DialogTreeLayoutInput,
  type DialogTreeLayoutElement,
  type DialogTreeLayoutOutput,
} from './dialogTreeLayout';
