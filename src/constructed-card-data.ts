import { MatchAnalysis } from '@firestone-hs/assign-constructed-archetype';
import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { ConstructedCardData, ConstructedMatchStatDbRow, DeckStat } from './model';
import { arraysEqual } from './utils';

// Archetype cards data probably the same, we just don't have an initial list of cards
// And so, how to handle the second copy?
export const buildCardsDataForDeck = (rows: readonly ConstructedMatchStatDbRow[]): readonly ConstructedCardData[] => {
	const refRow = rows[0];
	const refMatchAnalysis: MatchAnalysis = JSON.parse(refRow.matchAnalysis);
	const allDeckCards = Object.keys(refMatchAnalysis.cardsAnalysis);
	const consolidatedData: ConstructedCardData[] = [];
	for (const card of refMatchAnalysis.cardsAnalysis) {
		consolidatedData.push({
			cardId: card.cardId,
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

	for (const row of rows) {
		const matchAnalysis: MatchAnalysis = JSON.parse(row.matchAnalysis);
		const deckCards = Object.keys(matchAnalysis.cardsAnalysis);
		// All cards for a single deck should always be the same
		if (!arraysEqual(deckCards, allDeckCards)) {
			throw new Error(`Mismatch in deck cards: ${deckCards} vs ${allDeckCards} for row ${row.id}`);
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

	return consolidatedData;
};

export const buildCardsDataForArchetype = (deckStats: readonly DeckStat[]): readonly ConstructedCardData[] => {
	// The cards for each deck, with the number of copies in each
	const deckCardIds: readonly { [cardId: string]: readonly string[] }[] = deckStats.map((d) =>
		groupByFunction((cardId: string) => cardId)(d.cardsData.map((c) => c.cardId)),
	);
	const uniqueCardIds = [...new Set(deckCardIds.flatMap((cards) => Object.keys(cards)))].sort();
	const result: ConstructedCardData[] = [];
	for (const cardId of uniqueCardIds) {
		const maxCopies = Math.max(...deckCardIds.map((cards) => cards[cardId]?.length ?? 0));
		for (let i = 0; i < maxCopies; i++) {
			const archetypeCardData: ConstructedCardData = {
				cardId: cardId,
				inStartingDeck: 0,
				wins: 0,
				drawnBeforeMulligan: 0,
				keptInMulligan: 0,
				inHandAfterMulligan: 0,
				inHandAfterMulliganThenWin: 0,
				drawn: 0,
				drawnThenWin: 0,
			};
			result.push(archetypeCardData);
			const dataForDecks = deckStats.map((d) => d.cardsData.filter((c) => c.cardId === cardId));
			for (const data of dataForDecks) {
				const deckCardData = data[i];
				if (!deckCardData) {
					continue;
				}

				archetypeCardData.inStartingDeck += deckCardData.inStartingDeck;
				archetypeCardData.wins += deckCardData.wins;
				archetypeCardData.drawnBeforeMulligan += deckCardData.drawnBeforeMulligan;
				archetypeCardData.keptInMulligan += deckCardData.keptInMulligan;
				archetypeCardData.inHandAfterMulligan += deckCardData.inHandAfterMulligan;
				archetypeCardData.inHandAfterMulliganThenWin += deckCardData.inHandAfterMulliganThenWin;
				archetypeCardData.drawn += deckCardData.drawn;
				archetypeCardData.drawnThenWin += deckCardData.drawnThenWin;
			}
		}
	}
	return result;
};
