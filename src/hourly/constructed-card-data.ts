import { MatchAnalysis } from '@firestone-hs/assign-constructed-archetype';
import { AllCardsService, GameFormat, GameFormatString, formatFormatReverse } from '@firestone-hs/reference-data';
import { ConstructedCardData, ConstructedMatchStatDbRow } from '../model';
import { arraysEqual } from '../utils';

// Archetype cards data probably the same, we just don't have an initial list of cards
// And so, how to handle the second copy?
export const buildCardsDataForDeck = (
	rows: readonly ConstructedMatchStatDbRow[],
	allCards: AllCardsService,
): { data: readonly ConstructedCardData[]; validRows: readonly ConstructedMatchStatDbRow[] } => {
	let allDeckCards: string[] = [];
	let consolidatedData: ConstructedCardData[] = [];
	const validRows: ConstructedMatchStatDbRow[] = [];
	for (const row of rows) {
		const matchAnalysis: MatchAnalysis = JSON.parse(row.matchAnalysis);
		if (matchAnalysis.cardsAnalysis.some((c) => !c.cardId)) {
			console.warn('incorrect input: corrput cardsAnalysis', matchAnalysis.cardsAnalysis);
			continue;
		}

		const format = formatFormatReverse(row.format as GameFormatString);
		if (!consolidatedData.length) {
			consolidatedData = populateRefData(matchAnalysis, format, allCards);
			allDeckCards = consolidatedData.map((card) => card.cardId).sort((a, b) => a.localeCompare(b));
		}

		const deckCards = matchAnalysis.cardsAnalysis
			.map((card) => baseCardId(card.cardId, format, allCards))
			.sort((a, b) => a.localeCompare(b));
		// All cards for a single deck should always be the same
		if (!arraysEqual(deckCards, allDeckCards)) {
			// Don't throw an error here, as the input could be corrupted, as so there's nothing we can do
			console.error(`Mismatch in deck cards: ${deckCards} vs ${allDeckCards} for row ${row.id}`);
			continue;
		}

		for (let i = 0; i < deckCards.length; i++) {
			const consolidatedCardData = consolidatedData[i];
			const analysis = matchAnalysis.cardsAnalysis[i];
			consolidatedCardData.inStartingDeck += 1;
			consolidatedCardData.wins += row.result === 'won' ? 1 : 0;
			consolidatedCardData.drawnBeforeMulligan += analysis.drawnBeforeMulligan ? 1 : 0;
			consolidatedCardData.keptInMulligan += analysis.drawnBeforeMulligan && analysis.mulligan ? 1 : 0;
			consolidatedCardData.inHandAfterMulligan += analysis.mulligan ? 1 : 0;
			consolidatedCardData.inHandAfterMulliganThenWin += analysis.mulligan && row.result === 'won' ? 1 : 0;
			consolidatedCardData.drawn += analysis.drawnTurn > 0 ? 1 : 0;
			consolidatedCardData.drawnThenWin += analysis.drawnTurn > 0 && row.result === 'won' ? 1 : 0;
		}
		validRows.push(row);
	}

	if (consolidatedData.some((data) => data.inStartingDeck !== rows.length)) {
		console.warn(
			'incorrect data',
			rows[0],
			rows.length,
			consolidatedData.filter((data) => data.inStartingDeck !== rows.length).length,
			consolidatedData.filter((data) => data.inStartingDeck !== rows.length).slice(0, 10),
		);
	}

	return { data: consolidatedData, validRows: validRows };
};

const baseCardId = (cardId: string, format: GameFormat, allCards: AllCardsService): string => {
	return allCards.getBaseCardIdForDeckbuilding(cardId, format);
};

const populateRefData = (
	matchAnalysis: MatchAnalysis,
	format: GameFormat,
	allCards: AllCardsService,
): ConstructedCardData[] => {
	const result: ConstructedCardData[] = [];
	for (const card of matchAnalysis.cardsAnalysis) {
		if (!card.cardId) {
			console.error('missing card id', card);
			continue;
			// throw new Error('Missing card id');
		}
		result.push({
			cardId: allCards.getBaseCardIdForDeckbuilding(card.cardId, format),
			inStartingDeck: 0,
			wins: 0,
			drawnBeforeMulligan: 0,
			keptInMulligan: 0,
			inHandAfterMulligan: 0,
			inHandAfterMulliganThenWin: 0,
			drawn: 0,
			drawnThenWin: 0,
		});
	}
	return result;
};
