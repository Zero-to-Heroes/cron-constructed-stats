import { AllCardsService } from '@firestone-hs/reference-data';
import { DECK_STATS_BUCKET } from '../common/config';
import { mergeDeckStatsDataOptimized } from '../common/decks-optimized';
import { ArchetypeStat, DeckStat, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { s3 } from './build-aggregated-stats-with-timing';
import { getFileKeysToLoad } from './file-keys';
import { perf } from './performance-analyzer';
import { buildCardVariations } from './utils';

export const buildDeckStatsWithoutArchetypeInfo = async (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	playerClass: string,
	patchInfo: any,
	allCards: AllCardsService,
): Promise<readonly DeckStat[]> => {
	// Time deck stats loading and processing
	perf.startTimer('deck-stats-loading');
	const fileKeys = getFileKeysToLoad(format, rankBracket, timePeriod, playerClass, patchInfo);

	// Optimize by processing files in batches to reduce memory usage
	const BATCH_SIZE = 5; // Process 10 files at a time
	const allDeckStats: DeckStat[] = [];

	// Pre-compile filter functions for better performance
	const playerClassFilter = (d: DeckStat) => d.playerClass === playerClass;
	const decklistFilter = (d: DeckStat) => !!d.decklist;

	for (let i = 0; i < fileKeys.length; i += BATCH_SIZE) {
		const batch = fileKeys.slice(i, i + BATCH_SIZE);
		console.log(
			`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(fileKeys.length / BATCH_SIZE)} (${
				batch.length
			} files)`,
		);

		// Load and process batch with parallel processing
		const rawDataPromises = batch.map(async (fileKey) => {
			const data = await s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false, 300);
			// Parse and filter immediately to reduce memory transfer
			const parsedData = JSON.parse(data) as DeckStats;
			return parsedData?.deckStats?.filter(playerClassFilter).filter(decklistFilter) ?? [];
		});

		const batchResults = await Promise.all(rawDataPromises);
		const batchDeckStats = batchResults.flat();

		allDeckStats.push(...batchDeckStats);

		// Early memory cleanup
		batchResults.length = 0;
	}

	console.log(`Loaded ${allDeckStats.length} deck stats from ${fileKeys.length} files`);

	// Sort once after all batches are processed
	allDeckStats.sort((a, b) => a.decklist.localeCompare(b.decklist));

	perf.endTimer('deck-stats-loading');

	// Process merge optimization
	perf.startTimer('deck-stats-merge-data');
	let result: readonly DeckStat[] = mergeDeckStatsDataOptimized(allDeckStats, timePeriod, format, allCards);
	// Temp hack to remove brawl decks
	result = result.filter((c) => c.cardsData?.length > 5);
	perf.endTimer('deck-stats-merge-data');

	return result;
};

export const enhanceDeckStats = (
	deckStats: readonly DeckStat[],
	archetypeData: readonly ArchetypeStat[],
	allCards: AllCardsService,
): readonly DeckStat[] => {
	return deckStats.map((deck) => {
		const archetype = archetypeData.find((a) => a.id === deck.archetypeId);
		return {
			...deck,
			archetypeName: archetype.name,
			cardVariations: buildCardVariations(deck.decklist, archetype.coreCards, allCards),
			archetypeCoreCards: archetype.coreCards,
		};
	});
};
