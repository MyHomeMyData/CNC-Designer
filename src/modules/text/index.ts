import type { DesignModule } from '../types.ts';
import { DEFAULT_TEXT_PARAMS, generateText, parseTextParams, type TextParams } from './generate.ts';
import { TextPanel } from './Panel.tsx';

export const textModule: DesignModule<TextParams> = {
  id: 'text',
  name: 'Text',
  defaultOperationKind: 'follow',
  defaultParams: () => DEFAULT_TEXT_PARAMS,
  parseParams: parseTextParams,
  generate: generateText,
  Panel: TextPanel,
};
