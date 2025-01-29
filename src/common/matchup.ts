/* eslint-disable no-extra-boolean-cast */
import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { ConstructedCardData, ConstructedDiscoverCardData, ConstructedMatchupInfo } from '../model';
import { mergeCardsData, mergeDiscoverData } from './cards';

export const mergeMatchupInfo = (
	inputMatchupInfo: ConstructedMatchupInfo[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ConstructedMatchupInfo[] => {
	const result = [];
	let currentOpponentClass: string = null;
	let currentMatchupInfo: ConstructedMatchupInfo = null;
	let cardsData: ConstructedCardData[] = [];
	let discoverData: ConstructedDiscoverCardData[] = [];
	let matchupInfo = null;
	const sortedMatchupInfo = [...inputMatchupInfo].sort((a, b) => a.opponentClass.localeCompare(b.opponentClass));
	while ((matchupInfo = sortedMatchupInfo.pop()) != null) {
		if (currentOpponentClass === null || matchupInfo.opponentClass !== currentOpponentClass) {
			if (currentMatchupInfo !== null) {
				currentMatchupInfo.cardsData = mergeCardsData(cardsData, format, allCards);
				currentMatchupInfo.discoverData = mergeDiscoverData(discoverData, format, allCards);
				currentMatchupInfo.winrate = !!currentMatchupInfo.totalGames
					? currentMatchupInfo.wins / currentMatchupInfo.totalGames
					: null;
				cardsData = [];
				discoverData = [];
				result.push(currentMatchupInfo);
			}
			currentMatchupInfo = {
				opponentClass: matchupInfo.opponentClass,
				opponentArchetypeId: matchupInfo.opponentArchetypeId,
				totalGames: 0,
				wins: 0,
				losses: 0,
				cardsData: null,
				discoverData: null,
				winrate: null,
			};
		}
		currentOpponentClass = matchupInfo.opponentClass;
		currentMatchupInfo.totalGames += matchupInfo.totalGames;
		currentMatchupInfo.wins += matchupInfo.wins;
		currentMatchupInfo.losses += matchupInfo.losses;
		cardsData.push(...matchupInfo.cardsData.map((d) => ({ ...d } as ConstructedCardData)));
		discoverData.push(...(matchupInfo.discoverData ?? []).map((d) => ({ ...d } as ConstructedDiscoverCardData)));
	}
	currentMatchupInfo.cardsData = mergeCardsData(cardsData, format, allCards);
	currentMatchupInfo.discoverData = mergeDiscoverData(discoverData, format, allCards);
	currentMatchupInfo.winrate = !!currentMatchupInfo.totalGames
		? currentMatchupInfo.wins / currentMatchupInfo.totalGames
		: null;
	cardsData = [];
	discoverData = [];
	result.push(currentMatchupInfo);
	return result;
};
