const SETTINGS = {
	moddedLanguage: { default: true, enabled: undefined, label: "Förenkla matchspråk", title: "Gör matcher enklare att följa genom att förenkla språket som används" },
	lastRoundFirst: { default: true, enabled: undefined, label: "Visa matchresultat överst", title: "Visa resultatrundan överst i matcher" },
	easyMatchResults: { default: true, enabled: undefined, label: "Visa extra tydligt matchresultat", title: "Visar en grön eller orange ruta längst upp i matcher du själv varit med i, som säger ifall du vann eller förlorade. Den säger även ifall du fick några föremål" },
	reversedChallenges: { default: true, enabled: undefined, label: "Omvänd ordning i utmaningar", title: "Visar utmaningar med lägst grad överst" },
	detailedNpcInfo: { default: true, enabled: undefined, label: "Visa detaljerad info om odjur", title: "Visar en uppskattning av skada/KP/rundor på odjur" },
	hideNpcDescription: { default: true, enabled: undefined, label: "Dölj beskrivning av odjur", title: "Döljer \"originalbeskrivningen\" av odjur" },
	sortFavoriteLinks: { default: true, enabled: undefined, label: "Sortera genvägar äldst först", title: "Fixar sorteringen av genvägar så att de är i ordningen du la till dem" },
	mergeNotifications: { default: true, enabled: undefined, label: "Slå ihop turneringsnotiser", title: "När 13 turneringar släpps samtidigt får man 13 notiser - med denna får man istället en" },
	renameTours: { default: true, enabled: undefined, label: "Lägg klockslag i tournamn i vänstermenyn", title: "Ersätter t.ex. Lunchbatalj IX med Lunchbatalj 13:10 i vänstermenyn" },
};

document.addEventListener("DOMContentLoaded", async () => {
	// Initial setup of state from browser.storage
	const savedState = await browser.storage.local.get(
		Object.fromEntries(Object.keys(SETTINGS).map(k => [k, SETTINGS[k].default]))
	);
	for (const key in SETTINGS) {
		SETTINGS[key].enabled = savedState[key] ?? SETTINGS[key].default;
	}

	const root = document.getElementById("root");
	if (!root) {
		// Bail out in the background script
		return;
	}

	// Add the checkboxes
	for (const key in SETTINGS) {
		const setting = SETTINGS[key];
		const row = document.createElement("div");
		row.title = setting.title;
		const label = document.createElement("label");
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.id = key;
		cb.checked = setting.enabled;
		cb.addEventListener("change", () => {
			return browser.storage.local.set({ [key]: !!cb.checked });
		});
		label.append(cb, " ", setting.label);
		row.appendChild(label);
		root.appendChild(row);
	}
});

// Update state when browser.storage changes
browser.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	for (const [key, { newValue }] of Object.entries(changes)) {
		SETTINGS[key].enabled = !!newValue;
	}
});
