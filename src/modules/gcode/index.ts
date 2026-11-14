import type { DesignModule } from '../types.ts';
import {
  EMPTY_GCODE_PARAMS,
  generateGcodeImport,
  parseGcodeParams,
  type GcodeParams,
} from './model.ts';
import { GcodePanel, pickGcode } from './Panel.tsx';

export const gcodeModule: DesignModule<GcodeParams> = {
  id: 'gcode',
  name: 'G-code import',
  defaultOperationKind: 'follow',
  defaultParams: () => EMPTY_GCODE_PARAMS,
  createParams: () => pickGcode(),
  layerName: (params) => params.fileName.replace(/\.[^.]+$/, ''),
  parseParams: parseGcodeParams,
  generate: generateGcodeImport,
  Panel: GcodePanel,
};
