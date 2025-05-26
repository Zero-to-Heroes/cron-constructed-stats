/* eslint-disable no-extra-boolean-cast */
import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import {
	ConstructedCardData,
	ConstructedCoinPlayInfo,
	ConstructedDiscoverCardData,
	ConstructedMatchupInfo,
} from '../model';
import { mergeCardsData, mergeDiscoverData } from './cards';
import { mergeCoinPlayInfo } from './coin-play';

export const mergeMatchupInfo = (
	inputMatchupInfo: ConstructedMatchupInfo[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ConstructedMatchupInfo[] => {
	const result = [];
	let currentOpponentClass: string = null;
	let currentMatchupInfo: ConstructedMatchupInfo = null;
	let cardsData: ConstructedCardData[] = [];
	let coinPlayInfo: ConstructedCoinPlayInfo[] = [];
	let discoverData: ConstructedDiscoverCardData[] = [];
	let matchupInfo = null;
	const sortedMatchupInfo = [...inputMatchupInfo].sort((a, b) => a.opponentClass.localeCompare(b.opponentClass));
	while ((matchupInfo = sortedMatchupInfo.pop()) != null) {
		if (currentOpponentClass === null || matchupInfo.opponentClass !== currentOpponentClass) {
			if (currentMatchupInfo !== null) {
				currentMatchupInfo.cardsData = mergeCardsData(cardsData, format, allCards);
				currentMatchupInfo.coinPlayInfo = mergeCoinPlayInfo(coinPlayInfo, format, allCards);
				currentMatchupInfo.discoverData = mergeDiscoverData(discoverData, format, allCards);
				currentMatchupInfo.winrate = !!currentMatchupInfo.totalGames
					? currentMatchupInfo.wins / currentMatchupInfo.totalGames
					: null;
				cardsData = [];
				discoverData = [];
				coinPlayInfo = [];
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
				coinPlayInfo: null,
				winrate: null,
			};
		}
		currentOpponentClass = matchupInfo.opponentClass;
		currentMatchupInfo.totalGames += matchupInfo.totalGames;
		currentMatchupInfo.wins += matchupInfo.wins;
		currentMatchupInfo.losses += matchupInfo.losses;
		cardsData.push(...matchupInfo.cardsData.map((d) => ({ ...d } as ConstructedCardData)));
		discoverData.push(...(matchupInfo.discoverData ?? []).map((d) => ({ ...d } as ConstructedDiscoverCardData)));
		coinPlayInfo.push(...(matchupInfo.coinPlayInfo ?? []).map((d) => ({ ...d } as ConstructedCoinPlayInfo)));
	}
	currentMatchupInfo.cardsData = mergeCardsData(cardsData, format, allCards);
	currentMatchupInfo.discoverData = mergeDiscoverData(discoverData, format, allCards);
	currentMatchupInfo.coinPlayInfo = mergeCoinPlayInfo(coinPlayInfo, format, allCards);
	currentMatchupInfo.winrate = !!currentMatchupInfo.totalGames
		? currentMatchupInfo.wins / currentMatchupInfo.totalGames
		: null;
	cardsData = [];
	discoverData = [];
	coinPlayInfo = [];
	result.push(currentMatchupInfo);
	return result;
};
