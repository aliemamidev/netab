// Small offline quote collection (public-domain authors / well-known sayings).

export const QUOTES = {
  en: [
    ["The secret of getting ahead is getting started.", "Mark Twain"],
    ["Well begun is half done.", "Aristotle"],
    ["Energy and persistence conquer all things.", "Benjamin Franklin"],
    ["The journey of a thousand miles begins with one step.", "Lao Tzu"],
    ["Do what you can, with what you have, where you are.", "Theodore Roosevelt"],
    ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Will Durant"],
    ["Knowing is not enough; we must apply.", "Johann Wolfgang von Goethe"],
    ["He who has a why to live can bear almost any how.", "Friedrich Nietzsche"],
    ["The best way out is always through.", "Robert Frost"],
    ["Focus on being productive instead of busy.", "Tim Ferriss"],
    ["You miss 100% of the shots you don't take.", "Wayne Gretzky"],
    ["Stay hungry, stay foolish.", "Stewart Brand"],
    ["Make it work, make it right, make it fast.", "Kent Beck"],
    ["Programs must be written for people to read.", "Harold Abelson"],
    ["First, solve the problem. Then, write the code.", "John Johnson"],
    ["Done is better than perfect.", "Sheryl Sandberg"],
    ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ],
  fa: [
    ["توانا بود هر که دانا بود / ز دانش دل پیر برنا بود", "فردوسی"],
    ["بنی‌آدم اعضای یکدیگرند / که در آفرینش ز یک گوهرند", "سعدی"],
    ["هر کسی کو دور ماند از اصل خویش / باز جوید روزگار وصل خویش", "مولوی"],
    ["این قافله عمر عجب می‌گذرد / دریاب دمی که با طرب می‌گذرد", "خیام"],
    ["تو نیکی می‌کن و در دجله انداز / که ایزد در بیابانت دهد باز", "ضرب‌المثل"],
    ["قطره قطره جمع گردد، وانگهی دریا شود", "ضرب‌المثل"],
    ["کار امروز را به فردا میفکن", "ضرب‌المثل"],
    ["نابرده رنج گنج میسر نمی‌شود / مزد آن گرفت جان برادر که کار کرد", "سعدی"],
    ["دانش اندر دل چراغ روشن است / وز همه بد بر تن تو جوشن است", "رودکی"],
    ["چو فردا شود فکر فردا کنیم", "ضرب‌المثل"],
    ["ز گهواره تا گور دانش بجوی", "ضرب‌المثل"],
    ["دیر رسیدن بهتر از هرگز نرسیدن است", "ضرب‌المثل"],
    ["خواستن، توانستن است", "ضرب‌المثل"],
    ["سحرخیز باش تا کامروا باشی", "ضرب‌المثل"],
    ["کم گوی و گزیده گوی چون دُر / تا ز اندک تو جهان شود پُر", "نظامی"],
    ["هر چه کنی به خود کنی، گر همه نیک و بد کنی", "ضرب‌المثل"],
  ],
};

/** Deterministic quote for a given day so it stays stable across tabs. */
export function quoteOfDay(lang, date = new Date()) {
  const list = QUOTES[lang] || QUOTES.en;
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date - start) / 86400000);
  const [text, author] = list[(day + date.getFullYear()) % list.length];
  return { text, author };
}

export function randomQuote(lang, exclude) {
  const list = (QUOTES[lang] || QUOTES.en).filter(([text]) => text !== exclude);
  const [text, author] = list[Math.floor(Math.random() * list.length)];
  return { text, author };
}
