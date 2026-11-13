import type { DesignModule } from '../types.ts';
import {
  dragShapeHandle,
  generateShapes,
  parseShapesParams,
  SHAPE_DEFAULTS,
  shapeHandles,
  type ShapesParams,
} from './generate.ts';
import { ShapesPanel } from './Panel.tsx';

export const shapesModule: DesignModule<ShapesParams> = {
  id: 'shapes',
  name: 'Basic shape',
  defaultOperationKind: 'follow',
  defaultParams: () => SHAPE_DEFAULTS.rectangle,
  parseParams: parseShapesParams,
  generate: generateShapes,
  handles: shapeHandles,
  dragHandle: dragShapeHandle,
  Panel: ShapesPanel,
};
