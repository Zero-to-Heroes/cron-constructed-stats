export interface ConstructedMatchStatDbRow {
	readonly id: number;
	readonly creationDate: Date;
	readonly buildNumber: number;
	readonly reviewId: string;
	readonly format: GameFormat;
	readonly isLegend: boolean;
	readonly playerRank: number;
	readonly playerClass: string;
	readonly playerArchetypeId: number;
	readonly opponentClass: string;
	readonly result: 'won' | 'lost' | 'tied';
	readonly playerDecklist: string;
}

export interface DeckStats {
	readonly lastUpdated: Date;
	readonly rankBracket: RankBracket;
	readonly timePeriod: TimePeriod;
	readonly format: GameFormat;
	readonly dataPoints: number;
	readonly deckStats: readonly DeckStat[];
	readonly archetypeStats: readonly ArchetypeStat[];
}

export interface DeckStat {
	readonly playerClass: string;
	readonly archetypeId: number;
	readonly archetypeName: string;
	// readonly name: string;
	readonly decklist: string;
	readonly rankBracket: RankBracket;
	readonly timePeriod: TimePeriod;
	readonly format: GameFormat;
	readonly totalGames: number;
	readonly winrate: number;
	readonly cardVariations: {
		readonly added: readonly string[];
		readonly removed: readonly string[];
	};
	readonly archetypeCoreCards?: readonly string[];
}

export interface ArchetypeStat {
	readonly id: number;
	readonly name: string;
	readonly heroCardClass: string;
	readonly totalGames: number;
	readonly winrate: number;
	readonly coreCards: readonly string[];
}

export type RankBracket = 'top-2000-legend' | 'legend' | 'legend-diamond' | 'diamond' | 'platinum' | 'bronze-gold';
export type TimePeriod = 'past-30' | 'past-7' | 'past-3' | 'current-season' | 'last-patch';
export type GameFormat = 'standard' | 'wild' | 'twist' | 'classic';
