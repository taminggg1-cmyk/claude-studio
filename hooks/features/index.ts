// The mod's feature modules. Each one's extras reach the window under its name, where office/features/<name>.js picks
// them up; ../register.tsx calls each one's install function by name. See ./kit.ts.

import type { Feature } from './kit'
import { yourTurn } from './your-turn'
import { whiteboard } from './whiteboard'
import { progress } from './progress'
import { paperwork } from './paperwork'
import { shiftReport } from './shift-report'
import { control } from './control'

export const FEATURES: Feature[] = [yourTurn, whiteboard, progress, paperwork, shiftReport, control]
