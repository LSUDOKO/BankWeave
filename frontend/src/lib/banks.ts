const PALETTE = ["var(--bank-0)", "var(--bank-1)", "var(--bank-2)", "var(--bank-3)", "var(--bank-4)", "var(--bank-5)"];
const HEX = ["#0e8c95", "#7a5ad8", "#c2418f", "#a8792a", "#3d55c4", "#5f6f84"];
let order: string[] = [];

export function setBankOrder(banks: string[]) { order = [...banks].sort(); }
export function bankIndex(b?: string | null) {
  if (!b) return -1;
  const i = order.indexOf(b);
  return i >= 0 ? i : order.length;
}
export const bankColor = (b?: string | null) => PALETTE[bankIndex(b) % PALETTE.length] ?? "var(--muted)";
export const bankHex = (b?: string | null) => (bankIndex(b) < 0 ? "#6b7a90" : HEX[bankIndex(b) % HEX.length]);
