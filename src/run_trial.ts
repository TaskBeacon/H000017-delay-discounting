import {
  set_trial_context,
  type StimBank,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import {
  get_block_trial_spec,
  normalize_magnitude,
  type ConditionGenerationConfig,
  type SideLabel
} from "./utils";

function delayLabel(days: number): string {
  return Number(days) <= 0 ? "今天到账" : `${Math.trunc(days)}天后到账`;
}

function resolveChoiceSide(response: unknown, leftKey: string, rightKey: string): SideLabel | null {
  if (response === leftKey) {
    return "left";
  }
  if (response === rightKey) {
    return "right";
  }
  return null;
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    condition_generation_config: ConditionGenerationConfig;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, condition_generation_config, block_id, block_idx } = context;
  const keys = ((settings.key_list as string[] | undefined) ?? ["f", "j"]).map(String);
  if (keys.length < 2) {
    throw new Error("Delay Discounting requires at least two response keys in task.key_list.");
  }
  const leftKey = keys[0];
  const rightKey = keys[1];
  const trialsPerBlock = Math.max(
    1,
    Number(settings.trials_per_block ?? settings.trial_per_block ?? 1)
  );
  const trialNumericId = Number(trial.trial_id);
  const blockTrialIndex = Number.isFinite(trialNumericId)
    ? ((Math.trunc(trialNumericId) - 1) % trialsPerBlock) + 1
    : trial.trial_index + 1;
  const blockSeeds = Array.isArray(settings.block_seed) ? settings.block_seed : [];
  const planSeed = Number(blockSeeds[block_idx] ?? settings.overall_seed ?? 2025);
  const magnitudeCondition = normalize_magnitude(String(condition));
  const conditionLabels =
    Array.isArray(settings.conditions) && settings.conditions.length > 0
      ? settings.conditions.map(String)
      : ["small", "medium", "large"];
  const spec = get_block_trial_spec({
    block_idx,
    block_trial_index: blockTrialIndex,
    n_trials: trialsPerBlock,
    seed: planSeed,
    condition_labels: conditionLabels,
    expected_condition: magnitudeCondition,
    config: condition_generation_config
  });

  const llKey = spec.ll_side === "left" ? leftKey : rightKey;
  const ssKey = spec.ll_side === "left" ? rightKey : leftKey;
  const leftText = `${spec.left_amount.toFixed(0)}元，${delayLabel(spec.left_delay_days)}`;
  const rightText = `${spec.right_amount.toFixed(0)}元，${delayLabel(spec.right_delay_days)}`;
  const triggerMap = (settings.triggers ?? {}) as Record<string, unknown>;

  const cueDuration = Number(settings.cue_duration ?? 0.6);
  const anticipationDuration = Number(settings.anticipation_duration ?? 0.2);
  const decisionDuration = Number(settings.decision_duration ?? 6);
  const confirmDuration = Number(settings.choice_confirm_duration ?? 0.3);
  const feedbackDuration = Number(settings.feedback_duration ?? 0.5);
  const itiDuration = Number(settings.iti_duration ?? 0.5);

  const preChoiceFixation = trial.unit("pre_choice_fixation").addStim(stimBank.get("fixation"));
  set_trial_context(preChoiceFixation, {
    trial_id: trial.trial_id,
    phase: "pre_choice_fixation",
    deadline_s: cueDuration,
    valid_keys: [],
    block_id,
    condition_id: spec.condition_id,
    task_factors: {
      magnitude: spec.magnitude,
      offer_id: spec.item_id,
      block_trial_index: spec.block_trial_index,
      block_idx,
      stage: "pre_choice_fixation"
    },
    stim_id: "fixation"
  });
  preChoiceFixation.show({ duration: cueDuration }).to_dict();

  const offerOnsetJitter = trial.unit("offer_onset_jitter").addStim(stimBank.get("fixation"));
  set_trial_context(offerOnsetJitter, {
    trial_id: trial.trial_id,
    phase: "offer_onset_jitter",
    deadline_s: anticipationDuration,
    valid_keys: [],
    block_id,
    condition_id: spec.condition_id,
    task_factors: {
      magnitude: spec.magnitude,
      offer_id: spec.item_id,
      block_trial_index: spec.block_trial_index,
      block_idx,
      stage: "offer_onset_jitter"
    },
    stim_id: "fixation"
  });
  offerOnsetJitter.show({ duration: anticipationDuration }).to_dict();

  const intertemporalChoice = trial
    .unit("intertemporal_choice")
    .addStim(stimBank.rebuild("option_left", { text: leftText }))
    .addStim(stimBank.rebuild("option_right", { text: rightText }))
    .addStim(stimBank.get("choice_prompt"));
  set_trial_context(intertemporalChoice, {
    trial_id: trial.trial_id,
    phase: "intertemporal_choice",
    deadline_s: decisionDuration,
    valid_keys: [leftKey, rightKey],
    block_id,
    condition_id: spec.condition_id,
    task_factors: {
      magnitude: spec.magnitude,
      offer_id: spec.item_id,
      ss_amount: spec.ss_amount,
      ll_amount: spec.ll_amount,
      delay_days: spec.delay_days,
      k_ref: spec.k_ref,
      ll_side: spec.ll_side,
      ss_side: spec.ss_side,
      ss_key: ssKey,
      ll_key: llKey,
      left_key: leftKey,
      right_key: rightKey,
      block_trial_index: spec.block_trial_index,
      block_idx,
      stage: "intertemporal_choice"
    },
    stim_id: `mcq27_item_${spec.item_id}`
  });
  intertemporalChoice
    .captureResponse({
      keys: [leftKey, rightKey],
      correct_keys: [leftKey, rightKey],
      duration: decisionDuration,
      response_trigger: {
        [leftKey]: Number(triggerMap.choice_response_left ?? 31),
        [rightKey]: Number(triggerMap.choice_response_right ?? 32)
      },
      timeout_trigger: Number(triggerMap.choice_no_response ?? 39),
      terminate_on_response: true
    })
    .set_state({
      choice_made: (snapshot: TrialSnapshot) =>
        resolveChoiceSide(snapshot.units.intertemporal_choice?.response, leftKey, rightKey) !== null,
      choice_key: intertemporalChoice.ref<string | null>("response"),
      choice_rt: intertemporalChoice.ref<number | null>("rt"),
      chosen_side: (snapshot: TrialSnapshot) =>
        resolveChoiceSide(snapshot.units.intertemporal_choice?.response, leftKey, rightKey),
      chosen_option: (snapshot: TrialSnapshot) => {
        const side = resolveChoiceSide(snapshot.units.intertemporal_choice?.response, leftKey, rightKey);
        if (side == null) {
          return null;
        }
        return side === spec.ll_side ? "ll" : "ss";
      },
      chose_ll: (snapshot: TrialSnapshot) => {
        const side = resolveChoiceSide(snapshot.units.intertemporal_choice?.response, leftKey, rightKey);
        return side != null && side === spec.ll_side;
      },
      chosen_amount: (snapshot: TrialSnapshot) => {
        const side = resolveChoiceSide(snapshot.units.intertemporal_choice?.response, leftKey, rightKey);
        if (side == null) {
          return null;
        }
        return side === spec.ll_side ? spec.ll_amount : spec.ss_amount;
      },
      chosen_delay_days: (snapshot: TrialSnapshot) => {
        const side = resolveChoiceSide(snapshot.units.intertemporal_choice?.response, leftKey, rightKey);
        if (side == null) {
          return null;
        }
        return side === spec.ll_side ? spec.delay_days : 0;
      },
      ss_key: ssKey,
      ll_key: llKey
    })
    .to_dict();

  const choiceConfirmation = trial
    .unit("choice_confirmation")
    .when(
      (snapshot: TrialSnapshot) =>
        resolveChoiceSide(snapshot.units.intertemporal_choice?.response, leftKey, rightKey) !== null
    )
    .addStim(stimBank.rebuild("option_left", { text: leftText }))
    .addStim(stimBank.rebuild("option_right", { text: rightText }))
    .addStim((snapshot: TrialSnapshot) =>
      stimBank.get(
        resolveChoiceSide(snapshot.units.intertemporal_choice?.response, leftKey, rightKey) === "left"
          ? "highlight_left"
          : "highlight_right"
      )
    );
  set_trial_context(choiceConfirmation, {
    trial_id: trial.trial_id,
    phase: "choice_confirmation",
    deadline_s: confirmDuration,
    valid_keys: [],
    block_id,
    condition_id: spec.condition_id,
    task_factors: {
      magnitude: spec.magnitude,
      block_trial_index: spec.block_trial_index,
      block_idx,
      stage: "choice_confirmation"
    },
    stim_id: "choice_highlight"
  });
  choiceConfirmation.show({ duration: confirmDuration }).to_dict();

  const outcomeFeedback = trial
    .unit("outcome_feedback")
    .addStim((snapshot: TrialSnapshot) =>
      stimBank.get(
        Boolean(snapshot.units.intertemporal_choice?.choice_made) ? "feedback_choice" : "feedback_timeout"
      )
    );
  set_trial_context(outcomeFeedback, {
    trial_id: trial.trial_id,
    phase: "outcome_feedback",
    deadline_s: feedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: spec.condition_id,
    task_factors: {
      magnitude: spec.magnitude,
      block_trial_index: spec.block_trial_index,
      block_idx,
      stage: "outcome_feedback"
    },
    stim_id: "feedback"
  });
  outcomeFeedback
    .show({ duration: feedbackDuration })
    .set_state({
      choice_made: intertemporalChoice.ref<boolean>("choice_made"),
      chosen_option: intertemporalChoice.ref<string | null>("chosen_option"),
      chose_ll: intertemporalChoice.ref<boolean>("chose_ll")
    })
    .to_dict();

  const interTrialInterval = trial.unit("inter_trial_interval").addStim(stimBank.get("fixation"));
  set_trial_context(interTrialInterval, {
    trial_id: trial.trial_id,
    phase: "inter_trial_interval",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: spec.condition_id,
    task_factors: {
      magnitude: spec.magnitude,
      block_trial_index: spec.block_trial_index,
      block_idx,
      stage: "inter_trial_interval"
    },
    stim_id: "fixation"
  });
  interTrialInterval.show({ duration: itiDuration }).to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    helpers.setTrialState("condition_id", spec.condition_id);
    helpers.setTrialState("offer_id", spec.item_id);
    helpers.setTrialState("magnitude", spec.magnitude);
    helpers.setTrialState("ss_amount", spec.ss_amount);
    helpers.setTrialState("ll_amount", spec.ll_amount);
    helpers.setTrialState("delay_days", spec.delay_days);
    helpers.setTrialState("k_ref", spec.k_ref);
    helpers.setTrialState("ll_side", spec.ll_side);
    helpers.setTrialState("ss_side", spec.ss_side);
    helpers.setTrialState("block_trial_index", spec.block_trial_index);
    helpers.setTrialState("plan_seed", planSeed);
    helpers.setTrialState("left_option_text", leftText);
    helpers.setTrialState("right_option_text", rightText);
    helpers.setTrialState("choice_made", snapshot.units.intertemporal_choice?.choice_made ?? false);
    helpers.setTrialState("choice_key", snapshot.units.intertemporal_choice?.choice_key ?? null);
    helpers.setTrialState("choice_rt", snapshot.units.intertemporal_choice?.choice_rt ?? null);
    helpers.setTrialState("chosen_side", snapshot.units.intertemporal_choice?.chosen_side ?? null);
    helpers.setTrialState("chosen_option", snapshot.units.intertemporal_choice?.chosen_option ?? null);
    helpers.setTrialState("chose_ll", snapshot.units.intertemporal_choice?.chose_ll ?? false);
    helpers.setTrialState("chosen_amount", snapshot.units.intertemporal_choice?.chosen_amount ?? null);
    helpers.setTrialState("chosen_delay_days", snapshot.units.intertemporal_choice?.chosen_delay_days ?? null);
    helpers.setTrialState("ss_key", ssKey);
    helpers.setTrialState("ll_key", llKey);
  });

  return trial;
}
