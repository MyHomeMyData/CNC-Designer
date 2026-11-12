import type { DesignModule } from '../types.ts';
import {
  generateShapes,
  parseShapesParams,
  SHAPE_DEFAULTS,
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
  Panel: ShapesPanel,
};
