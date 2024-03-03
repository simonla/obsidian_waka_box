import { App, Notice, Plugin, PluginSettingTab, Setting, request, moment, TFile, normalizePath, Modal } from 'obsidian';
import { Summary } from './model';
import { appHasDailyNotesPluginLoaded, createDailyNote, getAllDailyNotes, getDailyNote } from "obsidian-daily-notes-interface";

// Remember to rename these classes and interfaces!

interface WakaBoxPluginSettings {
	apiKey: string;
	type: string;
	insertAfter: string;
	insertBefore: string;
}

const DEFAULT_SETTINGS: WakaBoxPluginSettings = {
	apiKey: '',
	type: "Language",
	insertAfter: '<!-- start of wakabox -->',
	insertBefore: '<!-- end of wakabox -->'
}

export default class WakaBoxPlugin extends Plugin {
	settings: WakaBoxPluginSettings;
	private summaryFetcher: SummaryDataFetcher | undefined;

	async onload() {
		this.addSettingTab(new WakaBoxSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => {
			this.onLayoutReady();
		});
	}

	onLayoutReady() {
		if (!appHasDailyNotesPluginLoaded()) {
			new Notice('WakaTime box: please enable daily notes plugin.', 5000);
		}
		this.loadSettings().then(() => {
			if (this.settings.apiKey.trim() == '') {
				new Notice('WakaTime box: please enter your API key in the settings.', 5000);
				return;
			}
			this.onGetAPIKey();
		});
	}

	onGetAPIKey() {
		if (this.settings.apiKey.trim() == '') {
			return;
		}
		this.addCommand({
			id: "refresh-today",
			name: "Force refetch today's data",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('WakaTime box: please enter your API key in the settings.', 5000);
					return;
				}
				const date = moment().format("YYYY-MM-DD");
				if (this.summaryFetcher != undefined) {
					this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, true, this.onFetchedSummary);
				}
			}
		})
		this.addCommand({
			id: "refresh-yesterday",
			name: "Force refetch yesterday's data",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('WakaTime box: please enter your API key in the settings.', 5000);
					return;
				}
				const date = moment().subtract(1, 'days').format("YYYY-MM-DD");
				if (this.summaryFetcher != undefined) {
					this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, true, this.onFetchedSummary);
				}
			}
		})
		this.addCommand({
			id: "refresh-manual",
			name: "Fetch specific date's data and copy to clipboard",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('WakaTime box: please enter your API key in the settings.', 5000);
					return;
				}
				new ManualModal(this.app, (result: string) => {
					try {
						const date = moment(result).format("YYYY-MM-DD");
						if (this.summaryFetcher != undefined) {
							this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, true, (summary: Summary | undefined, _: boolean) => {
								if (summary == undefined) {
									console.warn("WakaTime box: no summary data received");
									return;
								}
								const box = this.getBoxText(summary);
								navigator.clipboard.writeText(box).then(() => {
									new Notice("WakaTime box: " + date + " copied to clipboard", 3000);
								});
							});
						}
					} catch (e) {
						new Notice(`WakaTime box: fail due to ${e}`, 5000);
						return;
					}
				}).open();
			}
		})
		this.summaryFetcher = new SummaryDataFetcher(this.app);
		// TODO fetch previous data if open a file from the same day
		const date = moment().format("YYYY-MM-DD");
		this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, false, this.onFetchedSummary);
		const interval = 60 * 60 * 1000;
		this.registerInterval(window.setInterval(() => {
			if (this.summaryFetcher != undefined) {
				const date = moment().format("YYYY-MM-DD");
				this.summaryFetcher.requestWakaTimeSummary(this.settings.apiKey, date, false, this.onFetchedSummary);
			}
		}, interval));
	}

	onunload() {
		this.summaryFetcher = undefined;
	}

	onFetchedSummary = (summary: Summary | undefined, fromCache: boolean) => {
		if (summary == undefined) {
			console.warn("WakaTime box: no summary data received");
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
		if (!fromCache) {
			new Notice("WakaTime box: " + momentDate.format("YYYY-MM-DD") + " refreshed", 5000);
		}
	}

	processDailyNote(file: TFile, summary: Summary, fromCache: boolean) {
		console.log("refreshing daily note. fromCache: " + fromCache + ", file: " + file.name);
		this.app.vault.process(file, (data: string) => {
			let box = this.getBoxText(summary);
			const exists = data.includes("```wakatime");
			const existsAfter = data.indexOf(this.settings.insertAfter)
			const existsBefore = data.indexOf(this.settings.insertBefore)
			if (exists) {
				data = data.replace(/```wakatime[\s\S]*```/g, box);
			} else if(existsAfter != -1 && existsBefore != -1) {
				let boxText = `${this.settings.insertAfter}\n\n${box}\n\n${this.settings.insertBefore}`;
				data = data.replace(RegExp(`${this.settings.insertAfter}[\\s\\S]*${this.settings.insertBefore}`, "g"), boxText);
			} else{
				data += box;
			}
			return data;
		});
	}

	private getBoxText(summary: Summary) {
		let box = "";
		box += "```wakatime";
		box += "\n";
		let count = 0;
		let maxNameLength = 0;
		let maxTextLength = 0;
		let maxPercentLength = 0;
		let data;

		switch (this.settings.type) {
			case "Language":
				data = summary.data[0].languages;
				break;
			case "Machine":
				data = summary.data[0].machines;
				break;
			case "OperatingSystem":
				data = summary.data[0].operating_systems;
				break;
			case "Project":
				data = summary.data[0].projects;
				break;
			default:
				data = summary.data[0].languages;
		}

		data.forEach((language) => {
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
		data.forEach((language) => {
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
		box += "```";
		return box;
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
			console.error("WakaTime box: Error loading WakaTime summary from cache: " + e);
		}
		return undefined;
	}

	async saveToCache(cacheKey: String, summary: Summary) {
		try {
			await this.app.vault.adapter.write(normalizePath(this.cacheDir + "/" + cacheKey), JSON.stringify(summary));
		} catch (e) {
			console.error("WakaTime box: Error saving WakaTime summary to cache: " + e);
		}
	}

	async fetchViaAPI(url: string, date: string): Promise<Summary | undefined> {
		console.log("start request for " + date);
		try {
			const result = await request(url);
			const summary = JSON.parse(result) as Summary;
			console.log("success request for " + date + " from wakatime API");
			this.saveToCache(date, summary);
			return summary;
		} catch (error) {
			console.error("WakaTime box: error requesting WakaTime summary: " + error);
			new Notice('WakaTime box: error requesting WakaTime summary: ' + error, 5000);
			return undefined;
		}
	}

	// read cache or fetch data from wakatime
	async requestWakaTimeSummary(apiKey: String, date: string, force: boolean, callback: (summary: Summary | undefined, fromCache: boolean) => void) {
		const baseUrl = "https://wakatime.com/api/v1/users/current/summaries"
		const url = baseUrl + "?start=" + date + "&end=" + date + "&api_key=" + apiKey;
		try {
			if (force) {
				const result = await this.fetchViaAPI(url, date);
				callback(result, false);
				return;
			}
			const cacheResult = await this.loadFromCache(date);
			if (cacheResult != undefined) {
				console.log("success request for " + date + " from cache");
				callback(cacheResult, true);
				return;
			}
			const apiResult = await this.fetchViaAPI(url, date);
			callback(apiResult, false);
		} catch (e) {
			console.error("WakaTime box: error requesting WakaTime summary: " + e);
			new Notice('WakaTime box: error requesting WakaTime summary: ' + e, 5000);
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


		new Setting(containerEl)
			.setName("Display Type")
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					Language: "Language",
					Machine: "Machine",
					OperatingSystem: "OperatingSystem",
					Project: "Project",
				});
				return dropdown
					.setValue(this.plugin.settings.type)
					.onChange(async (value) => {
						this.plugin.settings.type = value;
						await this.plugin.saveSettings();
						this.plugin.onGetAPIKey();
					});
			});

		new Setting(this.containerEl)
			.setName('Insert Between')
			.setDesc(
				'Please fill in the range where you want to insert your reading notes in the Daily Notes, remember to modify the Daily Notes template before use 💥Note: The content within the range will be overwritten, so please do not modify the content within the range.'
			)
			.addText((input) => {
				input
					.setValue(this.plugin.settings.insertAfter)
					.onChange(async (value: string) => {
						this.plugin.settings.insertAfter = value;
						await this.plugin.saveSettings();
						this.plugin.onGetAPIKey();
				});
			})
			.addButton((btn) => {
				return (btn.setButtonText('to').buttonEl.style.borderStyle = 'none');
			})
			.addText((input) => {
				input
					.setValue(this.plugin.settings.insertBefore)
					.onChange(async (value: string) => {
						this.plugin.settings.insertBefore = value;
						await this.plugin.saveSettings();
						this.plugin.onGetAPIKey();
				});
			});
	}
}

export class ManualModal extends Modal {
	onResult: (result: string) => void;
	result: string = "";

	constructor(app: App, onResult: (result: string) => void) {
		super(app);
		this.onResult = onResult;
	}

	onOpen() {
		let { contentEl } = this;
		contentEl.createEl("h1", { text: "Manual fetch WakaTime box" });

		new Setting(contentEl)
			.setName("Enter the date you want to fetch")
			.setDesc("Format: YYYY-MM-DD")
			.addText((text) => {
				const date = moment().format("YYYY-MM-DD");
				text.setValue(date);
				text.onChange((value) => {
					this.result = value
				})
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Submit")
					.setCta()
					.onClick(() => {
						this.close();
						this.onResult(this.result);
					}));
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}
