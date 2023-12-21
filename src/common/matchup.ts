import { ConstructedMatchupInfo } from '../model';

export const mergeMatchupInfo = (sortedMatchupInfo: ConstructedMatchupInfo[]): readonly ConstructedMatchupInfo[] => {
	const result = [];
	let currentOpponentClass: string = null;
	let currentMatchupInfo: ConstructedMatchupInfo = null;
	let matchupInfo = null;
	while ((matchupInfo = sortedMatchupInfo.pop()) != null) {
		if (currentOpponentClass === null || matchupInfo.opponentClass !== currentOpponentClass) {
			if (currentMatchupInfo !== null) {
				result.push(currentMatchupInfo);
			}
			currentMatchupInfo = {
				opponentClass: matchupInfo.opponentClass,
				opponentArchetypeId: matchupInfo.opponentArchetypeId,
				totalGames: 0,
				wins: 0,
				losses: 0,
			};
		}
		currentOpponentClass = matchupInfo.opponentClass;
		currentMatchupInfo.totalGames += matchupInfo.totalGames;
		currentMatchupInfo.wins += matchupInfo.wins;
		currentMatchupInfo.losses += matchupInfo.losses;
	}
	result.push(currentMatchupInfo);
	return result;
};

// const mergeMatchupInfoForOpponent = (matchupInfo: readonly ConstructedMatchupInfo[]): ConstructedMatchupInfo => {
// 	const result: ConstructedMatchupInfo = {
// 		opponentClass: matchupInfo[0].opponentClass,
// 		opponentArchetypeId: matchupInfo[0].opponentArchetypeId,
// 		totalGames: matchupInfo.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
// 		wins: matchupInfo.map((d) => d.wins).reduce((a, b) => a + b, 0),
// 		losses: matchupInfo.map((d) => d.losses).reduce((a, b) => a + b, 0),
// 	};
// 	return result;
// };
