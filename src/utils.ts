import { PythonRandom, type ReducedTrialRow } from "psyflow-web";

export type MagnitudeLabel = "small" | "medium" | "large";
export type SideLabel = "left" | "right";

export interface McqItem {
  item_id: number;
  magnitude: MagnitudeLabel;
  ss_amount: number;
  ll_amount: number;
  delay_days: number;
  k_ref: number;
}

export interface PlannedTrial extends McqItem {
  block_trial_index: number;
  ll_side: SideLabel;
  ss_side: SideLabel;
  left_amount: number;
  right_amount: number;
  left_delay_days: number;
  right_delay_days: number;
  condition_id: string;
  block_idx?: number;
}

export interface ConditionGenerationConfig {
  item_pool?: Array<Record<string, unknown>>;
  randomize_order?: boolean;
  counterbalance_sides?: boolean;
  ll_left_prob?: number;
  enable_logging?: boolean;
}

const MCQ27_ITEMS: McqItem[] = [
  { item_id: 1, magnitude: "small", ss_amount: 25, ll_amount: 30, delay_days: 14, k_ref: 0.014286 },
  { item_id: 2, magnitude: "small", ss_amount: 35, ll_amount: 35, delay_days: 186, k_ref: 0.016129 },
  { item_id: 3, magnitude: "small", ss_amount: 40, ll_amount: 55, delay_days: 62, k_ref: 0.006048 },
  { item_id: 4, magnitude: "small", ss_amount: 30, ll_amount: 35, delay_days: 41, k_ref: 0.004065 },
  { item_id: 5, magnitude: "small", ss_amount: 15, ll_amount: 35, delay_days: 13, k_ref: 0.102564 },
  { item_id: 6, magnitude: "small", ss_amount: 25, ll_amount: 60, delay_days: 14, k_ref: 0.1 },
  { item_id: 7, magnitude: "small", ss_amount: 40, ll_amount: 45, delay_days: 62, k_ref: 0.002016 },
  { item_id: 8, magnitude: "small", ss_amount: 25, ll_amount: 55, delay_days: 31, k_ref: 0.03871 },
  { item_id: 9, magnitude: "small", ss_amount: 55, ll_amount: 75, delay_days: 61, k_ref: 0.005962 },
  { item_id: 10, magnitude: "medium", ss_amount: 30, ll_amount: 35, delay_days: 186, k_ref: 0.000896 },
  { item_id: 11, magnitude: "medium", ss_amount: 80, ll_amount: 85, delay_days: 157, k_ref: 0.000398 },
  { item_id: 12, magnitude: "medium", ss_amount: 65, ll_amount: 75, delay_days: 119, k_ref: 0.001293 },
  { item_id: 13, magnitude: "medium", ss_amount: 55, ll_amount: 60, delay_days: 117, k_ref: 0.000777 },
  { item_id: 14, magnitude: "medium", ss_amount: 40, ll_amount: 55, delay_days: 62, k_ref: 0.006048 },
  { item_id: 15, magnitude: "medium", ss_amount: 65, ll_amount: 85, delay_days: 35, k_ref: 0.008791 },
  { item_id: 16, magnitude: "medium", ss_amount: 70, ll_amount: 80, delay_days: 162, k_ref: 0.000882 },
  { item_id: 17, magnitude: "medium", ss_amount: 80, ll_amount: 95, delay_days: 157, k_ref: 0.001195 },
  { item_id: 18, magnitude: "medium", ss_amount: 50, ll_amount: 60, delay_days: 89, k_ref: 0.002247 },
  { item_id: 19, magnitude: "large", ss_amount: 35, ll_amount: 85, delay_days: 7, k_ref: 0.204082 },
  { item_id: 20, magnitude: "large", ss_amount: 80, ll_amount: 100, delay_days: 30, k_ref: 0.008333 },
  { item_id: 21, magnitude: "large", ss_amount: 65, ll_amount: 85, delay_days: 30, k_ref: 0.010256 },
  { item_id: 22, magnitude: "large", ss_amount: 50, ll_amount: 75, delay_days: 14, k_ref: 0.035714 },
  { item_id: 23, magnitude: "large", ss_amount: 65, ll_amount: 75, delay_days: 61, k_ref: 0.00252 },
  { item_id: 24, magnitude: "large", ss_amount: 90, ll_amount: 100, delay_days: 30, k_ref: 0.003704 },
  { item_id: 25, magnitude: "large", ss_amount: 45, ll_amount: 60, delay_days: 14, k_ref: 0.02381 },
  { item_id: 26, magnitude: "large", ss_amount: 35, ll_amount: 45, delay_days: 20, k_ref: 0.014286 },
  { item_id: 27, magnitude: "large", ss_amount: 60, ll_amount: 80, delay_days: 30, k_ref: 0.011111 }
];

const VALID_MAGNITUDES = new Set<MagnitudeLabel>(["small", "medium", "large"]);

function clampProbability(value: unknown): number {
  return Math.max(0, Math.min(1, Number(value ?? 0.5)));
}

export function normalize_magnitude(value: string): MagnitudeLabel {
  const magnitude = String(value).trim().toLowerCase();
  if (!VALID_MAGNITUDES.has(magnitude as MagnitudeLabel)) {
    throw new Error(`Unsupported delay-discounting magnitude: ${value}`);
  }
  return magnitude as MagnitudeLabel;
}

function normalize_item_pool(itemPool?: Array<Record<string, unknown>>): McqItem[] {
  const pool = Array.isArray(itemPool) && itemPool.length > 0 ? itemPool : MCQ27_ITEMS;
  return pool.map((entry) => ({
    item_id: Number(entry.item_id),
    magnitude: normalize_magnitude(String(entry.magnitude)),
    ss_amount: Number(entry.ss_amount),
    ll_amount: Number(entry.ll_amount),
    delay_days: Number(entry.delay_days),
    k_ref: Number(entry.k_ref)
  }));
}

function filter_item_pool_by_conditions(
  itemPool: McqItem[],
  conditionLabels?: string[]
): McqItem[] {
  if (!Array.isArray(conditionLabels) || conditionLabels.length === 0) {
    return itemPool.map((item) => ({ ...item }));
  }
  const allowed = new Set(conditionLabels.map((label) => normalize_magnitude(label)));
  const filtered = itemPool.filter((item) => allowed.has(item.magnitude)).map((item) => ({ ...item }));
  if (filtered.length === 0) {
    throw new Error(`No MCQ items remain after filtering by ${JSON.stringify(conditionLabels)}.`);
  }
  return filtered;
}

export function build_block_plan(
  n_trials: number,
  options: {
    seed: number | null;
    condition_labels?: string[];
    config?: ConditionGenerationConfig;
  }
): PlannedTrial[] {
  const nTrials = Math.max(0, Math.trunc(n_trials));
  if (nTrials <= 0) {
    return [];
  }
  const config = options.config ?? {};
  const rng = new PythonRandom(Number(options.seed ?? 2025));
  const basePool = filter_item_pool_by_conditions(
    normalize_item_pool(config.item_pool),
    options.condition_labels
  );
  const randomizeOrder = config.randomize_order !== false;
  const counterbalanceSides = config.counterbalance_sides !== false;
  const llLeftProb = clampProbability(config.ll_left_prob ?? 0.5);

  const planned: PlannedTrial[] = [];
  while (planned.length < nTrials) {
    const chunk = basePool.map((item) => ({ ...item }));
    if (randomizeOrder) {
      rng.shuffle(chunk);
    }
    planned.push(...chunk.map((trial) => ({ ...trial } as PlannedTrial)));
  }
  planned.length = nTrials;

  const llSides: SideLabel[] = [];
  if (counterbalanceSides) {
    const leftCount = Math.floor(nTrials / 2);
    llSides.push(...new Array(leftCount).fill("left"), ...new Array(nTrials - leftCount).fill("right"));
    rng.shuffle(llSides);
  } else {
    for (let index = 0; index < nTrials; index += 1) {
      llSides.push(rng.random() < llLeftProb ? "left" : "right");
    }
  }

  return planned.map((trial, idx) => {
    const llSide = llSides[idx];
    const ssSide: SideLabel = llSide === "left" ? "right" : "left";
    const leftIsLl = llSide === "left";
    const leftAmount = leftIsLl ? trial.ll_amount : trial.ss_amount;
    const rightAmount = leftIsLl ? trial.ss_amount : trial.ll_amount;
    const leftDelay = leftIsLl ? trial.delay_days : 0;
    const rightDelay = leftIsLl ? 0 : trial.delay_days;
    return {
      ...trial,
      block_trial_index: idx + 1,
      ll_side: llSide,
      ss_side: ssSide,
      left_amount: leftAmount,
      right_amount: rightAmount,
      left_delay_days: leftDelay,
      right_delay_days: rightDelay,
      condition_id: `${trial.magnitude}|item${trial.item_id}|ll_${llSide}`
    };
  });
}

export function build_block_conditions(
  n_trials: number,
  condition_labels: string[],
  config: ConditionGenerationConfig | undefined,
  seed: number
): string[] {
  const plan = build_block_plan(n_trials, {
    seed,
    condition_labels,
    config
  });
  return plan.map((trial) => trial.magnitude);
}

export function get_block_trial_spec(options: {
  block_idx: number;
  block_trial_index: number;
  n_trials: number;
  seed: number | null;
  condition_labels?: string[];
  expected_condition?: string;
  config?: ConditionGenerationConfig;
}): PlannedTrial {
  const plan = build_block_plan(options.n_trials, {
    seed: options.seed,
    condition_labels: options.condition_labels,
    config: options.config
  });
  const index = Math.trunc(options.block_trial_index);
  if (index < 1 || index > plan.length) {
    throw new Error(`Block trial index out of range: ${index}/${plan.length}`);
  }
  const spec: PlannedTrial = {
    ...plan[index - 1],
    block_idx: Math.trunc(options.block_idx)
  };
  if (options.expected_condition != null) {
    const expected = normalize_magnitude(options.expected_condition);
    if (spec.magnitude !== expected) {
      throw new Error(
        `Condition mismatch: expected=${expected}, actual=${spec.magnitude}, trial=${spec.block_trial_index}`
      );
    }
  }
  return spec;
}

export function summarizeBlock(rows: ReducedTrialRow[], blockId: string): {
  response_rate: number;
  ll_rate: number;
  mean_rt: string;
} {
  const blockRows = rows.filter((row) => row.block_id === blockId);
  if (blockRows.length === 0) {
    return {
      response_rate: 0,
      ll_rate: 0,
      mean_rt: "NA"
    };
  }
  const responded = blockRows.filter((row) => row.intertemporal_choice_choice_made === true);
  const responseRate = responded.length / blockRows.length;
  const llRate =
    responded.length === 0
      ? 0
      : responded.filter((row) => row.intertemporal_choice_chose_ll === true).length / responded.length;
  const rtValues = responded
    .map((row) => Number(row.intertemporal_choice_choice_rt))
    .filter((value) => Number.isFinite(value));
  const meanRt = rtValues.length === 0 ? "NA" : `${(rtValues.reduce((sum, x) => sum + x, 0) / rtValues.length).toFixed(3)} s`;
  return {
    response_rate: responseRate,
    ll_rate: llRate,
    mean_rt: meanRt
  };
}

export function summarizeOverall(rows: ReducedTrialRow[]): {
  total_trials: number;
  valid_trials: number;
  ll_rate: number;
} {
  const totalTrials = rows.length;
  const validRows = rows.filter((row) => row.intertemporal_choice_choice_made === true);
  const llRate =
    validRows.length === 0
      ? 0
      : validRows.filter((row) => row.intertemporal_choice_chose_ll === true).length / validRows.length;
  return {
    total_trials: totalTrials,
    valid_trials: validRows.length,
    ll_rate: llRate
  };
}
