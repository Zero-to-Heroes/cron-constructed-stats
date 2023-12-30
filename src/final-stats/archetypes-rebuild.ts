import { ArchetypeStat, ArchetypeStats } from '../model';

export const mergeArchetypes = (archetypes: readonly ArchetypeStats[]): readonly ArchetypeStat[] => {
	return archetypes.flatMap((d) => d.archetypeStats);
};
