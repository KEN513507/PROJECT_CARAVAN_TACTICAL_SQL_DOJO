// js/campaign.js
// 学習ミッションの並び。onboarding.js（導入12問）と missions.js（追加分）を連結するだけ。
// 連結をここに置くのは、missions.js が onboarding.js を参照するため
// （onboarding.js 側から missions.js を読むと循環参照になる）。

import { ONBOARDING_STAGES as BASE_STAGES } from './onboarding.js?v=20260928-missions';
import { EXTRA_MISSIONS, buildMission, MISSION_TABLES } from './missions.js?v=20260928-missions';

export const LEARNING_TABLES = MISSION_TABLES;
export const LEARNING_STAGES = [
  ...BASE_STAGES,
  ...EXTRA_MISSIONS.map((spec, i) => buildMission(spec, BASE_STAGES.length + i))
];
