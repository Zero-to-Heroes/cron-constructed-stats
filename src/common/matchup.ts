/* eslint-disable no-extra-boolean-cast */
import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { ConstructedCardData, ConstructedMatchupInfo } from '../model';
import { mergeCardsData } from './cards';

export const mergeMatchupInfo = (
	inputMatchupInfo: ConstructedMatchupInfo[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ConstructedMatchupInfo[] => {
	const result = [];
	let currentOpponentClass: string = null;
	let currentMatchupInfo: ConstructedMatchupInfo = null;
	let cardsData: ConstructedCardData[] = [];
	let matchupInfo = null;
	const sortedMatchupInfo = [...inputMatchupInfo].sort((a, b) => a.opponentClass.localeCompare(b.opponentClass));
	while ((matchupInfo = sortedMatchupInfo.pop()) != null) {
		if (currentOpponentClass === null || matchupInfo.opponentClass !== currentOpponentClass) {
			if (currentMatchupInfo !== null) {
				currentMatchupInfo.cardsData = mergeCardsData(cardsData, format, allCards);
				currentMatchupInfo.winrate = !!currentMatchupInfo.totalGames
					? currentMatchupInfo.wins / currentMatchupInfo.totalGames
					: null;
				cardsData = [];
				result.push(currentMatchupInfo);
			}
			currentMatchupInfo = {
				opponentClass: matchupInfo.opponentClass,
				opponentArchetypeId: matchupInfo.opponentArchetypeId,
				totalGames: 0,
				wins: 0,
				losses: 0,
				cardsData: null,
				winrate: null,
			};
		}
		currentOpponentClass = matchupInfo.opponentClass;
		currentMatchupInfo.totalGames += matchupInfo.totalGames;
		currentMatchupInfo.wins += matchupInfo.wins;
		currentMatchupInfo.losses += matchupInfo.losses;
		cardsData.push(...matchupInfo.cardsData.map((d) => ({ ...d } as ConstructedCardData)));
	}
	currentMatchupInfo.cardsData = mergeCardsData(cardsData, format, allCards);
	cardsData = [];
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
