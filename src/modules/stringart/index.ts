import type { DesignModule } from '../types.ts';
import { generateStringArt, previewStringArt } from './compute.ts';
import { parseStringArtParams, type StringArtParams } from './model.ts';
import { StringArtPanel } from './Panel.tsx';
import { DEFAULT_STRING_ART } from './templates.ts';

export const stringArtModule: DesignModule<StringArtParams> = {
  id: 'stringart',
  name: 'String art',
  defaultOperationKind: 'drill',
  defaultParams: DEFAULT_STRING_ART,
  parseParams: parseStringArtParams,
  generate: generateStringArt,
  preview: previewStringArt,
  Panel: StringArtPanel,
};
