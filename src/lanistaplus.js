// NOTE: SETTINGS is "imported" from settings.js in manifest.json

/**
 * # Main.js
 * - Simplify battle language
 */
interceptRequest(async buf => {
	if (!SETTINGS.moddedLanguage.enabled) {
		return buf;
	}

	// Replace the battle translation texts
	const langKeyTerm = 'sv.battle":';
	const startIdx = buf.indexOf(langKeyTerm) + langKeyTerm.length;
	const modded = replaceObjectWith(startIdx, buf, originalLanguage => {
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

	return modded;
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
		
		if (SETTINGS.lastRoundFirst.enabled) {
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
		buf = JSON.stringify(result);
	} catch (e) {
		console.error("Error in users/me API call!", e);
	}

	return buf;
}, 'api/users/me');


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
