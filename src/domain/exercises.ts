import type { BodyPart, Exercise, ExerciseCategory } from './types';

type Seed = [name: string, bodyPart: BodyPart, category: ExerciseCategory];

const SEEDS: Seed[] = [
  // Chest
  ['Bench Press', 'chest', 'barbell'],
  ['Incline Bench Press', 'chest', 'barbell'],
  ['Decline Bench Press', 'chest', 'barbell'],
  ['Bench Press', 'chest', 'dumbbell'],
  ['Incline Bench Press', 'chest', 'dumbbell'],
  ['Chest Fly', 'chest', 'dumbbell'],
  ['Cable Crossover', 'chest', 'cable'],
  ['Chest Press', 'chest', 'machine'],
  ['Push Up', 'chest', 'reps_only'],
  ['Chest Dip', 'chest', 'weighted_bodyweight'],
  // Back
  ['Deadlift', 'back', 'barbell'],
  ['Bent Over Row', 'back', 'barbell'],
  ['Pendlay Row', 'back', 'barbell'],
  ['Bent Over One Arm Row', 'back', 'dumbbell'],
  ['Pull Up', 'back', 'weighted_bodyweight'],
  ['Pull Up', 'back', 'assisted_bodyweight'],
  ['Chin Up', 'back', 'weighted_bodyweight'],
  ['Lat Pulldown', 'back', 'cable'],
  ['Seated Row', 'back', 'cable'],
  ['T Bar Row', 'back', 'machine'],
  ['Back Extension', 'back', 'reps_only'],
  ['Rack Pull', 'back', 'barbell'],
  // Shoulders
  ['Overhead Press', 'shoulders', 'barbell'],
  ['Shoulder Press', 'shoulders', 'dumbbell'],
  ['Arnold Press', 'shoulders', 'dumbbell'],
  ['Lateral Raise', 'shoulders', 'dumbbell'],
  ['Lateral Raise', 'shoulders', 'cable'],
  ['Front Raise', 'shoulders', 'dumbbell'],
  ['Reverse Fly', 'shoulders', 'dumbbell'],
  ['Face Pull', 'shoulders', 'cable'],
  ['Shrug', 'shoulders', 'dumbbell'],
  ['Upright Row', 'shoulders', 'barbell'],
  // Arms
  ['Bicep Curl', 'arms', 'barbell'],
  ['Bicep Curl', 'arms', 'dumbbell'],
  ['Hammer Curl', 'arms', 'dumbbell'],
  ['Preacher Curl', 'arms', 'machine'],
  ['Bicep Curl', 'arms', 'cable'],
  ['Triceps Pushdown', 'arms', 'cable'],
  ['Skullcrusher', 'arms', 'barbell'],
  ['Triceps Extension', 'arms', 'dumbbell'],
  ['Close Grip Bench Press', 'arms', 'barbell'],
  ['Triceps Dip', 'arms', 'weighted_bodyweight'],
  // Legs
  ['Squat', 'legs', 'barbell'],
  ['Front Squat', 'legs', 'barbell'],
  ['Romanian Deadlift', 'legs', 'barbell'],
  ['Romanian Deadlift', 'legs', 'dumbbell'],
  ['Hip Thrust', 'legs', 'barbell'],
  ['Bulgarian Split Squat', 'legs', 'dumbbell'],
  ['Lunge', 'legs', 'dumbbell'],
  ['Goblet Squat', 'legs', 'dumbbell'],
  ['Leg Press', 'legs', 'machine'],
  ['Leg Extension', 'legs', 'machine'],
  ['Seated Leg Curl', 'legs', 'machine'],
  ['Lying Leg Curl', 'legs', 'machine'],
  ['Standing Calf Raise', 'legs', 'machine'],
  ['Hack Squat', 'legs', 'machine'],
  ['Sumo Deadlift', 'legs', 'barbell'],
  // Core
  ['Plank', 'core', 'duration'],
  ['Crunch', 'core', 'reps_only'],
  ['Hanging Leg Raise', 'core', 'reps_only'],
  ['Cable Crunch', 'core', 'cable'],
  ['Ab Wheel', 'core', 'reps_only'],
  ['Russian Twist', 'core', 'reps_only'],
  // Full body
  ['Power Clean', 'full_body', 'barbell'],
  ['Kettlebell Swing', 'full_body', 'dumbbell'],
  ['Burpee', 'full_body', 'reps_only'],
  // Cardio
  ['Running', 'cardio', 'cardio'],
  ['Cycling', 'cardio', 'cardio'],
  ['Rowing', 'cardio', 'cardio'],
  ['Elliptical', 'cardio', 'cardio'],
  ['Jump Rope', 'cardio', 'duration'],
];

const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  weighted_bodyweight: 'Weighted',
  assisted_bodyweight: 'Assisted',
  reps_only: 'Bodyweight',
  duration: 'Duration',
  cardio: 'Cardio',
};

export function categoryLabel(c: ExerciseCategory): string {
  return CATEGORY_LABEL[c];
}

export function slug(name: string, category: ExerciseCategory): string {
  return `${name}-${category}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Display name, e.g. "Bench Press (Barbell)". */
export function exerciseTitle(e: Pick<Exercise, 'name' | 'category'>): string {
  return `${e.name} (${categoryLabel(e.category)})`;
}

export const BUILT_IN_EXERCISES: Record<string, Exercise> = Object.fromEntries(
  SEEDS.map(([name, bodyPart, category]) => {
    const id = slug(name, category);
    return [id, { id, name, bodyPart, category }];
  }),
);

export function tracksWeight(c: ExerciseCategory): boolean {
  return c !== 'reps_only' && c !== 'duration' && c !== 'cardio';
}

export function tracksReps(c: ExerciseCategory): boolean {
  return c !== 'duration' && c !== 'cardio';
}

export function searchExercises(
  exercises: Record<string, Exercise>,
  query: string,
  bodyPart?: BodyPart | null,
): Exercise[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return Object.values(exercises)
    .filter((e) => !bodyPart || e.bodyPart === bodyPart)
    .filter((e) => {
      const hay = exerciseTitle(e).toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => exerciseTitle(a).localeCompare(exerciseTitle(b)));
}
