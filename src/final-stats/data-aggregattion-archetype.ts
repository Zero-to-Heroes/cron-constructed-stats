import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { CORE_CARD_THRESHOLD } from '../common/config';
import { ArchetypeStat, ArchetypeStats, ConstructedCardData, ConstructedMatchupInfo } from '../model';
import { round } from '../utils';

export const aggregateArchetypeData = (dailyData: readonly ArchetypeStats[]): ArchetypeStats => {
	const result: ArchetypeStats = {
		lastUpdated: new Date(),
		rankBracket: dailyData[0].rankBracket,
		timePeriod: dailyData[0].timePeriod,
		format: dailyData[0].format,
		dataPoints: dailyData.map((d) => d.dataPoints).reduce((a, b) => a + b, 0),
		archetypeStats: mergeArchetypeStats(dailyData.flatMap((d) => d.archetypeStats)),
	};
	return result;
};

const mergeArchetypeStats = (archetypeStats: readonly ArchetypeStat[]): readonly ArchetypeStat[] => {
	const groupedByArchetype = groupByFunction((a: ArchetypeStat) => a.id)(archetypeStats);
	return Object.values(groupedByArchetype).map((group) => mergeArchetypeStatsForArchetype(group));
};

const mergeArchetypeStatsForArchetype = (archetypeStats: readonly ArchetypeStat[]): ArchetypeStat => {
	const totalGames = archetypeStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0);
	const totalWins = archetypeStats.map((d) => d.totalWins).reduce((a, b) => a + b, 0);
	const cardsData = mergeCardsData(archetypeStats.flatMap((d) => d.cardsData));
	const result: ArchetypeStat = {
		id: archetypeStats[0].id,
		format: archetypeStats[0].format,
		name: archetypeStats[0].name,
		heroCardClass: archetypeStats[0].heroCardClass,
		totalGames: totalGames,
		totalWins: totalWins,
		winrate: round(totalWins / totalGames, 2),
		cardsData: cardsData,
		matchupInfo: mergeMatchupInfo(archetypeStats.flatMap((d) => d.matchupInfo)),
		coreCards: buildCoreCards(cardsData, totalGames),
	};
	return result;
};

export const mergeCardsData = (cardsData: readonly ConstructedCardData[]): readonly ConstructedCardData[] => {
	const groupedByCardId = groupByFunction((a: ConstructedCardData) => a.cardId)(cardsData);
	return Object.values(groupedByCardId).map((group) => mergeCardData(group));
};

const mergeCardData = (cardsData: readonly ConstructedCardData[]): ConstructedCardData => {
	const result: ConstructedCardData = {
		cardId: cardsData[0].cardId,
		inStartingDeck: cardsData.map((d) => d.inStartingDeck).reduce((a, b) => a + b, 0),
		wins: cardsData.map((d) => d.wins).reduce((a, b) => a + b, 0),
		drawnBeforeMulligan: cardsData.map((d) => d.drawnBeforeMulligan).reduce((a, b) => a + b, 0),
		keptInMulligan: cardsData.map((d) => d.keptInMulligan).reduce((a, b) => a + b, 0),
		inHandAfterMulligan: cardsData.map((d) => d.inHandAfterMulligan).reduce((a, b) => a + b, 0),
		inHandAfterMulliganThenWin: cardsData.map((d) => d.inHandAfterMulliganThenWin).reduce((a, b) => a + b, 0),
		drawn: cardsData.map((d) => d.drawn).reduce((a, b) => a + b, 0),
		drawnThenWin: cardsData.map((d) => d.drawnThenWin).reduce((a, b) => a + b, 0),
	};
	return result;
};

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

const buildCoreCards = (cardsData: readonly ConstructedCardData[], totalGames: number): readonly string[] => {
	const result: readonly string[] = cardsData
		.filter((d) => d.inStartingDeck / totalGames > CORE_CARD_THRESHOLD)
		.map((d) => d.cardId);
	return result;
};
