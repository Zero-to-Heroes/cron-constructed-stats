import { MatchAnalysis } from '@firestone-hs/assign-constructed-archetype';
import { ConstructedCardData, ConstructedMatchStatDbRow } from './model';
import { arraysEqual } from './utils';

// Archetype cards data probably the same, we just don't have an initial list of cards
// And so, how to handle the second copy?
export const buildCardsDataForDeck = (
	inputRows: readonly ConstructedMatchStatDbRow[],
): readonly ConstructedCardData[] => {
	const rows = inputRows.filter((r) => r.matchAnalysis?.length > 0);
	if (rows.length === 0) {
		return [];
	}

	const refRow = rows[0];
	const refMatchAnalysis: MatchAnalysis = JSON.parse(refRow.matchAnalysis);
	const allDeckCards = Object.keys(refMatchAnalysis.cardsAnalysis);
	const consolidatedData: ConstructedCardData[] = [];
	for (const card of refMatchAnalysis.cardsAnalysis) {
		consolidatedData.push({
			cardId: card.cardId,
			inStartingDeck: 0,
			wins: 0,
			keptInMulligan: 0,
			inHandAfterMulligan: 0,
			keptInMulliganThenWin: 0,
			inHandAfterMulliganThenWin: 0,
		});
	}

	for (const row of rows) {
		const matchAnalysis: MatchAnalysis = JSON.parse(row.matchAnalysis);
		const deckCards = Object.keys(matchAnalysis.cardsAnalysis);
		// All cards for a single deck should always be the same
		if (!arraysEqual(deckCards, allDeckCards)) {
			throw new Error(`Mismatch in deck cards: ${deckCards} vs ${allDeckCards} for row ${row.id}`);
		}

		for (let i = 0; i < deckCards.length; i++) {
			const consolidatedCardData = consolidatedData[i];
			consolidatedCardData.inStartingDeck += 1;
			consolidatedCardData.wins += row.result === 'won' ? 1 : 0;
			consolidatedCardData.keptInMulligan += matchAnalysis.cardsAnalysis[i].kept ? 1 : 0;
			consolidatedCardData.inHandAfterMulligan += matchAnalysis.cardsAnalysis[i].mulligan ? 1 : 0;
			consolidatedCardData.keptInMulliganThenWin +=
				matchAnalysis.cardsAnalysis[i].kept && row.result === 'won' ? 1 : 0;
			consolidatedCardData.inHandAfterMulliganThenWin +=
				matchAnalysis.cardsAnalysis[i].mulligan && row.result === 'won' ? 1 : 0;
		}
	}

	return consolidatedData;
};
