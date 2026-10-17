// Core data model. Weights are always stored in kilograms and converted for
// display, so switching units never rewrites history.

export type BodyPart =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core'
  | 'full_body'
  | 'cardio'
  | 'other';

/** How a set for this exercise is recorded. */
export type ExerciseCategory =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'weighted_bodyweight'
  | 'assisted_bodyweight'
  | 'reps_only'
  | 'duration'
  | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  bodyPart: BodyPart;
  category: ExerciseCategory;
  custom?: boolean;
  instructions?: string;
}

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface WorkoutSet {
  id: string;
  type: SetType;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  rpe?: number;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  sets: WorkoutSet[];
  notes?: string;
  restSeconds?: number;
  /** Exercises sharing a supersetId are performed back to back. */
  supersetId?: string;
}

export interface PersonalRecord {
  exerciseId: string;
  kind: 'e1rm' | 'weight' | 'reps' | 'volume';
  value: number;
}

export interface Workout {
  id: string;
  name: string;
  startedAt: number;
  finishedAt?: number;
  exercises: WorkoutExercise[];
  notes?: string;
  templateId?: string;
  /** Records set during this workout, computed when it is finished. */
  prs?: PersonalRecord[];
}

export interface TemplateSet {
  type: SetType;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
}

export interface TemplateExercise {
  exerciseId: string;
  sets: TemplateSet[];
  restSeconds?: number;
  notes?: string;
  supersetId?: string;
}

export interface Template {
  id: string;
  name: string;
  notes?: string;
  exercises: TemplateExercise[];
  createdAt: number;
  createdBy?: 'user' | 'coach';
}

export type MeasurementType =
  | 'body_weight'
  | 'body_fat'
  | 'waist'
  | 'chest'
  | 'arm'
  | 'thigh';

export interface Measurement {
  id: string;
  type: MeasurementType;
  /** kg for body_weight, % for body_fat, cm for circumferences. */
  value: number;
  at: number;
}

export type WeightUnit = 'kg' | 'lb';

export interface Settings {
  unit: WeightUnit;
  defaultRestSeconds: number;
  barWeightKg: number;
  coachModel: string;
}

export interface AppState {
  exercises: Record<string, Exercise>;
  workouts: Workout[];
  templates: Template[];
  measurements: Measurement[];
  activeWorkout: Workout | null;
  settings: Settings;
}
