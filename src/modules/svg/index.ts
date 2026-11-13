import type { DesignModule } from '../types.ts';
import { EMPTY_SVG_PARAMS, generateSvg, parseSvgParams, type SvgParams } from './generate.ts';
import { pickSvg, SvgPanel } from './Panel.tsx';

export const svgModule: DesignModule<SvgParams> = {
  id: 'svg',
  name: 'SVG import',
  defaultOperationKind: 'follow',
  defaultParams: () => EMPTY_SVG_PARAMS,
  createParams: () => pickSvg(),
  layerName: (params) => params.fileName.replace(/\.svg$/i, ''),
  parseParams: parseSvgParams,
  generate: generateSvg,
  Panel: SvgPanel,
};
