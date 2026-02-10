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
		buf = buf.replace(/onTournamentsPublished\(([^\)]*)\)\{/, `
			$&
			if ($1.length > 1) {
				const tour = $1[0];
				tour.name = tour.name.replace(/\\s[IVX]+(?:\\s|$)/, '') + ' (' + $1.length + ' st)';
				tour.id = '';
				$1 = [tour];
			}
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
 */
interceptRequest(async (buf, details) => {
	try {
		const result = JSON.parse(buf);

		if (SETTINGS.sortFavoriteLinks.enabled) {
			result.favorite_links.sort((a,b) => a.id - b.id);
		}

		if (SETTINGS.renameTours.enabled) {
			result.avatar.active_tournaments.forEach(tour => {
				// Extract Swedish hh:mm from the UTC datetime
				const time = new Date(tour.start_at.replace(' ', 'T') + 'Z')
					.toLocaleTimeString('sv-SE', {hour: '2-digit', minute: '2-digit', hour12 :false})
				// Remove the roman numerals and add the time
				tour.name = tour.name.replace(/\s[IVX]+(?:\s|$)/, '') + ' ' + time;
			});
		}

		buf = JSON.stringify(result);
	} catch (e) {
		console.error("Error in users/me API call!", e, JSON.stringify(buf));
	}

	return buf;
}, 'api/users/me');

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
		buf = buf.replace(/\[([^=\[]+)===0&&([^&\.]+)\.battle\.live/, `
			[!$2.battle.live && $1 === 0 && $2.iWon ? e("div", {
				staticClass: "rounded border bg-green-100 border-green-400 text-green-700 my-2 p-4 text-sm"
			}, [
				$2._v("Din gladiator vann! Grattis!"),
				$2.iGotLoot ? e("strong", { staticClass: 'block mt-4 text-lg' }, [$2._v("Du fick även loot!")]) : $2._e()
			]) : $2._e(),
			!$2.battle.live && $1 === 0 && $2.iLost ? e("div", {
				staticClass: "rounded border bg-orange-100 border-orange-400 text-orange-700 my-2 p-4 text-sm"
			}, [
				$2._v("Din gladiator förlorade :(")
			]) : $2._e(),
			$1===0&&$2.battle.live
		`);
	}


	if (SETTINGS.lastRoundFirst.enabled) {
		// This bit makes the first round label "Lag x går segrande ur striden!" (except for live fights)
		buf = buf.replace(/:([^:\+]+)\+1!==([^=\.]+)\.rounds\.length\|\|!\2\.battle\.finished&&!\2\.isLegacy/, `
			:($2.battle.live ? ($1+1!==$2.rounds.length||!$2.battle.finished&&!$2.isLegacy) : ($1>0||!$2.battle.finished&&!$2.isLegacy))
		`);

		// This bit ensures ensures following rounds have the right label
		buf = buf.replace(/displayIndex\(([^\(\)]+)\){return this\.battle\.live\?\1:\1\+1/, `
			displayIndex($1) { return $1
		`);
	}

	return buf;
}, 'build/assets/BattleInfo-*');


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
