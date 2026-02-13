// NOTE: SETTINGS is "imported" from settings.js in manifest.json

/**
 * # Main.js
 * - Simplify battle language
 */
interceptRequest(async buf => {
	if (SETTINGS.moddedLanguage.enabled) {
		// Replace the battle translation texts
		const langKeyTerm = 'sv.battle":';
		const startIdx = buf.indexOf(langKeyTerm) + langKeyTerm.length;
		buf = replaceObjectWith(startIdx, buf, originalLanguage => {
			const isObj = v => v && v.constructor === Object
			const deepMerge = (a, b) => {
				const out = { ...a };
				for (const [k, v] of Object.entries(b)) {
					if (!(k in out)) {
						console.warn("Something changed in lang, we found a new key", k);
						out[k] = v;
					} else if (isObj(out[k]) && isObj(v)) {
						out[k] = deepMerge(out[k], v);
					}
				}

				return out;
			}
			
			// NOTE: moddedLanguage is "imported" from moddedlanguage.js in manifest.json
			return JSON.stringify(deepMerge(moddedLanguage, originalLanguage));
		});
	}

	if (SETTINGS.mergeNotifications.enabled) {
		// When we receive several tournament notifications at once, merge them into one
		buf = buf.xReplace('onTournamentsPublished(¤t){', `
			$&
			if (¤t.length > 1) {
				const tour = ¤t[0];
				tour.name = tour.name.replace(/\\s[IVX]+(?:\\s|$)/, '') + ' (' + ¤t.length + ' st)';
				tour.id = '';
				¤t = [tour];
			}
		`);
	}

	// Tournaments come over the websocket too, gotta rename them here
	if (SETTINGS.renameTours.enabled) {
		buf = buf.xReplace('onRefreshAvatar(¤t){', `
			onRefreshAvatar(¤t){
				${renameTours.toString()};
				renameTours(¤t.avatar.active_tournaments);
		`);
	}

	if (SETTINGS.showAllGladiators.enabled) {
		// Show all gladiators in the stable, and make the current one not clickable
		buf = buf.xReplace('¤e._l(e.avatars.filter(¤n=>¤n.id!==¤e.avatar.id),function(¤n){return ¤a("div",{key:¤n.id,staticClass:"flex items-center justify-between w-full pb-1 mb-1 border-b border-gray-500 cursor-pointer",on:{click:function(¤r){return ¤e.changeAvatar(¤n)}}}', `
			¤e._l(¤e.avatars, function(¤n) {
				return ¤a("div", {
					key: ¤n.id,
					staticClass: "flex items-center justify-between w-full pb-1 mb-1 border-b border-gray-500",
					class: {
						"cursor-pointer": !¤n.active,
						"font-bold": ¤n.active
					},
					on: {
						click: function(r) {
							if (¤n.active) return;
							return ¤e.changeAvatar(¤n)
						}
					}
				}
		`);

		// For the active gladiator, replace the KP with the text "Aktiv" at 50% transparency
		buf = buf.xReplace('[¤a("span",[¤e._v(¤e._s(¤n.current_hp)+"/"+¤e._s(¤n.max_hp))])', `
			[¤a("span", {class: {"opacity-50": ¤n.active}}, [¤n.active ? ¤e._v('Aktiv') : ¤e._v(¤e._s(¤n.current_hp) + "/" + ¤e._s(¤n.max_hp))])
		`);

		// For the active gladiator, make the name 50% transparent
		buf = buf.xReplace('[¤a("span",{staticClass:"block w-16 h-4 overflow-hidden text-xs font-light font-serif overflow-ellipsis"},[¤e._v(" "+¤e._s(¤n.name)+" ")])', `
			[¤a("span", {
                staticClass: "block w-16 h-4 overflow-hidden text-xs font-light font-serif overflow-ellipsis",
				class: {"opacity-50": ¤n.active}
            }, [¤e._v(" " + ¤e._s(¤n.name) + " ")])
		`);
	}

	// Show another bar for next loads worth of hp
	if (SETTINGS.showNextLoadKP.enabled) {
		buf = buf.xReplace('¤e._e()]),¤a("div",{staticClass:"bg-red-900 absolute left-0 z-[0] h-full transition-[width] duration-500 ease-in rounded",style:`width:${¤e.percentageHp}%`})', `
			¤e._e()]), ¤a("div", {
				staticClass: "bg-red-900 absolute left-0 z-[0] h-full transition-[width] duration-500 ease-in rounded-l",
				class: { 'rounded-r': ¤e.percentageHp > 99 },
				style: 'width:'+¤e.percentageHp+'%'
			}), ¤a("div", {
				staticClass: "bg-red-900 absolute z-[0] h-full ease-in rounded-r",
				class: { 'hidden': ¤e.percentageHp === 100 },
				style: 'left:'+¤e.percentageHp+'%; width:'+Math.min(34, (100-¤e.percentageHp))+'%; opacity: 0.45;'
					// try to get the transitions to mesh with the HP bar transition
					+ ' transition-property: width, left;'
					+ (Math.min(34, (100-¤e.percentageHp)) < 34 ? ''
						+ ' transition-delay: 0s, 0;'
						+ ' transition-duration: 0.05s, 0.5s;'
					: ''
						+ ' transition-delay: 0.5s, 0;'
						+ ' transition-duration: 0.5s, 0.5s;')
			})
		`);
	}

	// Show where 90% is on the KP meter
	if (SETTINGS.show90PercentKP.enabled) {
		buf = buf.xReplace('])]),¤e.hide_info?¤e._e():¤a("div",{staticClass:"my-2 block",attrs:{"data-intro":¤e.trans.get("ui.intro.stats_xp")', `
			,¤a("div", {
				staticClass: "absolute z-[0]",
				style: "height: calc(100% + 6px); border-left: 1px dotted white !important; left: 90%",
			})
			])]), ¤e.hide_info ? ¤e._e() : ¤a("div", {
            staticClass: "my-2 block",
            attrs: {
                "data-intro": ¤e.trans.get("ui.intro.stats_xp")
		`);
	}

	return buf;
}, "build/assets/main*.js");


/**
 * # History API call (viewing match results)
 * - Put the "summary" round up top (less scrolling)
 * - Fixes issues with bola-like effects
 */
interceptRequest(async buf => {
	if (!buf.length) {
		return buf;
	}

	const battle = JSON.parse(buf);
	// NOTE: A few different routes seem to get caught up here, so we check
	// if rounds is defined
	if (battle?.rounds) {
		// This bit merges bola-like effects so they're not so extremely long.
		// It also fixes an issue with text breaks in the middle of the
		// effects.
		for (const round of battle.rounds) {
			if (!SETTINGS.moddedLanguage.enabled) {
				break;
			}

			let startIdx = 0;
			for (sanity = 20; sanity>0; sanity--) {
				startIdx = round.text.findIndex((x, idx) => idx > startIdx && x.key.endsWith('.enchant_debuff_weaponskill_text'));
				if (startIdx !== -1) {
					// try to find all consecutive indices, jumping over breaks
					let indicesToSplice = [];
					let initialDebuff = round.text[startIdx];
					for (let i = startIdx + 1; i < round.text.length; i++) {
						let action = round.text[i];
						if (action.key.endsWith('.break_text_1')) {
							continue;
						}

						// Merge them if it's the same player and value
						if (action.key.endsWith('.enchant_debuff_weaponskill_text') 
							&& action.args.player_one === initialDebuff.args.player_one
							&& action.args.value === initialDebuff.args.value
						) {
							indicesToSplice.push(i);
						} else {
							break;
						}
					}

					// merge all the weaponskills into the first debuff instance
					initialDebuff.args.weaponskill = swedishifyList([
						initialDebuff.args.weaponskill, 
						...indicesToSplice.map(i => round.text[i].args.weaponskill)
					]);

					// Reverse order for easier splicing
					indicesToSplice.reverse();
					for (let index of indicesToSplice) {
						round.text.splice(index, 1);
					}
				} else {
					break;
				}
			}
		}
		
		// NOTE: Don't move around rounds on live fights, breaks stuff
		if (SETTINGS.lastRoundFirst.enabled && !battle.live) {
			// Move the last round first
			battle.rounds.unshift(battle.rounds.pop());
			// ... and reset the order (doesn't seem to matter, but eh)
			battle.rounds.forEach((round, idx) => {
				round.order = idx;
			});
		}

	}

	return JSON.stringify(battle);
}, 'api/battles/*');

/**
 * # Inbound.js (utmaningar)
 * Change sorting to lowest level first (easy pickings!)
 * TODO: Instead change default max grade filter to our level + 3?
 */
interceptRequest(async buf => {
	if (!SETTINGS.reversedChallenges.enabled) {
		return buf;
	}

	return buf.replace('sortByLevelAsc:!1', 'sortByLevelAsc:1');
}, 'build/assets/Inbound-*.js');

/**
 * # NPC API call
 * - Print some extra stats for NPCs
 * - Hide description
 */
interceptRequest(async (buf, details) => {
	let npcId = 'npc_' + details.url.replace(/\D/g, '');
	try {
		const result = JSON.parse(buf);
		if (npcId in npcStats) {
			if (SETTINGS.hideNpcDescription.enabled) {
				// NOTE: When we hide the description, the column becomes 50%
				// on mobile which breaks the layout. So, we force it to be
				// more like desktop layouting with some very dirty descriptors
				// that hopefully only match our intended elements
				result.description = `<style>
					@media (max-width: 767px) {
						/* Force button container to be full width on sm resolutions */
						div:has(> p.text-base.font-semibold.mt-4.mb-2) {
							width: calc(100vw - 35px);
						}

						/* Force the columns to behave like on md resolutions */
						div.text-sm.mt-2:has(> p.italic.mt-2) { width: 50%; }
						div.order-first.flex.flex-col.items-center.mt-2:has(> img.h-auto) { width: 50%; order: 9999 !important }

						/* The fight button must be relatively positioned or
						 * the right half can't be clicked on sm resolutions */
						div.text-sm.mt-2:has(> p.italic.mt-2) > div > div.w-full > button.btn-action.mt-4.w-full {
							position: relative;
						}
					}
				</style>`;
			}

			if (SETTINGS.detailedNpcInfo.enabled) {
				const stats = npcStats[npcId];
				const data = [
					'Slår max ' + stats.dmg,
					'Tål ' + stats.hp + ' KP',
					'Ger upp efter ' + stats.rounds + ' rundor',
				];
				result.description += '<strong style="font-style: normal !important; font-size: 125%;">' + data.join('<br>') + '</strong>';
			}
		}
		buf = JSON.stringify(result);
	} catch (e) {
		console.error("Error in NPC API call!", e);
	}

	return buf;
}, 'api/npcs/*');

/**
 * # users/me API call
 * - Fix order of favorite_links
 * - rename tours (remove numerals, add clock)
 */
interceptRequest(async (buf, details) => {
	// Dunno which request causes it, but sometimes buf is empty here
	if (!buf.length) { 
		return buf;
	}

	try {
		const result = JSON.parse(buf);

		if (SETTINGS.sortFavoriteLinks.enabled) {
			result.favorite_links.sort((a,b) => a.id - b.id);
		}

		if (SETTINGS.renameTours.enabled) {
			renameTours(result.avatar.active_tournaments);
		}

		// Order of avatars.gladiators is weird, always sort by id for now.
		// Best would be to remember which is primary/secondary/tertiary
		if (SETTINGS.showAllGladiators.enabled) {
			result.avatars.sort((a, b) => a.id - b.id);
		}

		buf = JSON.stringify(result);
	} catch (e) {
		console.error("Error in users/me API call!", e, JSON.stringify(buf));
	}

	return buf;
}, 'api/users/me');

/**
 * # avatars/me API call (some sort of refresh call I think?)
 * - rename tours (remove numerals, add clock)
 */
interceptRequest(async (buf, details) => {
	try {
		const result = JSON.parse(buf);

		if (SETTINGS.renameTours.enabled) {
			renameTours(result.active_tournaments);
		}

		buf = JSON.stringify(result);
	} catch (e) {
		console.error("Error in avatars/me API call!", e, JSON.stringify(buf));
	}

	return buf;
}, 'api/avatars/me');

/**
 * # users/me/favoritelinks API call (happens when they change)
 * - Fix order of favorite_links
 */
interceptRequest(async (buf, details) => {
	try {
		const result = JSON.parse(buf);
		if (SETTINGS.sortFavoriteLinks.enabled) {
			result.sort((a,b) => a.id - b.id);
		}
		buf = JSON.stringify(result);
	} catch (e) {
		console.error("Error in users/me/favoritelinks API call!", e);
	}

	return buf;
}, 'api/users/me/favoritelinks');

/**
 * # BattleInfo.js
 * - Implement some behavior for match results
 */
interceptRequest(async (buf, details) => {
	if (SETTINGS.easyMatchResults.enabled) {
		// add some helpers for the below behavior
		// NOTE: file has two vue components, this will actually replace in both
		//       components, not ideal, but... eh
		buf = buf.replace('computed:{', `
			computed:{
				myParticipant() { return this.battle.participants.find(x => x.fighter.id === this.avatar.id); },
				iWon() { return this.myParticipant && this.myParticipant.won; },
				iLost() { return this.myParticipant && !this.myParticipant.won; },
				iGotLoot() { 
					// Matching an action to a player is kind of a pain, since
					// player_two is just the name and has html in it and stuff...
					let dp = new DOMParser();
					return this.battle.rounds.map(x => x.text).flat()
						.filter(x => x.key.includes('loot'))
						.map(x => x.args.player_two)
						.map(x => (dp.parseFromString(x, 'text/html').body.textContent || ''))
						.filter(x => x)
						.find(x => x === this.myParticipant?.fighter?.name);
				},
		`);

		// Add some eye popping "you've won/lost/got loot" alerts
		// TODO: We're not finding e below, could break if it changes name
		buf = buf.xReplace('[¤a===0&&¤t.battle.live', `
			[!¤t.battle.live && ¤a === 0 && ¤t.iWon ? e("div", {
				staticClass: "rounded border bg-green-100 border-green-400 text-green-700 my-2 p-4 text-sm"
			}, [
				¤t._v("Din gladiator vann! Grattis!"),
				¤t.iGotLoot ? e("strong", { staticClass: 'block mt-4 text-lg' }, [¤t._v("Du fick även loot!")]) : ¤t._e()
			]) : ¤t._e(),
			!¤t.battle.live && ¤a === 0 && ¤t.iLost ? e("div", {
				staticClass: "rounded border bg-orange-100 border-orange-400 text-orange-700 my-2 p-4 text-sm"
			}, [
				¤t._v("Din gladiator förlorade :(")
			]) : ¤t._e(),
			¤a===0&&¤t.battle.live
		`);
	}


	if (SETTINGS.lastRoundFirst.enabled) {
		// This bit makes the first round label "Lag x går segrande ur striden!" (except for live fights)
		buf = buf.xReplace(':¤a+1!==¤t.rounds.length||!¤t.battle.finished&&!¤t.isLegacy', `
			:(¤t.battle.live ? (¤a+1!==¤t.rounds.length||!¤t.battle.finished&&!¤t.isLegacy) : (¤a>0||!¤t.battle.finished&&!$2.isLegacy))
		`);

		// This bit ensures ensures following rounds have the right label
		buf = buf.xReplace('displayIndex(¤n){return this.battle.live?¤n:¤n+1', `
			displayIndex(¤n) { return ¤n
		`);
	}

	return buf;
}, 'build/assets/BattleInfo-*');


/**
 * # Beast.js
 * - Bigger warning for outleveled beasts
 */
interceptRequest(async (buf, details) => {
	if (SETTINGS.warnOutleveledBeasts.enabled) {
		buf = buf.xReplace('[¤a("strong",[¤t._v("Vinst: ")]),¤t._v(" "+¤t._s(¤t.trans.get("ui.arena.no_rewards_from_beast"))+" ")]', `
			[¤a("strong", [¤t._v("Vinst: ")]),
			¤a("div", {
				staticClass: "rounded border bg-orange-100 border-orange-400 text-orange-700 my-2 p-4 text-sm",
			}, [¤t._v(¤t._s(¤t.trans.get("ui.arena.no_rewards_from_beast")))])
			]
		`);
	}

	return buf;
}, 'build/assets/Beast-*');


/* * * * * * * * *
 *               *
 * Helpers below *
 *               *
 * * * * * * * * */


/**
 * Helper for intercepting requests
 */
function interceptRequest(callback, routes) {
	browser.webRequest.onBeforeRequest.addListener(
		(details) => {
			const filter = browser.webRequest.filterResponseData(details.requestId);
			const dec = new TextDecoder("utf-8");
			const enc = new TextEncoder();
			let buf = "";
			filter.ondata = (e) => { buf += dec.decode(e.data, {stream: true}); };
			filter.onstop = async () => {
				buf = await callback(buf, details);
				filter.write(enc.encode(buf));
				filter.close();
			};
			return {};
		},
		{urls: (Array.isArray(routes) ? routes : [routes]).map(x => `*://beta.lanista.se/${x}`)},
		["blocking"]
	);
}

/**
 * This is a quick and dirty way to read a JS object from a string (by
 * converting it to JSON as we go), pass it to a callback, and replace the
 * original string with the result of the callback.  It makes some assumptions
 * (like that the js is minified and doesn't contain arrays) but works for our
 * use case
 */
function replaceObjectWith(startIdx, string, replaceCallback) {
	let depth = 0;
	let inString = false;
	let escaping = false;
	let quote = '';
	let json = '';

	for (let i = startIdx; i < string.length; i++) {
		const c = string[i];

		if (inString) {
			if (escaping) {
				escaping = false;
				json += c;
			} else if (c === '\\') {
				escaping = true;
				json += c;
			} else if (c === quote) {
				inString = false;
				json += '"';
			} else if (c === '"') {
				json += '\\"';
			} else {
				json += c;
			}

			continue;
		}

		if (c === '"' || c === "'") {
			inString = true;
			quote = c;
			json += '"';
		} else if (c === '{') {
			depth++;
			json += c + '"';
		} else if (c === ',') {
			json += c + '"';
		} else if (c === ':') {
			json += '"' + c;
		} else if (c === '}') {
			depth--;
			json += c;
			if (depth === 0) {
				return string.replace(
					string.substring(startIdx, i+1),
					replaceCallback(JSON.parse(json)),
				);
			}
		} else {
			json += c;
		}
	}

	throw 'No object found!';
}

/**
 *  A little helper that rewrites ["foo", "bar", "baz"] => "foo, bar och baz"
 */
function swedishifyList(values) {
  const arr = Array.from(values ?? []);
  const n = arr.length;
  if (n === 0) return null;
  if (n === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' och ' + arr[n - 1];
}

/**
 * A little helper to rewrite e.g. Lunchbatalj IX => Lunchbatalj 13:10.
 * Used both in the extension and injected in the client
 */
function renameTours(tours) {
	tours && tours.forEach(tour => {
		// Extract Swedish hh:mm from the UTC datetime
		const time = new Date(tour.start_at.replace(' ', 'T') + 'Z')
			.toLocaleTimeString('sv-SE', {hour: '2-digit', minute: '2-digit', hour12 :false})
		// Remove the roman numerals and add the time
		tour.name = tour.name.replace(/\s[IVX]+(?:\s|$)/, '') + ' ' + time;
	});
}

/*
 * OK, this is a somewhat odd helper. It's to make the job of writing the
 * .js file regexps less cumbersome. What it does is basically help us with:
 * 1. escaping all special chars from the search string, and
 * 2. help us easily replace identifiers (they can change due to minification)
 * We define it as a method on String for simplicity
 */
String.prototype.xReplace = function(searchStr, replaceStr) {
	let regexStr = '';

	// Escape all the special characters in the searchStr
	const escapees = ['-', '.', '\\', '^', '$', '|', '?', '*', '+', '(',
		')', '[', ']', '{', '}'];
	for (const ch of searchStr) {
		if (escapees.includes(ch)) {
			regexStr += '\\';
		}
		regexStr += ch;
	}

	// Replace our placeholders
	const seen = new Map();
	// NOTE: This is NOT exhaustive... js identifier rules are crazy. But I
	//       think this is good enough to catch whatever the minifier will 
	//       throw out as an identifier
	const ident = '[A-Za-z_$][A-Za-z_$0-9]*';
	regexStr = regexStr.replace(new RegExp(`¤(${ident})`, 'g'), (_, name) => {
		if (!seen.has(name)) {
			seen.set(name, true);

			return `(?<${name}>${ident})`;
		}

		return `\\k<${name}>`;
	});

	// and finally we replace the placeholders in the replaceStr
	replaceStr = replaceStr.replace(new RegExp(`¤(${ident})`, 'g'), (_, name) => {
		return `$<${name}>`;
	});

	// now, replace and return!
	return this.replace(new RegExp(regexStr), replaceStr);
};
