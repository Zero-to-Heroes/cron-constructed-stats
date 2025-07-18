import { AllCardsService, formatFormatReverse } from '@firestone-hs/reference-data';
import { baseCardId } from '../hourly/constructed-card-data';
import {
	ConstructedCardData,
	ConstructedCoinPlayInfo,
	ConstructedDiscoverCardData,
	ConstructedMatchupInfo,
	DeckStat,
	GameFormat,
	TimePeriod,
} from '../model';
import { Mutable, round } from '../utils';

export const mergeDeckStatsDataOptimized = (
	inputData: DeckStat[],
	timePeriod: TimePeriod,
	format: GameFormat,
	allCards: AllCardsService,
): DeckStat[] => {
	if (!inputData?.length) {
		return [];
	}

	// Convert format once at the beginning
	const convertedFormat = formatFormatReverse(format);

	// Group by decklist using Map for O(1) operations
	const decklistGroups = new Map<string, DeckStat[]>();

	for (const stat of inputData) {
		if (stat.cardsData.some((d) => !d?.cardId)) {
			console.warn('invalid card data, ignoring stat altogether', stat.lastUpdate);
			continue;
		}

		const existing = decklistGroups.get(stat.decklist);
		if (existing) {
			existing.push(stat);
		} else {
			decklistGroups.set(stat.decklist, [stat]);
		}
	}

	// Process each decklist group
	const result: DeckStat[] = [];
	for (const [decklist, groupStats] of decklistGroups) {
		const mergedStat = mergeStatsForDecklist(groupStats, timePeriod, convertedFormat, allCards);
		result.push(mergedStat);
	}

	return result;
};

const mergeStatsForDecklist = (
	groupStats: DeckStat[],
	timePeriod: TimePeriod,
	convertedFormat: any, // Use the converted format type
	allCards: AllCardsService,
): DeckStat => {
	const firstStat = groupStats[0];

	// Direct aggregation of simple fields
	let totalGames = 0;
	let totalWins = 0;
	let latestUpdate: Date | null = null;
	const allHeroCardIds = new Set<string>();

	// Maps for efficient aggregation
	const cardsDataMap = new Map<string, ConstructedCardData>();
	const matchupInfoMap = new Map<string, ConstructedMatchupInfo>();
	const discoverDataMap = new Map<string, ConstructedDiscoverCardData>();
	const coinPlayInfoMap = new Map<string, ConstructedCoinPlayInfo>();

	// Process each stat in the group
	for (const stat of groupStats) {
		// Aggregate simple fields
		totalGames += stat.totalGames;
		totalWins += stat.totalWins;

		// Track latest update
		if (stat.lastUpdate) {
			const updateDate = new Date(stat.lastUpdate);
			if (!latestUpdate || updateDate > latestUpdate) {
				latestUpdate = updateDate;
			}
		}

		// Collect hero card IDs
		if (stat.heroCardIds) {
			stat.heroCardIds.forEach((id) => allHeroCardIds.add(id));
		}

		// Aggregate cards data
		for (const cardData of stat.cardsData) {
			const cardId = baseCardId(cardData.cardId, convertedFormat, allCards);
			const existing = cardsDataMap.get(cardId);

			if (existing) {
				// Aggregate existing card data
				existing.inStartingDeck += cardData.inStartingDeck;
				existing.wins += cardData.wins;
				existing.drawnBeforeMulligan += cardData.drawnBeforeMulligan;
				existing.keptInMulligan += cardData.keptInMulligan;
				existing.inHandAfterMulligan += cardData.inHandAfterMulligan;
				existing.inHandAfterMulliganThenWin += cardData.inHandAfterMulliganThenWin;
				existing.drawn += cardData.drawn;
				existing.drawnThenWin += cardData.drawnThenWin;
			} else {
				// Create new card data entry
				cardsDataMap.set(cardId, {
					cardId: cardId,
					inStartingDeck: cardData.inStartingDeck,
					wins: cardData.wins,
					drawnBeforeMulligan: cardData.drawnBeforeMulligan,
					keptInMulligan: cardData.keptInMulligan,
					inHandAfterMulligan: cardData.inHandAfterMulligan,
					inHandAfterMulliganThenWin: cardData.inHandAfterMulliganThenWin,
					drawn: cardData.drawn,
					drawnThenWin: cardData.drawnThenWin,
				});
			}
		}

		// Aggregate matchup data
		for (const matchupData of stat.matchupInfo) {
			const key = `${matchupData.opponentClass}-${matchupData.opponentArchetypeId || 'unknown'}`;
			const existing = matchupInfoMap.get(key);

			if (existing) {
				existing.totalGames += matchupData.totalGames;
				existing.wins += matchupData.wins;
				existing.losses += matchupData.losses;

				// Aggregate nested card data - need to create a new array since it's readonly
				const existingCards = existing.cardsData as ConstructedCardData[];
				const newCardsData = [...existingCards];

				for (const cardData of matchupData.cardsData) {
					const cardId = baseCardId(cardData.cardId, convertedFormat, allCards);
					const existingCard = newCardsData.find((c) => c.cardId === cardId);
					if (existingCard) {
						existingCard.inStartingDeck += cardData.inStartingDeck;
						existingCard.wins += cardData.wins;
						existingCard.drawnBeforeMulligan += cardData.drawnBeforeMulligan;
						existingCard.keptInMulligan += cardData.keptInMulligan;
						existingCard.inHandAfterMulligan += cardData.inHandAfterMulligan;
						existingCard.inHandAfterMulliganThenWin += cardData.inHandAfterMulliganThenWin;
						existingCard.drawn += cardData.drawn;
						existingCard.drawnThenWin += cardData.drawnThenWin;
					} else {
						newCardsData.push({
							cardId: baseCardId(cardData.cardId, convertedFormat, allCards),
							inStartingDeck: cardData.inStartingDeck,
							wins: cardData.wins,
							drawnBeforeMulligan: cardData.drawnBeforeMulligan,
							keptInMulligan: cardData.keptInMulligan,
							inHandAfterMulligan: cardData.inHandAfterMulligan,
							inHandAfterMulliganThenWin: cardData.inHandAfterMulliganThenWin,
							drawn: cardData.drawn,
							drawnThenWin: cardData.drawnThenWin,
						});
					}
				}

				// Update the existing matchup with new cards data
				const mutableExisting = existing as Mutable<ConstructedMatchupInfo>;
				mutableExisting.cardsData = newCardsData;
			} else {
				matchupInfoMap.set(key, {
					opponentClass: matchupData.opponentClass,
					opponentArchetypeId: matchupData.opponentArchetypeId,
					totalGames: matchupData.totalGames,
					wins: matchupData.wins,
					losses: matchupData.losses,
					winrate: null, // Will be calculated later
					cardsData: matchupData.cardsData.map((cardData) => ({
						cardId: baseCardId(cardData.cardId, convertedFormat, allCards),
						inStartingDeck: cardData.inStartingDeck,
						wins: cardData.wins,
						drawnBeforeMulligan: cardData.drawnBeforeMulligan,
						keptInMulligan: cardData.keptInMulligan,
						inHandAfterMulligan: cardData.inHandAfterMulligan,
						inHandAfterMulliganThenWin: cardData.inHandAfterMulliganThenWin,
						drawn: cardData.drawn,
						drawnThenWin: cardData.drawnThenWin,
					})),
					discoverData: matchupData.discoverData ? [...matchupData.discoverData] : [],
					coinPlayInfo: matchupData.coinPlayInfo ? [...matchupData.coinPlayInfo] : [],
				});
			}
		}

		// Aggregate discover data
		if (stat.discoverData) {
			for (const discoverData of stat.discoverData) {
				const cardId = baseCardId(discoverData.cardId, convertedFormat, allCards);
				const existing = discoverDataMap.get(cardId);

				if (existing) {
					existing.discovered += discoverData.discovered;
					existing.discoveredThenWin += discoverData.discoveredThenWin;
				} else {
					discoverDataMap.set(cardId, {
						cardId: cardId,
						discovered: discoverData.discovered,
						discoveredThenWin: discoverData.discoveredThenWin,
					});
				}
			}
		}

		// Aggregate coin/play data
		if (stat.coinPlayInfo) {
			for (const coinPlayData of stat.coinPlayInfo) {
				const key = coinPlayData.coinPlay;
				const existing = coinPlayInfoMap.get(key);

				if (existing) {
					existing.totalGames += coinPlayData.totalGames;
					existing.wins += coinPlayData.wins;
					existing.losses += coinPlayData.losses;

					// Aggregate nested card data
					const existingCards = existing.cardsData as ConstructedCardData[];
					const newCardsData = [...existingCards];

					for (const cardData of coinPlayData.cardsData) {
						const cardId = baseCardId(cardData.cardId, convertedFormat, allCards);
						const existingCard = newCardsData.find((c) => c.cardId === cardId);
						if (existingCard) {
							existingCard.inStartingDeck += cardData.inStartingDeck;
							existingCard.wins += cardData.wins;
							existingCard.drawnBeforeMulligan += cardData.drawnBeforeMulligan;
							existingCard.keptInMulligan += cardData.keptInMulligan;
							existingCard.inHandAfterMulligan += cardData.inHandAfterMulligan;
							existingCard.inHandAfterMulliganThenWin += cardData.inHandAfterMulliganThenWin;
							existingCard.drawn += cardData.drawn;
							existingCard.drawnThenWin += cardData.drawnThenWin;
						} else {
							newCardsData.push({
								cardId: baseCardId(cardData.cardId, convertedFormat, allCards),
								inStartingDeck: cardData.inStartingDeck,
								wins: cardData.wins,
								drawnBeforeMulligan: cardData.drawnBeforeMulligan,
								keptInMulligan: cardData.keptInMulligan,
								inHandAfterMulligan: cardData.inHandAfterMulligan,
								inHandAfterMulliganThenWin: cardData.inHandAfterMulliganThenWin,
								drawn: cardData.drawn,
								drawnThenWin: cardData.drawnThenWin,
							});
						}
					}

					// Update the existing coin play info with new cards data
					const mutableExisting = existing as Mutable<ConstructedCoinPlayInfo>;
					mutableExisting.cardsData = newCardsData;
				} else {
					coinPlayInfoMap.set(key, {
						coinPlay: coinPlayData.coinPlay,
						totalGames: coinPlayData.totalGames,
						wins: coinPlayData.wins,
						losses: coinPlayData.losses,
						winrate: null, // Will be calculated later
						cardsData: coinPlayData.cardsData.map((cardData) => ({
							cardId: baseCardId(cardData.cardId, convertedFormat, allCards),
							inStartingDeck: cardData.inStartingDeck,
							wins: cardData.wins,
							drawnBeforeMulligan: cardData.drawnBeforeMulligan,
							keptInMulligan: cardData.keptInMulligan,
							inHandAfterMulligan: cardData.inHandAfterMulligan,
							inHandAfterMulliganThenWin: cardData.inHandAfterMulliganThenWin,
							drawn: cardData.drawn,
							drawnThenWin: cardData.drawnThenWin,
						})),
					});
				}
			}
		}
	}

	// Calculate winrates for matchups
	for (const matchup of matchupInfoMap.values()) {
		const mutableMatchup = matchup as Mutable<ConstructedMatchupInfo>;
		mutableMatchup.winrate = matchup.totalGames > 0 ? matchup.wins / matchup.totalGames : 0;
	}

	// Calculate winrates for coin/play data
	for (const coinPlay of coinPlayInfoMap.values()) {
		const mutableCoinPlay = coinPlay as Mutable<ConstructedCoinPlayInfo>;
		mutableCoinPlay.winrate = coinPlay.totalGames > 0 ? coinPlay.wins / coinPlay.totalGames : 0;
	}

	// Perform sanity checks
	const cardsDataArray = Array.from(cardsDataMap.values());
	if (totalGames !== 0) {
		const invalidCards = cardsDataArray.filter(
			(d) => d.inStartingDeck === 0 || d.inStartingDeck % totalGames !== 0,
		);
		if (invalidCards.length > 0) {
			console.error('Invalid cards data for deck: totalGames', firstStat.decklist, totalGames, invalidCards);
			throw new Error('Invalid cards data for deck: totalGames');
		}
	}

	if (totalWins !== 0) {
		const invalidCards = cardsDataArray.filter((d) => d.wins === 0 || d.wins % totalWins !== 0);
		if (invalidCards.length > 0) {
			console.error('Invalid cards data for deck: wins', firstStat.decklist, totalWins, invalidCards);
			throw new Error('Invalid cards data for deck: wins');
		}
	}

	// Build final result
	const result: DeckStat = {
		heroCardIds: Array.from(allHeroCardIds),
		archetypeId: firstStat.archetypeId,
		decklist: firstStat.decklist,
		format: firstStat.format,
		lastUpdate: latestUpdate,
		playerClass: firstStat.playerClass,
		rankBracket: firstStat.rankBracket,
		timePeriod: timePeriod,
		totalGames: totalGames,
		totalWins: totalWins,
		winrate: totalGames === 0 ? null : round(totalWins / totalGames, 4),
		cardsData: cardsDataArray,
		discoverData: Array.from(discoverDataMap.values()),
		matchupInfo: Array.from(matchupInfoMap.values()),
		coinPlayInfo: Array.from(coinPlayInfoMap.values()),
		archetypeCoreCards: null,
		cardVariations: null,
		archetypeName: null,
	};

	return result;
};
