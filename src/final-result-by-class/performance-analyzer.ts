import { performance } from 'perf_hooks';

export class PerformanceAnalyzer {
	private timers: Map<string, number> = new Map();
	private results: Map<string, number> = new Map();

	startTimer(name: string): void {
		this.timers.set(name, performance.now());
	}

	endTimer(name: string): number {
		const startTime = this.timers.get(name);
		if (!startTime) {
			console.warn(`Timer ${name} was not started`);
			return 0;
		}

		const duration = performance.now() - startTime;
		this.results.set(name, duration);
		this.timers.delete(name);

		console.log(`⏱️  ${name}: ${duration.toFixed(2)}ms`);
		return duration;
	}

	getResults(): { [key: string]: number } {
		return Object.fromEntries(this.results);
	}

	logSummary(): void {
		console.log('\n📊 Performance Summary:');
		console.log('========================');

		const sorted = Array.from(this.results.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([name, duration]) => ({
				name,
				duration: duration.toFixed(2),
				percentage: ((duration / this.getTotalTime()) * 100).toFixed(1),
			}));

		sorted.forEach(({ name, duration, percentage }) => {
			console.log(`${name.padEnd(30)} ${duration}ms (${percentage}%)`);
		});

		console.log(`${'TOTAL'.padEnd(30)} ${this.getTotalTime().toFixed(2)}ms`);
		console.log('========================\n');
	}

	private getTotalTime(): number {
		return Array.from(this.results.values()).reduce((sum, duration) => sum + duration, 0);
	}
}

// Singleton instance
export const perf = new PerformanceAnalyzer();
