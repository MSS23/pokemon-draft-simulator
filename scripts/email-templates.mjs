export const SUBJECT = 'A question about DraftPokemon'

export function buildEmail({ firstName }) {
  const greeting = firstName?.trim() ? `Hey ${firstName.trim()},` : 'Hey,'

  const text = `${greeting}

I'm Manraj — I build DraftPokemon. Thanks for using it.

I started it because running a draft league out of a spreadsheet was miserable: broken formulas, missed picks, and the eternal "whose turn is it?" argument. If it's saved you even one of those, that's the whole point.

So here's the reason I'm writing: what's the one thing you wish DraftPokemon did that it doesn't? Hit reply — it comes straight to me and I read every one. Same goes if something's broken.

Two other things I've built, in case they're useful to you:

VGC Team Report (https://pokemonvgcteamreport.com) — a blog-style home for team reports. Write up a team, share it publicly or just with friends, and browse what other players are running.

RunLocke (https://runlocke.com) — a tracker for Nuzlocke and Kaizo runs. Log your team, deaths, and progress, use the fight planner when you're stuck, and put a finished run in the Hall of Fame. Good for the gap when your league season ends.

And if DraftPokemon has made your season easier, mentioning it to another commissioner helps more than anything else I could ask for.

Cheers,
Manraj
https://manrajssidhu.com`

  const html = `<p>${greeting}</p>
<p>I'm Manraj — I build <a href="https://draftpokemon.com">DraftPokemon</a>. Thanks for using it.</p>
<p>I started it because running a draft league out of a spreadsheet was miserable: broken formulas, missed picks, and the eternal "whose turn is it?" argument. If it's saved you even one of those, that's the whole point.</p>
<p>So here's the reason I'm writing: what's the one thing you wish DraftPokemon did that it doesn't? Hit reply — it comes straight to me and I read every one. Same goes if something's broken.</p>
<p>Two other things I've built, in case they're useful to you:</p>
<p><a href="https://pokemonvgcteamreport.com"><strong>VGC Team Report</strong></a> — a blog-style home for team reports. Write up a team, share it publicly or just with friends, and browse what other players are running.</p>
<p><a href="https://runlocke.com"><strong>RunLocke</strong></a> — a tracker for Nuzlocke and Kaizo runs. Log your team, deaths, and progress, use the fight planner when you're stuck, and put a finished run in the Hall of Fame. Good for the gap when your league season ends.</p>
<p>And if DraftPokemon has made your season easier, mentioning it to another commissioner helps more than anything else I could ask for.</p>
<p>Cheers,<br>Manraj<br><a href="https://manrajssidhu.com">manrajssidhu.com</a></p>`

  return { text, html }
}
