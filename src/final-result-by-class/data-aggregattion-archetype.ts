import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { mergeCardsData } from '../common/cards';
import { CORE_CARD_THRESHOLD } from '../common/config';
import { mergeMatchupInfo } from '../common/matchup';
import { ArchetypeStat, ArchetypeStats, ConstructedCardData } from '../model';
import { round } from '../utils';

export const aggregateArchetypeData = (
	dailyData: readonly ArchetypeStats[],
	format: GameFormat,
	allCards: AllCardsService,
): ArchetypeStats => {
	const result: ArchetypeStats = {
		lastUpdated: new Date(),
		rankBracket: dailyData[0].rankBracket,
		timePeriod: dailyData[0].timePeriod,
		format: dailyData[0].format,
		dataPoints: dailyData.map((d) => d.dataPoints).reduce((a, b) => a + b, 0),
		archetypeStats: mergeArchetypeStats(
			dailyData.flatMap((d) => d.archetypeStats),
			format,
			allCards,
		),
	};
	return result;
};

const mergeArchetypeStats = (
	archetypeStats: readonly ArchetypeStat[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ArchetypeStat[] => {
	const groupedByArchetype = groupByFunction((a: ArchetypeStat) => a.id)(archetypeStats);
	return Object.values(groupedByArchetype).map((group) => mergeArchetypeStatsForArchetype(group, format, allCards));
};

const mergeArchetypeStatsForArchetype = (
	archetypeStats: readonly ArchetypeStat[],
	format: GameFormat,
	allCards: AllCardsService,
): ArchetypeStat => {
	const totalGames = archetypeStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0);
	const totalWins = archetypeStats.map((d) => d.totalWins).reduce((a, b) => a + b, 0);
	const cardsData = mergeCardsData(
		archetypeStats.flatMap((d) => d.cardsData),
		format,
		allCards,
	);
	const result: ArchetypeStat = {
		id: archetypeStats[0].id,
		format: archetypeStats[0].format,
		name: archetypeStats[0].name,
		heroCardClass: archetypeStats[0].heroCardClass,
		totalGames: totalGames,
		totalWins: totalWins,
		winrate: round(totalWins / totalGames, 2),
		cardsData: cardsData,
		matchupInfo: mergeMatchupInfo(
			archetypeStats.flatMap((d) => d.matchupInfo),
			format,
			allCards,
		),
		coreCards: buildCoreCards(cardsData, totalGames),
	};
	return result;
};

const buildCoreCards = (cardsData: readonly ConstructedCardData[], totalGames: number): readonly string[] => {
	const result: readonly string[] = cardsData
		.filter((d) => d.inStartingDeck / totalGames > CORE_CARD_THRESHOLD)
		.map((d) => d.cardId);
	return result;
};
