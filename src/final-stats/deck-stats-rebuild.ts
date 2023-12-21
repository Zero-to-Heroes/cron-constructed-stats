import { AllCardsService } from '@firestone-hs/reference-data';
import { DECK_STATS_BUCKET } from '../common/config';
import { mergeDeckStatsData } from '../common/decks';
import { buildCardVariations } from '../hourly/constructed-deck-stats';
import { ArchetypeStat, DeckStat, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { s3 } from './build-aggregated-stats';
import { getFileKeysToLoad } from './file-keys';

export const buildDeckStatsWithoutArchetypeInfo = async (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	patchInfo: any,
	allCards: AllCardsService,
): Promise<readonly DeckStat[]> => {
	const fileKeys = getFileKeysToLoad(format, rankBracket, timePeriod, patchInfo);
	console.time('raw-data-load');
	let rawData = await Promise.all(
		fileKeys.map((fileKey) => s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false, 300)),
	);
	console.timeEnd('raw-data-load');

	console.time('raw-data-parse');
	let data: readonly DeckStats[] = rawData.map((data) => JSON.parse(data));
	rawData = null;
	console.timeEnd('raw-data-parse');

	console.time('deck-sort');
	let deckStats = data
		?.flatMap((d) => d?.deckStats ?? [])
		.filter((d) => !!d.decklist)
		.sort((a, b) => a.decklist.localeCompare(b.decklist));
	data = null;
	console.timeEnd('deck-sort');

	// console.log('memory after sortedData', formatMemoryUsage(process.memoryUsage()));
	console.time('merge-data');
	const result: readonly DeckStat[] = mergeDeckStatsData(deckStats);
	deckStats = null;
	console.timeEnd('merge-data');
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
			cardVariations: buildCardVariations(deck.decklist, archetype.coreCards, allCards),
			archetypeCoreCards: archetype.coreCards,
		};
	});
};
