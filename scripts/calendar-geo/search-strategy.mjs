export function isGroupName(name){return /\b(Martyrs|Saints|Synaxis|companions)\b|Мученики|Мучениці|Мученицы|Святі|Святителі|Богоотці|та дочки/i.test(name);}
export function searchVariants(profile) {
  const forms=[];
  const trimTitle=name=>name.replace(/^(Repose of |Translation of the relics of |Uncovering of the relics of )/i,'')
    .replace(/^(Saint |St\. |Venerable |Hieromartyr |Martyr |Greatmartyr |Righteous |Holy |Святий |Святой |Священномученик |Преподобний |Преподобный |Мученик |Мучениця |Великомученик |Велика мучениця |Апостол |Пророк )+/i,'').trim();
  for(const name of [...(profile.names??[]),...(profile.aliases??[])]) {
    if(typeof name!=='string'||!name.trim())continue;
    for(const search of [name.trim(),trimTitle(name),...(!isGroupName(name)?[trimTitle(name).replace(/,.*$/,'').trim()]:[])]) {
      const language=profile.nameLocales?.[name]??(/[іїєґ]/i.test(search)?'uk':/[а-яё]/i.test(search)?'ru':'en');
      if(search&&!forms.some(f=>f.search===search&&f.language===language))forms.push({search,language});
    }
  }
  return forms.slice(0,12);
}
