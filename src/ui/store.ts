// État partagé de session (pour la sauvegarde de projet) : valeurs des modules, carte du planificateur, accès au bras.
import type { ParamValues } from '../core/modules/types';
import type { PlannerState, Project } from '../core/project';
import type { RobotModel } from '../core/model';
import { defaultValues } from '../core/modules/types';
import { ALL_MODULES } from '../core/modules/catalog';
export const store = {
  modules: {} as Record<string, ParamValues>, planner: null as PlannerState | null, name: 'Projet sans titre',
  arm: null as null | { get: () => { model: RobotModel; poses: { q: number[]; duration: number }[] }; set: (m: RobotModel, p: { q: number[]; duration: number }[]) => void },
};
export const moduleValues = (id: string): ParamValues => (store.modules[id] ??= defaultValues(ALL_MODULES[id]));
export function applyProject(p: Project) { store.modules = p.modules ?? {}; store.planner = p.planner; store.name = p.name; if (p.arm && store.arm) store.arm.set(p.arm.model, p.arm.poses); localStorage.setItem('ral-history', JSON.stringify(p.history ?? [])); }
