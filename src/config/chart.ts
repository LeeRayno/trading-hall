/**
 * Chart presentation constants.
 *
 * The chart renders to a canvas, which cannot resolve CSS custom properties,
 * so the palette is repeated here as literal values. These mirror the tokens
 * in `globals.css`; changing a token there means changing its counterpart
 * here.
 */

export const CHART_COLORS = {
  background: '#0b0e11',
  text: '#a7b1bc',
  border: '#1e252e',
  grid: '#161b22',
  crosshair: '#6b7683',
  up: '#0ecb81',
  down: '#f6465d',
} as const;

/**
 * Volume bars are tinted with their candle's direction rather than drawn
 * solid, so they read as an underlay to the price rather than a second
 * signal competing with it.
 */
export const CHART_VOLUME_COLORS = {
  up: 'rgba(14, 203, 129, 0.45)',
  down: 'rgba(246, 70, 93, 0.45)',
} as const;

export const CHART_LAYOUT = {
  /** Height in pixels of the volume pane below the price pane. */
  volumePaneHeight: 72,
  /** Milliseconds of resize settling before a relayout is applied. */
  resizeDebounceMs: 80,
} as const;
