import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { ConstructedMatchupInfo } from '../model';

export const mergeMatchupInfo = (matchupInfo: readonly ConstructedMatchupInfo[]): readonly ConstructedMatchupInfo[] => {
	const groupedByOpponent = groupByFunction((a: ConstructedMatchupInfo) => a.opponentClass)(matchupInfo);
	return Object.values(groupedByOpponent).map((group) => mergeMatchupInfoForOpponent(group));
};

const mergeMatchupInfoForOpponent = (matchupInfo: readonly ConstructedMatchupInfo[]): ConstructedMatchupInfo => {
	const result: ConstructedMatchupInfo = {
		opponentClass: matchupInfo[0].opponentClass,
		opponentArchetypeId: matchupInfo[0].opponentArchetypeId,
		totalGames: matchupInfo.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		wins: matchupInfo.map((d) => d.wins).reduce((a, b) => a + b, 0),
		losses: matchupInfo.map((d) => d.losses).reduce((a, b) => a + b, 0),
	};
	return result;
};
