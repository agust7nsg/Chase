import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type KeyDownEvent } from 'react-native';
import type { HistoryPoint, HistoryRange } from '@/services/priceHistory';
import { colors } from '@/theme/tokens';
import { Icon, Label, uiStyles } from './ui';


export function historyDate(date: string, full = false) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(full ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
export function RangeSelector({ value, onChange, label = 'Price history range' }: { value: HistoryRange; onChange: (range: HistoryRange) => void; label?: string }) {
  return <View style={styles.ranges} accessibilityRole="radiogroup" accessibilityLabel={label}>
    {(['7D', '1M', '3M', '1Y'] as const).map(range => <Pressable key={range} accessibilityRole="radio" accessibilityLabel={`${range} history`} accessibilityState={{ checked: value === range }} aria-checked={value === range} onPress={() => onChange(range)} style={({ pressed }) => [styles.range, value === range && styles.activeRange, pressed && { opacity: 0.65 }]}><Label kind="caption" style={{ color: value === range ? colors.primary : colors.muted, fontWeight: '700' }}>{range}</Label></Pressable>)}
  </View>;
}

/** Native line segments: no remote chart images, browser-only canvas or chart dependency. */
type PriceChartProps = {
  points: HistoryPoint[]; height?: number; compact?: boolean; label: string; color?: string; onSelect?: (point: HistoryPoint, index: number) => void;
};
export function PriceChart(props: PriceChartProps) {
  const signature = `${props.points[0]?.date}-${props.points.at(-1)?.date}-${props.points.at(-1)?.value}`;
  return <PriceChartPlot key={signature} {...props} />;
}
function PriceChartPlot({ points, height = 168, compact = false, label, color = colors.primary, onSelect }: PriceChartProps) {
  const { currency, formatMoney: money } = useCurrency();
  const [width, setWidth] = useState(300);
  const [selected, setSelected] = useState<number | null>(null);
  const padding = 10;
  const layout = useMemo(() => {
    const values = points.map(p => p.value);
    const low = Math.min(...values, 0 === Math.max(...values) ? 0 : Infinity);
    const high = Math.max(...values, 0);
    const spread = high - low || Math.max(high * 0.08, 1);
    const min = low - spread * 0.13;
    const max = high + spread * 0.13;
    const coordinates = points.map((point, index) => ({ x: padding + (width - padding * 2) * index / Math.max(1, points.length - 1), y: height - padding - (point.value - min) / (max - min) * (height - padding * 2) }));
    return { coordinates, drawn: coordinates, low, high };
  }, [points, width, height]);
  const select = (index: number) => {
    const safeIndex = Math.max(0, Math.min(points.length - 1, index));
    if (!points[safeIndex]) return;
    setSelected(safeIndex); onSelect?.(points[safeIndex], safeIndex);
  };
  const selectedPoint = selected === null ? null : points[selected];
  const coordinate = selected === null ? null : layout.coordinates[selected];
  if (!points.length) return <View testID="pending-history-chart" accessible accessibilityRole="image" accessibilityLabel={`${label}. Historical data pending.`} style={{ height, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
    {[0.2, 0.5, 0.8].map(position => <View key={position} accessible={false} style={[styles.gridLine, { top: height * position }]} />)}
    <Label kind="caption" style={[uiStyles.muted, { backgroundColor: colors.background, paddingHorizontal: 12 }]}>History pending</Label>
  </View>;
  const cursorIndex = selected ?? points.length - 1;
  const valueText = `${historyDate((selectedPoint ?? points.at(-1)!).date, true)}, ${money((selectedPoint ?? points.at(-1)!).value)} ${currency}`;
  const keyboardProps = Platform.OS === 'web' ? { onKeyDown: (event: KeyDownEvent) => {
    const key = 'key' in event && typeof event.key === 'string' ? event.key : event.nativeEvent.key;
    if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      select(key === 'Home' ? 0 : key === 'End' ? points.length - 1 : cursorIndex + (key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 1));
    }
  } } : {};
  return <View style={{ gap: 8 }}>
    {selectedPoint ? <View style={uiStyles.between} accessibilityLiveRegion="polite"><Label kind="caption" style={uiStyles.muted}>{historyDate(selectedPoint.date, true)}</Label><Label style={{ fontWeight: '700' }}>{money(selectedPoint.value)}</Label></View> : null}
    <Pressable {...keyboardProps} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityHint={compact ? 'Tap the chart to inspect a date.' : 'Tap the chart to inspect a date. Use the previous and next date buttons for exact values.'} accessibilityValue={{ min: 0, max: points.length - 1, now: cursorIndex, text: valueText }} aria-valuemin={0} aria-valuemax={points.length - 1} aria-valuenow={cursorIndex} aria-valuetext={valueText} accessibilityActions={[{ name: 'increment', label: 'Next date' }, { name: 'decrement', label: 'Previous date' }]} onAccessibilityAction={event => select(cursorIndex + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}
      onPress={event => {
        let x = event.nativeEvent.locationX;
        if (Platform.OS === 'web') {
          const webEvent = event as unknown as { nativeEvent: { clientX?: number; pageX?: number }; currentTarget: { getBoundingClientRect: () => { left: number } } };
          const clientX = webEvent.nativeEvent.clientX ?? webEvent.nativeEvent.pageX;
          if (typeof clientX === 'number') x = clientX - webEvent.currentTarget.getBoundingClientRect().left;
        }
        if (Number.isFinite(x)) select(Math.round((x - padding) / Math.max(1, width - padding * 2) * (points.length - 1)));
      }} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height, width: '100%' }}>
      {[0.2, 0.5, 0.8].map(position => <View key={position} style={[styles.gridLine, { top: height * position }]} />)}
      {layout.drawn.slice(1).map((point, i) => {
        const previous = layout.drawn[i];
        const dx = point.x - previous.x, dy = point.y - previous.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        return <View key={i} pointerEvents="none" style={{ position: 'absolute', left: (point.x + previous.x) / 2 - length / 2, top: (point.y + previous.y) / 2 - 1.25, width: length + 0.7, height: 2.5, borderRadius: 2, backgroundColor: color, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
      })}
      {coordinate ? <><View pointerEvents="none" style={[styles.cursor, { left: coordinate.x }]} /><View pointerEvents="none" style={[styles.dot, { left: coordinate.x - 5, top: coordinate.y - 5, backgroundColor: color }]} /></> : <View pointerEvents="none" style={[styles.dot, { left: layout.coordinates.at(-1)!.x - 4, top: layout.coordinates.at(-1)!.y - 4, width: 8, height: 8, backgroundColor: color }]} />}
    </Pressable>
    <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>{historyDate(points[0].date, points[0].date.slice(0, 4) !== points.at(-1)!.date.slice(0, 4))}</Label><Label kind="caption" style={uiStyles.muted}>{historyDate(points.at(-1)!.date, points[0].date.slice(0, 4) !== points.at(-1)!.date.slice(0, 4))}</Label></View>
    {!compact ? <View style={styles.inspector}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous history date" disabled={cursorIndex === 0} accessibilityState={{ disabled: cursorIndex === 0 }} onPress={() => select(cursorIndex - 1)} style={[styles.inspectButton, cursorIndex === 0 && { opacity: 0.3 }]}><Icon name="chevron-back" size={18} color={colors.muted} /></Pressable>
      <Label kind="caption" style={[uiStyles.muted, { textAlign: 'center', flex: 1 }]}>{historyDate((selectedPoint ?? points.at(-1)!).date, true)}</Label>
      <Pressable accessibilityRole="button" accessibilityLabel="Next history date" disabled={cursorIndex === points.length - 1} accessibilityState={{ disabled: cursorIndex === points.length - 1 }} onPress={() => select(cursorIndex + 1)} style={[styles.inspectButton, cursorIndex === points.length - 1 && { opacity: 0.3 }]}><Icon name="chevron-forward" size={18} color={colors.muted} /></Pressable>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  ranges: { flexDirection: 'row', gap: 8 },
  range: { flex: 1, minHeight: 48, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  activeRange: { backgroundColor: colors.primarySoft },
  gridLine: { position: 'absolute', height: 1, left: 0, right: 0, backgroundColor: colors.chartGrid },
  cursor: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.muted, opacity: 0.4 },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.white },
  inspector: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inspectButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
