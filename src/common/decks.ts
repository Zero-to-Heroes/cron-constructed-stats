import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { baseCardId } from '../hourly/constructed-card-data';
import { ConstructedCardData, ConstructedMatchupInfo, DeckStat, TimePeriod } from '../model';
import { Mutable, round } from '../utils';
import { mergeCardsData } from './cards';
import { mergeMatchupInfo } from './matchup';

export const mergeDeckStatsData = (
	sortedData: DeckStat[],
	timePeriod: TimePeriod,
	format: GameFormat,
	allCards: AllCardsService,
): DeckStat[] => {
	if (!sortedData?.length) {
		return [];
	}

	const result = [];
	let currentDecklist: string = null;
	let currentStat: Mutable<DeckStat> = null;
	let cardsData: ConstructedCardData[] = [];
	let matchupInfo: ConstructedMatchupInfo[] = [];
	let stat: DeckStat = null;
	let decksProcessed = 0;
	while ((stat = sortedData.pop()) != null) {
		if (stat.cardsData.some((d) => !d?.cardId)) {
			console.warn('invalid card data, ignoring stat altogether', stat.lastUpdate);
			continue;
		}

		if (currentDecklist === null || stat.decklist !== currentDecklist) {
			if (currentStat !== null) {
				currentStat.cardsData = mergeCardsData(cardsData, format, allCards);
				currentStat.matchupInfo = mergeMatchupInfo(matchupInfo, format, allCards);
				currentStat.winrate =
					currentStat.totalGames === 0 ? null : round(currentStat.totalWins / currentStat.totalGames, 4);
				result.push(currentStat);

				// Sanity checks
				if (
					currentStat.totalGames != 0 &&
					currentStat.cardsData.some(
						(d) => d.inStartingDeck == 0 || d.inStartingDeck % currentStat.totalGames != 0,
					)
				) {
					console.error(
						currentStat.decklist,
						currentStat.totalGames,
						currentStat.cardsData.filter(
							(d) => d.inStartingDeck == 0 || d.inStartingDeck % currentStat.totalGames != 0,
						),
						[...cardsData]
							.sort((a, b) =>
								baseCardId(a.cardId, format, allCards).localeCompare(
									baseCardId(b.cardId, format, allCards),
								),
							)
							.map((d) => baseCardId(d.cardId, format, allCards)),
						currentStat,
					);
					throw new Error('Invalid cards data for deck: totalGames');
				}
				if (
					currentStat.totalWins !== 0 &&
					currentStat.cardsData.some((d) => d.wins == 0 || d.wins % currentStat.totalWins !== 0)
				) {
					console.error(
						currentStat.decklist,
						currentStat.totalWins,
						currentStat.cardsData.filter((d) => d.wins == 0 || d.wins % currentStat.totalWins !== 0),
						currentStat,
					);
					throw new Error('Invalid cards data for deck: wins');
				}

				cardsData = [];
				matchupInfo = [];
				decksProcessed++;
			}
			currentStat = {
				heroCardIds: [],
				archetypeId: stat.archetypeId,
				decklist: stat.decklist,
				format: stat.format,
				lastUpdate: stat.lastUpdate == null ? null : new Date(stat.lastUpdate),
				playerClass: stat.playerClass,
				rankBracket: stat.rankBracket,
				timePeriod: timePeriod,
				totalGames: 0,
				totalWins: 0,
				winrate: null,
				cardsData: null,
				matchupInfo: null,
				archetypeCoreCards: null,
				cardVariations: null,
				archetypeName: null,
			};
		}
		currentDecklist = stat.decklist;
		currentStat.totalGames += stat.totalGames;
		currentStat.totalWins += stat.totalWins;
		currentStat.heroCardIds = [...new Set([...(currentStat.heroCardIds ?? []), ...(stat.heroCardIds ?? [])])];
		currentStat.lastUpdate =
			currentStat.lastUpdate === null
				? stat.lastUpdate
				: stat.lastUpdate === null
				? currentStat.lastUpdate
				: currentStat.lastUpdate > stat.lastUpdate
				? currentStat.lastUpdate
				: stat.lastUpdate;
		cardsData.push(...stat.cardsData.map((d) => ({ ...d } as ConstructedCardData)));
		matchupInfo.push(...stat.matchupInfo.map((m) => ({ ...m } as ConstructedMatchupInfo)));
	}

	currentStat.cardsData = mergeCardsData(cardsData, format, allCards);
	currentStat.matchupInfo = mergeMatchupInfo(matchupInfo, format, allCards);
	currentStat.winrate =
		currentStat.totalGames === 0 ? null : round(currentStat.totalWins / currentStat.totalGames, 4);
	result.push(currentStat);
	return result;
};

export const formatMemoryUsage = (memoryData) => ({
	rss: `${formatBytes(memoryData.rss)} -> Resident Set Size - total memory allocated for the process execution`,
	heapTotal: `${formatBytes(memoryData.heapTotal)} -> total size of the allocated heap`,
	heapUsed: `${formatBytes(memoryData.heapUsed)} -> actual memory used during the execution`,
	external: `${formatBytes(memoryData.external)} -> V8 external memory`,
});
const formatBytes = (data) => `${Math.round((data / 1024 / 1024) * 100) / 100} MB`;
