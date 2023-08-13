import { App, Notice, Plugin, PluginSettingTab, Setting, request, moment, TFile, normalizePath } from 'obsidian';
import { Summary } from './model';
import { appHasDailyNotesPluginLoaded, createDailyNote, getAllDailyNotes, getDailyNote } from "obsidian-daily-notes-interface";

// Remember to rename these classes and interfaces!

interface WakaBoxPluginSettings {
	apiKey: string;
}

const DEFAULT_SETTINGS: WakaBoxPluginSettings = {
	apiKey: ''
}

export default class WakaBoxPlugin extends Plugin {
	settings: WakaBoxPluginSettings;
	private summaryFetcher: SummaryDataFetcher | undefined;

	async onload() {
		this.addSettingTab(new WakaBoxSettingTab(this.app, this));
		this.addCommand({
			id: "wakabox-refresh-today",
			name: "Force refetch today's data",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('Display Waka Time: Please enter your API key in the settings.', 5000);
					return;
				}
				const date = new Date().toISOString().slice(0, 10);
				if (this.summaryFetcher != undefined) {
					this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, true, this.onFetchedSummary);
				}
			}
		})
		this.addCommand({
			id: "wakabox-refresh-yesterday",
			name: "Refetch yesterday's data",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('Display Waka Time: Please enter your API key in the settings.', 5000);
					return;
				}
				const yesterday = new Date().getTime() - 24 * 60 * 60 * 1000;
				const date = new Date(yesterday).toISOString().slice(0, 10);
				if (this.summaryFetcher != undefined) {
					this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, true, this.onFetchedSummary);
				}
			}
		})
		this.app.workspace.onLayoutReady(() => {
			this.onLayoutReady();
		});
	}

	onLayoutReady() {
		if (!appHasDailyNotesPluginLoaded()) {
			new Notice('Display Waka Time: Please Enable Daily Notes plugin.', 5000);
		}
		this.loadSettings().then(() => {
			if (this.settings.apiKey.trim() == '') {
				new Notice('Display Waka Time: Please enter your API key in the settings.', 5000);
				return;
			}
			this.onGetAPIKey();
		});
	}

	onGetAPIKey() {
		if (this.settings.apiKey.trim() == '') {
			return;
		}
		this.summaryFetcher = new SummaryDataFetcher(this.app);
		// TODO fetch previous data if open a file from the same day
		const date = new Date().toISOString().slice(0, 10);
		this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, false, this.onFetchedSummary);
		const interval = 60 * 60 * 1000;
		this.registerInterval(window.setInterval(() => {
			if (this.summaryFetcher != undefined) {
				const date = new Date().toISOString().slice(0, 10);
				this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, false, this.onFetchedSummary);
			}
		}, interval));
	}

	onunload() {
		this.summaryFetcher = undefined;
	}

	onFetchedSummary = (summary: Summary | undefined, fromCache: boolean) => {
		if (summary == undefined) {
			console.warn("Display Waka Time: No summary data received");
			return;
		}
		const momentDate = moment.utc(summary.start).local();
		const dailyNotes = getAllDailyNotes();
		const dailyNode = getDailyNote(momentDate, dailyNotes)
		if (dailyNode == undefined) {
			createDailyNote(momentDate).then((file) => {
				this.processDailyNote(file, summary, fromCache);
			});
		} else {
			this.processDailyNote(dailyNode, summary, fromCache);
		}
	}

	processDailyNote(file: TFile, summary: Summary, fromCache: boolean) {
		console.log("refreshing daily note. fromCache: " + fromCache + ", file: " + file.name);
		this.app.vault.process(file, (data: string) => {
			var box = "";
			box += "```wakatime"
			box += "\n";
			var count = 0;
			var maxNameLength = 0;
			var maxTextLength = 0;
			var maxPercentLength = 0;
			summary.data[0].languages.forEach((language) => {
				if (count++ > 5) {
					return;
				}
				if (language.name.length > maxNameLength) {
					maxNameLength = language.name.length;
				}
				if (language.text.length > maxTextLength) {
					maxTextLength = language.text.length;
				}
				if (language.percent.toString().length > maxPercentLength) {
					maxPercentLength = language.percent.toString().length;
				}
			});
			count = 0;
			summary.data[0].languages.forEach((language) => {
				if (count++ > 5) {
					return;
				}
				const name = language.name.padEnd(maxNameLength, " ");
				const text = language.text.padEnd(maxTextLength, " ");
				const percent = language.percent.toString().padStart(maxPercentLength, " ");
				const bar = this.generateBarChart(language.percent, 20);
				const padding = " ".repeat(5);
				const line = `${name}${padding}${text}${padding}${bar}${padding}${percent} %\n`;
				box += line;
			});
			box += "```"
			const exists = data.includes("```wakatime");
			if (exists) {
				data = data.replace(/```wakatime[\s\S]*```/g, box);
			} else {
				data += box;
			}
			return data;
		});
	}

	generateBarChart(percent: number, size: number): string {
		const syms = "░▏▎▍▌▋▊▉█";

		const frac = Math.floor((size * 8 * percent) / 100);
		const barsFull = Math.floor(frac / 8);
		if (barsFull >= size) {
			return syms.substring(8, 9).repeat(size);
		}
		const semi = frac % 8;

		return [syms.substring(8, 9).repeat(barsFull), syms.substring(semi, semi + 1)]
			.join("")
			.padEnd(size, syms.substring(0, 1));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}

class SummaryDataFetcher {

	private app: App;
	private cacheDir: String;

	constructor(app: App) {
		this.app = app;
		this.createCacheDir();
	}

	async createCacheDir() {
		const cacheDir = normalizePath(this.app.vault.configDir + "/" + ".waka_box_cache");
		const exists = await this.app.vault.adapter.exists(cacheDir);
		if (!exists) {
			await this.app.vault.adapter.mkdir(cacheDir);
		}
		this.cacheDir = cacheDir;
	}

	async loadFromCache(cacheKey: String): Promise<Summary | undefined> {
		await this.createCacheDir();
		const cacheFilePath = normalizePath(this.cacheDir + "/" + cacheKey);
		const exists = await this.app.vault.adapter.exists(cacheFilePath);
		const vaildTill = new Date();
		vaildTill.setHours(vaildTill.getHours() - 1);
		if (!exists) {
			return undefined;
		}
		try {
			const stat = await this.app.vault.adapter.stat(cacheFilePath);
			const metadata = stat?.mtime;
			if (metadata) {
				const lastModified = new Date(metadata);
				if (lastModified < vaildTill) {
					return undefined;
				}
			}

			const data = await this.app.vault.adapter.read(cacheFilePath);
			const summary = JSON.parse(data) as Summary;
			return summary;
		} catch (e) {
			console.error("Display Waka Time: Error loading WakaTime summary from cache: " + e);
		}
		return undefined;
	}

	async saveToCache(cacheKey: String, summary: Summary) {
		try {
			await this.app.vault.adapter.write(normalizePath(this.cacheDir + "/" + cacheKey), JSON.stringify(summary));
		} catch (e) {
			console.error("Display Waka Time: Error saving WakaTime summary to cache: " + e);
		}
	}

	// read cache or fetch data from wakatime
	requestWakaTimeSummary(apiKey: String, date: String, force: boolean, callback: (summary: Summary | undefined, fromCache: boolean) => void) {
		const baseUrl = "https://wakatime.com/api/v1/users/current/summaries"
		const url = baseUrl + "?start=" + date + "&end=" + date + "&api_key=" + apiKey;
		try {
			function fetch(fetcher: SummaryDataFetcher) {
				console.log("start request for " + date);
				request({ url: url }).then((result) => {
					const summary = JSON.parse(result) as Summary;
					console.log("success request for " + date + " from wakatime API");
					fetcher.saveToCache(date, summary);
					callback(summary, false);
				});
			}
			if (force) {
				fetch(this);
				return;
			}
			this.loadFromCache(date).then((result) => {
				if (result != undefined) {
					console.log("success request for " + date + " from cache");
					callback(result, true);
					return;
				}
				fetch(this);
			});
		} catch (e) {
			console.error("Display Waka Time: Error requesting WakaTime summary: " + e);
			new Notice('Display Waka Time: Error requesting WakaTime summary: ' + e, 5000);
			callback(undefined, false);
		}
	}

}

class WakaBoxSettingTab extends PluginSettingTab {
	plugin: WakaBoxPlugin;

	constructor(app: App, plugin: WakaBoxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('WakaTime API key')
			.addText(text => text
				.setValue(this.plugin.settings.apiKey)
				.setPlaceholder('Enter your API key')
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
					this.plugin.onGetAPIKey();
				}));
	}
}
