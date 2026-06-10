export interface VatPreset {
  default: number;
  options: number[];
}

export const VAT_PRESETS: Record<string, VatPreset> = {
  AT: { default: 20, options: [20, 13, 10, 0] },
  DE: { default: 19, options: [19, 7, 0] },
  CH: { default: 8.1, options: [8.1, 3.8, 2.6, 0] },
};

export function vatPresetFor(country: string): VatPreset {
  return VAT_PRESETS[country] ?? { default: 0, options: [0] };
}
