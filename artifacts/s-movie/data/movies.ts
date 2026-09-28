export type ImageSource = number | { uri: string };

export type Episode = {
  id: string;
  number: number;
  title: string;
  description: string;
  duration: string;
  thumbnail: ImageSource;
};

export type Movie = {
  id: string;
  title: string;
  poster: ImageSource;
  hero?: ImageSource;
  year: number;
  rating: string;
  duration: string;
  genres: string[];
  cast: string[];
  director: string;
  synopsis: string;
  isTop10?: boolean;
  top10Rank?: number;
  dominantColor?: string;
  releaseDate?: string;
  episodes?: Episode[];
  videoUrl?: string;
  tmdbRating?: number;
  tmdbId?: number;
  mediaType?: "movie" | "tv";
  seasons?: number;
  /** Optional Netflix-style metadata capabilities shown beneath the title. */
  metadata?: {
    quality?: string;
    spatialAudio?: boolean;
    audioDescription?: boolean;
    closedCaptions?: boolean;
  };
  /** Live TMDB popularity score — used for Top 10 ranking and the
   *  popularity-weighted category shuffle (see lib/badgeUtils.ts). */
  popularity?: number;
};

/** Controlled source marker required for any title allowed into the home Hero Banner. */
export type HeroBannerSource = "netflix" | "india" | "viki";
export type HeroBannerMovie = Movie & {
  heroSource: HeroBannerSource;
};

// Kept as a compatibility alias for older callers and cached data migrations.
export type NetflixHeroMovie = HeroBannerMovie;

export function isHeroBannerMovie(movie: Movie): movie is HeroBannerMovie {
  const source = (movie as Partial<HeroBannerMovie>).heroSource;
  return source === "netflix" || source === "india" || source === "viki";
}

export const isNetflixHeroMovie = isHeroBannerMovie;

const IMG_CDN = "https://image.tmdb.org/t/p";
// wsrv.nl = same CDN as weserv.nl, Cloudflare-backed, NOT blocked on Indian ISPs
const WSRV = "https://wsrv.nl/?url=";

function weserv(directUrl: string): string {
  return `${WSRV}${encodeURIComponent(directUrl)}&output=webp&q=85`;
}

const tmdb = (path: string): ImageSource => ({
  uri: weserv(`${IMG_CDN}/w780${path}`),
});
const tmdbW780 = (path: string): ImageSource => ({
  uri: weserv(`${IMG_CDN}/w780${path}`),
});

const LOCAL = {
  hero: require("@/assets/images/hero.png"),
  p1: require("@/assets/images/poster1.png"),
  p2: require("@/assets/images/poster2.png"),
  p3: require("@/assets/images/poster3.png"),
  p4: require("@/assets/images/poster4.png"),
  p5: require("@/assets/images/poster5.png"),
  p6: require("@/assets/images/poster6.png"),
  p7: require("@/assets/images/poster7.png"),
  p8: require("@/assets/images/poster8.png"),
};

const M = (
  id: string,
  title: string,
  poster: ImageSource,
  year: number,
  duration: string,
  genres: string[],
  cast: string[],
  director: string,
  synopsis: string,
  rating = "TV-MA",
  dominantColor = "#1a1a2e",
): Movie => ({ id, title, poster, year, rating, duration, genres, cast, director, synopsis, dominantColor });

const mkEpisodes = (seriesId: string, count: number, posterPath: string): Episode[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${seriesId}-ep-${i + 1}`,
    number: i + 1,
    title: [
      "The Beginning", "Into the Unknown", "Shadow's Edge", "Breaking Point", "Revelations",
      "The Reckoning", "Blood & Steel", "No Way Out", "The Last Stand", "Ashes",
      "Resurrection", "New World", "Final Hour", "The Aftermath", "Reborn",
    ][i] ?? `Episode ${i + 1}`,
    description: [
      "The story begins as our heroes face an unexpected crisis that will change everything.",
      "Deep into uncharted territory, secrets from the past resurface with deadly consequences.",
      "A fragile alliance is tested when betrayal strikes from within.",
      "Pushed to the limit, every choice carries irreversible weight.",
      "The truth behind the conspiracy is finally laid bare.",
      "Justice collides with survival in an explosive confrontation.",
      "Bonds of loyalty are forged and broken under pressure.",
      "With no escape route, desperate measures become necessary.",
      "All roads lead to a battle that will define the future.",
      "When the smoke clears, nothing will ever be the same.",
      "Against all odds, hope emerges from the ruins.",
      "A new chapter begins — more dangerous than the last.",
      "The clock runs out as the final gambit unfolds.",
      "Survivors pick up the pieces of a shattered world.",
      "Transformed by fire, a legend is born.",
    ][i] ?? "An unmissable chapter in an epic saga.",
    duration: `${38 + (i % 5) * 7}m`,
    thumbnail: { uri: weserv(`${IMG_CDN}/w300${posterPath}`) },
  }));

// ====== 2026 Originals & Featured ======
export const HERO_MOVIE: Movie = {
  id: "tmdb-ddbl",
  tmdbId: 204541,
  mediaType: "tv",
  title: "DAREDEVIL: BORN AGAIN",
  poster: tmdb("/AmBKRhCzHBfL3Pg0eYHqPAXgV8.jpg"),
  hero: tmdbW780("/nFvC94X9v0V06dJkUaXmGZ7b8W.jpg"),
  year: 2025,
  rating: "TV-MA",
  duration: "1 Season",
  genres: ["Action", "Crime", "Superhero"],
  cast: ["Charlie Cox", "Vincent D'Onofrio", "Deborah Ann Woll", "Elden Henson"],
  director: "Dario Scardapane",
  synopsis:
    "Matt Murdock and Wilson Fisk — Daredevil and Kingpin — both emerge with a new sense of purpose in the dark streets of Hell's Kitchen. As their pasts collide with a new era of crime, the Devil of Hell's Kitchen must decide what it truly means to be a hero.",
  isTop10: true,
  top10Rank: 1,
  dominantColor: "#0d0d1a",
};

const FEATURED_HEROES: Movie[] = [
  HERO_MOVIE,
];

// ====== 2026 New Hits ======
const IF_WISHES = M(
  "tmdb-iwck",
  "If Wishes Could Kill",
  tmdb("/xMSmorXmLqTMTCQzNtK6hSFtcLK.jpg"),
  2026,
  "1 Season",
  ["Thriller", "Mystery", "Drama"],
  ["Suranne Jones", "Rupert Graves", "Jodie Comer"],
  "John Griffin",
  "When a woman's darkest wish suddenly comes true, she finds herself entangled in a deadly web of secrets, lies, and unintended consequences that spiral out of control.",
  "TV-MA",
  "#1a0a0a",
);
const DAREDEVIL_BORN = M(
  "tmdb-ddbl-r",
  "Daredevil: Born Again",
  tmdb("/AmBKRhCzHBfL3Pg0eYHqPAXgV8.jpg"),
  2025,
  "1 Season",
  ["Action", "Crime", "Superhero"],
  ["Charlie Cox", "Vincent D'Onofrio", "Deborah Ann Woll"],
  "Dario Scardapane",
  "Matt Murdock and Wilson Fisk — Daredevil and Kingpin — both emerge with a new sense of purpose in the dark streets of Hell's Kitchen.",
  "TV-MA",
  "#0d0d1a",
);
const ANDOR_S2 = M(
  "tmdb-and2",
  "Andor: Season 2",
  tmdb("/59SVNwLfoMnZPPB6ukW6dlPxAdI.jpg"),
  2025,
  "1 Season",
  ["Sci-Fi", "Action", "Drama"],
  ["Diego Luna", "Stellan Skarsgård", "Faye Marsay"],
  "Tony Gilroy",
  "The Rebellion is growing. Cassian Andor's journey toward becoming a war hero reaches its most dangerous and decisive phase.",
  "TV-14",
  "#0a0e1a",
);
const WEDNESDAY_S2 = M(
  "tmdb-wed2",
  "Wednesday: Season 2",
  tmdb("/1Byt5JiGrBBg1N3uSg5D9HkVJkm.jpg"),
  2025,
  "1 Season",
  ["Mystery", "Comedy", "Supernatural"],
  ["Jenna Ortega", "Emma Myers", "Hunter Doohan", "Catherine Zeta-Jones"],
  "Tim Burton",
  "Wednesday Addams returns to Nevermore Academy. New monsters, new mysteries — and someone far darker than last time is pulling the strings.",
  "TV-14",
  "#0d0a1a",
);
const ATLAS = M(
  "tmdb-atlas",
  "Atlas",
  tmdb("/bcM2Tl5HlsvPBnL8DKP9Ie6vU4r.jpg"),
  2025,
  "2h 0m",
  ["Sci-Fi", "Action", "Thriller"],
  ["Jennifer Lopez", "Simu Liu", "Sterling K. Brown"],
  "Brad Peyton",
  "A brilliant analyst with a deep distrust of AI teams up with a robot to stop a rogue AI intent on destroying humanity.",
  "PG-13",
  "#0a1a2e",
);
const REBEL_MOON_3 = M(
  "tmdb-rm3",
  "Rebel Moon – Part Three",
  tmdb("/ui4DrH1cKk2vkHFy5bOSRVABmKs.jpg"),
  2026,
  "2h 15m",
  ["Sci-Fi", "Action", "Adventure"],
  ["Sofia Boutella", "Michiel Huisman", "Djimon Hounsou"],
  "Zack Snyder",
  "The warriors of Veldt unite for a final stand against the Motherworld. Freedom costs everything.",
  "R",
  "#1a0a0a",
);
const EXTRACTION_3 = M(
  "tmdb-ext3",
  "Extraction 3",
  tmdb("/7gKI9hpEMcZpsA5dBtXbHPeOBTf.jpg"),
  2026,
  "2h 5m",
  ["Action", "Thriller", "Crime"],
  ["Chris Hemsworth", "Golshifteh Farahani", "Adam Bessa"],
  "Sam Hargrave",
  "Tyler Rake returns for the most dangerous mission yet — an impossible extraction from a fortress no one has ever escaped.",
  "R",
  "#0a1a0a",
);
const THE_DIPLOMAT_S2 = M(
  "tmdb-dipl2",
  "The Diplomat: Season 2",
  tmdb("/lwOLCp99gfkFJGsHiMGQGaVaGQT.jpg"),
  2024,
  "1 Season",
  ["Drama", "Thriller", "Political"],
  ["Keri Russell", "Rufus Sewell", "David Gyasi"],
  "Debora Cahn",
  "US Ambassador Kate Wyler navigates the fall-out from a shocking act of political violence — while her own marriage becomes a dangerous liability.",
  "TV-MA",
  "#1a140a",
);
const SQUID_GAME_S3 = M(
  "tmdb-sg3",
  "Squid Game: Season 3",
  tmdb("/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg"),
  2025,
  "1 Season",
  ["Thriller", "Drama", "Korean"],
  ["Lee Jung-jae", "Lee Byung-hun", "Wi Ha-joon"],
  "Hwang Dong-hyuk",
  "The games are back — deadlier and more depraved than ever. Player 456 becomes the Front Man and must decide the fate of hundreds.",
  "TV-MA",
  "#0f1a0a",
);

// ====== Global Hits ======
const STRANGER_THINGS = M(
  "tmdb-st",
  "Stranger Things",
  tmdb("/49WJfeN0moxb9IPfGn8AIqMGskD.jpg"),
  2022, "4 Seasons",
  ["Sci-Fi", "Mystery", "Drama"],
  ["Millie Bobby Brown", "Finn Wolfhard", "David Harbour", "Winona Ryder"],
  "The Duffer Brothers",
  "When a young boy vanishes, his friends, family and local police are drawn into a mystery involving secret experiments, supernatural forces and a strange little girl.",
  "TV-14", "#1a0e2e",
);
const WEDNESDAY = M(
  "tmdb-wed",
  "Wednesday",
  tmdb("/9PFonBhy4cQy7Jz20NpMygczOkv.jpg"),
  2022, "1 Season",
  ["Mystery", "Comedy", "Supernatural"],
  ["Jenna Ortega", "Hunter Doohan", "Emma Myers", "Catherine Zeta-Jones"],
  "Tim Burton",
  "Smart, sarcastic and a little dead inside, Wednesday Addams investigates a murderous monster while making new friends — and foes — at Nevermore Academy.",
  "TV-14", "#0d0a1a",
);
const SQUID_GAME = {
  ...M(
    "tmdb-sg",
    "Squid Game",
    tmdb("/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg"),
    2021, "2 Seasons",
    ["Thriller", "Drama", "Korean"],
    ["Lee Jung-jae", "Park Hae-soo", "Wi Ha-joon", "HoYeon Jung"],
    "Hwang Dong-hyuk",
    "Hundreds of cash-strapped players accept a strange invitation to compete in children's games for a tempting prize — but the stakes are deadly.",
    "TV-MA", "#0f1a0a",
  ),
  episodes: mkEpisodes("tmdb-sg", 9, "/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg"),
};
const THE_WITCHER = M(
  "tmdb-witcher",
  "The Witcher",
  tmdb("/cZ0d3rtvXPVvuiX22sP79K3Hmjz.jpg"),
  2023, "3 Seasons",
  ["Fantasy", "Adventure", "Action"],
  ["Henry Cavill", "Anya Chalotra", "Freya Allan"],
  "Lauren Schmidt Hissrich",
  "Geralt of Rivia, a solitary monster hunter, struggles to find his place in a world where people often prove more wicked than beasts.",
  "TV-MA", "#0d1a0a",
);
const MONEY_HEIST = M(
  "tmdb-mh",
  "Money Heist",
  tmdb("/reEMJA1uzscCbkpeRJeTT2bjqUp.jpg"),
  2021, "5 Parts",
  ["Crime", "Thriller", "Drama"],
  ["Úrsula Corberó", "Álvaro Morte", "Itziar Ituño"],
  "Álex Pina",
  "Eight thieves take hostages and lock themselves in the Royal Mint of Spain as a criminal mastermind manipulates the police to carry out his plan.",
  "TV-MA", "#1a0a0a",
);
const PEAKY_BLINDERS = M(
  "tmdb-pb",
  "Peaky Blinders",
  tmdb("/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg"),
  2022, "6 Seasons",
  ["Crime", "Drama", "Period"],
  ["Cillian Murphy", "Paul Anderson", "Sophie Rundle"],
  "Steven Knight",
  "A notorious gang in 1919 Birmingham is led by the fierce Tommy Shelby, a crime boss set on moving up in the world no matter the cost.",
  "TV-MA", "#1a1000",
);
const LUPIN = M(
  "tmdb-lupin",
  "Lupin",
  tmdb("/sgxawbFB5Vi5OkPWQLNfl3dvkNJ.jpg"),
  2021, "3 Parts",
  ["Crime", "Mystery", "French"],
  ["Omar Sy", "Ludivine Sagnier", "Antoine Gouy"],
  "George Kay",
  "Inspired by the adventures of Arsène Lupin, gentleman thief Assane Diop sets out to avenge his father for an injustice inflicted by a wealthy family.",
  "TV-MA", "#0a1a1a",
);
const THE_CROWN = M(
  "tmdb-crown",
  "The Crown",
  tmdb("/1M876KPjulVwppEpldhdc8V4o68.jpg"),
  2023, "6 Seasons",
  ["Drama", "History", "Royal"],
  ["Imelda Staunton", "Olivia Colman", "Claire Foy"],
  "Peter Morgan",
  "This drama follows the political rivalries and romance of Queen Elizabeth II's reign and the events that shaped the second half of the 20th century.",
  "TV-MA", "#1a1400",
);
const DARK = M(
  "tmdb-dark",
  "Dark",
  tmdb("/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg"),
  2020, "3 Seasons",
  ["Mystery", "Sci-Fi", "Thriller"],
  ["Louis Hofmann", "Karoline Eichhorn", "Lisa Vicari"],
  "Baran bo Odar",
  "A missing child sets four families on a frantic hunt for answers as they unearth a mind-bending mystery that spans three generations.",
  "TV-MA", "#0d1a1a",
);
const BRIDGERTON = M(
  "tmdb-brid",
  "Bridgerton",
  tmdb("/luoKpgVwi1E5nQsi7W0UuKHu2Rq.jpg"),
  2024, "3 Seasons",
  ["Romance", "Drama", "Period"],
  ["Nicola Coughlan", "Luke Newton", "Jonathan Bailey"],
  "Chris Van Dusen",
  "The eight close-knit Bridgerton siblings of London's high society look for love and happiness in the competitive marriage market.",
  "TV-MA", "#1a0a14",
);
const ARCANE = {
  ...M(
    "tmdb-arc",
    "Arcane",
    tmdb("/abf8tHznhSvl9BAElD2cQeRr7do.jpg"),
    2024, "2 Seasons",
    ["Animation", "Action", "Drama"],
    ["Hailee Steinfeld", "Ella Purnell", "Kevin Alejandro"],
    "Christian Linke",
    "Amid the stark discord of twin cities Piltover and Zaun, two sisters fight on rival sides of a war between magic technologies and clashing convictions.",
    "TV-14", "#1a0a2e",
  ),
  episodes: mkEpisodes("tmdb-arc", 9, "/abf8tHznhSvl9BAElD2cQeRr7do.jpg"),
};
const HOUSE_OF_DRAGON = M(
  "tmdb-hotd",
  "House of the Dragon",
  tmdb("/z2yahl2uefxDCl0nogcRBstwruJ.jpg"),
  2024, "2 Seasons",
  ["Fantasy", "Drama", "Action"],
  ["Paddy Considine", "Matt Smith", "Olivia Cooke"],
  "Ryan Condal",
  "The Targaryen dynasty is at the absolute apex of its power, with more than 15 dragons under their yoke. Most empires crumble from such heights.",
  "TV-MA", "#1a0a0a",
);
const LAST_OF_US = {
  ...M(
    "tmdb-tlou",
    "The Last of Us",
    tmdb("/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg"),
    2023, "2 Seasons",
    ["Drama", "Sci-Fi", "Apocalyptic"],
    ["Pedro Pascal", "Bella Ramsey", "Anna Torv"],
    "Craig Mazin",
    "Twenty years after modern civilization has been destroyed, Joel, a hardened survivor, is hired to smuggle Ellie, a 14-year-old girl, out of an oppressive quarantine zone.",
    "TV-MA", "#0f1a0a",
  ),
  episodes: mkEpisodes("tmdb-tlou", 9, "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg"),
};
const BREAKING_BAD = M(
  "tmdb-bb",
  "Breaking Bad",
  tmdb("/ggFHVNu6YYI5L9pCfOacjizRGt.jpg"),
  2013, "5 Seasons",
  ["Crime", "Drama", "Thriller"],
  ["Bryan Cranston", "Aaron Paul", "Anna Gunn"],
  "Vince Gilligan",
  "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine to secure his family's future.",
  "TV-MA", "#0d1a0a",
);
const BETTER_CALL_SAUL = M(
  "tmdb-bcs",
  "Better Call Saul",
  tmdb("/fC2HDm5t0kHl7mTm7jxMR31b7by.jpg"),
  2022, "6 Seasons",
  ["Crime", "Drama", "Legal"],
  ["Bob Odenkirk", "Rhea Seehorn", "Jonathan Banks"],
  "Vince Gilligan",
  "The trials and tribulations of criminal lawyer Jimmy McGill in the years leading up to his fateful run-in with Walter White and Jesse Pinkman.",
  "TV-MA", "#1a1000",
);
const QUEENS_GAMBIT = M(
  "tmdb-qg",
  "The Queen's Gambit",
  tmdb("/zU0htwkhNvBQdVSIKB9s6hgVeFK.jpg"),
  2020, "Limited Series",
  ["Drama", "Period", "Sport"],
  ["Anya Taylor-Joy", "Marielle Heller", "Thomas Brodie-Sangster"],
  "Scott Frank",
  "In a 1950s orphanage, a young girl reveals an astonishing talent for chess and embarks on an unlikely journey to stardom while grappling with addiction.",
  "TV-14", "#0a0a1a",
);
const OZARK = M(
  "tmdb-ozark",
  "Ozark",
  tmdb("/pCGyPVrI9Fzw6rE1Pb3hfWsOJmj.jpg"),
  2022, "4 Seasons",
  ["Crime", "Drama", "Thriller"],
  ["Jason Bateman", "Laura Linney", "Sofia Hublitz"],
  "Bill Dubuque",
  "A financial advisor drags his family from Chicago to the Missouri Ozarks, where he must launder $500 million in five years to appease a drug lord.",
  "TV-MA", "#0a1a0a",
);
const SUCCESSION = M(
  "tmdb-succ",
  "Succession",
  tmdb("/e2X8o0BGUCFv5RhZPkdIBuBFJvk.jpg"),
  2023, "4 Seasons",
  ["Drama", "Satire", "Thriller"],
  ["Brian Cox", "Jeremy Strong", "Sarah Snook", "Kieran Culkin"],
  "Jesse Armstrong",
  "The Roy family controls one of the biggest media and entertainment conglomerates in the world. But who will take over when their aging patriarch steps back?",
  "TV-MA", "#1a1400",
);
const SEVERANCE = {
  ...M(
    "tmdb-sev",
    "Severance",
    tmdb("/tPBnI5JMLrUmAcrmKFr6MIvN1JY.jpg"),
    2024, "2 Seasons",
    ["Sci-Fi", "Mystery", "Thriller"],
    ["Adam Scott", "Zach Cherry", "Britt Lower", "Tramell Tillman"],
    "Dan Erickson",
    "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. When Mark finds himself embroiled in a conspiracy, he begins to question the true nature of his work.",
    "TV-MA", "#0a1a1a",
  ),
  episodes: mkEpisodes("tmdb-sev", 9, "/tPBnI5JMLrUmAcrmKFr6MIvN1JY.jpg"),
};
const TRUE_DETECTIVE = M(
  "tmdb-td",
  "True Detective: Night Country",
  tmdb("/9ZFDdDvJZuHxnsmrKTfF5GNnEDA.jpg"),
  2024, "4 Seasons",
  ["Crime", "Mystery", "Drama"],
  ["Jodie Foster", "Kali Reis", "Christopher Eccleston"],
  "Issa López",
  "When the long winter night falls in Alaska, the lives of the staff at the Tsalal Arctic Research Station are at stake — and two detectives must confront the darkness they carry inside.",
  "TV-MA", "#0a1014",
);

// ====== Indian Content ======
const RRR = M(
  "tmdb-rrr",
  "RRR",
  tmdb("/nEufeZlyAOLqO2brrs0yeF1lgXO.jpg"),
  2022, "3h 7m",
  ["Action", "Drama", "Indian"],
  ["N. T. Rama Rao Jr.", "Ram Charan", "Ajay Devgn"],
  "S. S. Rajamouli",
  "A fearless revolutionary and an officer of the British Raj begin an extraordinary journey of friendship and freedom, on the eve of the Indian uprising.",
  "TV-MA", "#1a0a00",
);
const THREE_IDIOTS = M(
  "tmdb-3i",
  "3 Idiots",
  tmdb("/66A9MqXOyVFCssoloscw79z8Tew.jpg"),
  2009, "2h 50m",
  ["Comedy", "Drama", "Indian"],
  ["Aamir Khan", "R. Madhavan", "Sharman Joshi", "Kareena Kapoor"],
  "Rajkumar Hirani",
  "Two friends embark on a quest for their long-lost companion, a brilliant student who upended the conventions of their prestigious engineering college.",
  "TV-PG", "#0a1a00",
);
const DANGAL = M(
  "tmdb-dang",
  "Dangal",
  tmdb("/t7BX6Q9KGJRD39jFpz3LSXJQ94B.jpg"),
  2016, "2h 41m",
  ["Drama", "Biography", "Indian"],
  ["Aamir Khan", "Sakshi Tanwar", "Fatima Sana Shaikh"],
  "Nitesh Tiwari",
  "Former wrestler Mahavir Singh Phogat trains his daughters Geeta and Babita to become world-class wrestlers and fulfill his dream of a gold medal for India.",
  "TV-PG", "#1a0e00",
);
const KGF_CHAPTER2 = M(
  "tmdb-kgf2",
  "KGF: Chapter 2",
  tmdb("/pl3DXMV15jTDMEBpbJBT7eqpxHm.jpg"),
  2022, "2h 48m",
  ["Action", "Crime", "Indian"],
  ["Yash", "Sanjay Dutt", "Raveena Tandon"],
  "Prashanth Neel",
  "Rocky's ruthless reputation has crossed the borders of Narachi. The government, the media, and his enemies are out to destroy him. But Rocky has other plans.",
  "TV-MA", "#1a0800",
);

// ====== Asian TV ======
const KINGDOM = M(
  "tmdb-king",
  "Kingdom",
  tmdb("/8YFL5QQVPy3AgrEQxNYVSgiPEbe.jpg"),
  2020, "2 Seasons",
  ["Horror", "Period", "Korean"],
  ["Ju Ji-hoon", "Bae Doona", "Ryu Seung-ryong"],
  "Kim Seong-hun",
  "In a kingdom defiled by evil and a hunger for power, a forsaken crown prince becomes their only hope as he embarks on a bloody quest to expose dark forces.",
  "TV-MA", "#0d1a00",
);
const VINCENZO = M(
  "tmdb-vin",
  "Vincenzo",
  tmdb("/dvXJgEDQXhL9Ouot2WkBHpQiHGd.jpg"),
  2021, "1 Season",
  ["Crime", "Comedy", "Korean"],
  ["Song Joong-ki", "Jeon Yeo-been", "Ok Taec-yeon"],
  "Kim Hee-won",
  "During a visit to his motherland, a Korean-Italian mafia lawyer gives an unrivaled conglomerate a taste of its own medicine with a side of justice.",
  "TV-14", "#1a0a0a",
);
const CRASH_LANDING = M(
  "tmdb-cly",
  "Crash Landing on You",
  tmdb("/xeF0FZRnHKMJWCqRg9pFJmMjmV2.jpg"),
  2020, "1 Season",
  ["Romance", "Drama", "Korean"],
  ["Son Ye-jin", "Hyun Bin", "Kim Jung-hyun"],
  "Lee Jeong-hyo",
  "A paragliding accident lands a South Korean heiress in North Korea, where she falls in love with a military officer who must hide her from authorities.",
  "TV-14", "#0a1014",
);
const MY_MISTER = M(
  "tmdb-mym",
  "My Mister",
  tmdb("/8VxTJGAHdECCJpx7nB3HXLX5vLJ.jpg"),
  2018, "1 Season",
  ["Drama", "Korean", "Romance"],
  ["Lee Sun-kyun", "IU", "Kim Young-min"],
  "Kim Won-seok",
  "A middle-aged man goes through hardships in both work and family life, and finds an unlikely connection with a young woman facing her own struggles.",
  "TV-14", "#0a0a1a",
);

// ====== Anime ======
const JUJUTSU_KAISEN = {
  ...M(
    "tmdb-jjk",
    "Jujutsu Kaisen",
    tmdb("/6oH378KUfCEitzJkm07r97L0RsZ.jpg"),
    2023, "2 Seasons",
    ["Anime", "Action", "Supernatural"],
    ["Junya Enoki", "Yuma Uchida", "Asami Seto"],
    "Sunghoo Park",
    "A boy swallows a cursed talisman — the finger of a demon — and becomes cursed himself. He enters a shaman's school to be able to locate the demon's other body parts and exorcise himself.",
    "TV-14", "#0d0a1a",
  ),
  episodes: mkEpisodes("tmdb-jjk", 13, "/6oH378KUfCEitzJkm07r97L0RsZ.jpg"),
};
const ONE_PIECE = {
  ...M(
    "tmdb-op",
    "One Piece",
    tmdb("/cMD9Ygz11zjJzAovURpO75Qg7rT.jpg"),
    2024, "Ongoing",
    ["Anime", "Adventure", "Action"],
    ["Mayumi Tanaka", "Kazuya Nakai", "Akemi Okamura"],
    "Eiichiro Oda",
    "Years ago, the fearsome Pirate King, Gol D. Roger was executed leaving a huge pile of treasure and the famous 'One Piece' behind. Whoever claims it will gain unimaginable power.",
    "TV-14", "#1a0a00",
  ),
  episodes: mkEpisodes("tmdb-op", 12, "/cMD9Ygz11zjJzAovURpO75Qg7rT.jpg"),
};
const CHAINSAW_MAN = M(
  "tmdb-csm",
  "Chainsaw Man",
  tmdb("/npdB6eFzizki0WaZ1OvKcJrWe97.jpg"),
  2022, "1 Season",
  ["Anime", "Action", "Horror"],
  ["Kikunosuke Toya", "Tomori Kusunoki", "Shogo Sakata"],
  "Ryu Nakayama",
  "Denji has a simple dream — to live a happy life. After being killed and merging with his pet devil, he becomes a Devil Hunter wielding chainsaws.",
  "TV-MA", "#1a0a00",
);
const BLEACH = M(
  "tmdb-bleach",
  "Bleach: Thousand-Year Blood War",
  tmdb("/2EewmxXe72ogD0EaWM8gqa0ccIw.jpg"),
  2023, "2 Cours",
  ["Anime", "Action", "Supernatural"],
  ["Masakazu Morita", "Fumiko Orikasa", "Noriaki Sugiyama"],
  "Tomohisa Taguchi",
  "The peace is suddenly broken when warning sirens blare through the Soul Society. Residents are disappearing without a trace and nobody knows who's behind it.",
  "TV-14", "#0a0a1a",
);
const DEMON_SLAYER = {
  ...M(
    "tmdb-ds",
    "Demon Slayer",
    tmdb("/wrCVHdkBlBWdJUZPvnJWcBRuhSY.jpg"),
    2024, "4 Seasons",
    ["Anime", "Action", "Adventure"],
    ["Natsuki Hanae", "Akari Kito", "Hiro Shimono"],
    "Haruo Sotozaki",
    "A boy finds his family slaughtered by a demon and his sister turned into one. He joins the Demon Slayer Corps to find a cure and avenge his family.",
    "TV-14", "#1a0808",
  ),
  episodes: mkEpisodes("tmdb-ds", 11, "/wrCVHdkBlBWdJUZPvnJWcBRuhSY.jpg"),
};
const ATTACK_ON_TITAN = M(
  "tmdb-aot",
  "Attack on Titan: The Final Season",
  tmdb("/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg"),
  2023, "4 Seasons",
  ["Anime", "Action", "Dark"],
  ["Yuki Kaji", "Marina Inoue", "Yui Ishikawa"],
  "Yuichiro Hayashi",
  "In a world where humanity lives within cities surrounded by enormous walls, giant humanoid beings known as Titans threaten their existence.",
  "TV-MA", "#1a0000",
);
const FRIEREN = M(
  "tmdb-frier",
  "Frieren: Beyond Journey's End",
  tmdb("/7jWQNRGCMPMzXbqnmBY0WmMnkJh.jpg"),
  2024, "1 Season",
  ["Anime", "Fantasy", "Drama"],
  ["Atsumi Tanezaki", "Keiichi Suzumura", "Yusuke Numata"],
  "Keiichiro Saito",
  "The Demon King has been defeated and the victorious heroes go their separate ways. The elven mage Frieren reflects on her long life and those she's met.",
  "TV-PG", "#0a0a14",
);

// ====== Movies ======
const DUNE = M(
  "tmdb-dune",
  "Dune: Part Two",
  tmdb("/d5NXSklXo0qyIYkgV94XAgMIckC.jpg"),
  2024, "2h 46m",
  ["Sci-Fi", "Adventure", "Drama"],
  ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Javier Bardem"],
  "Denis Villeneuve",
  "Paul Atreides unites with the Fremen while on a warpath of revenge against the conspirators who destroyed his family.",
  "PG-13", "#1a1200",
);
const SPIDER_VERSE = M(
  "tmdb-sv",
  "Spider-Man: Across the Spider-Verse",
  tmdb("/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg"),
  2023, "2h 20m",
  ["Animation", "Action", "Adventure"],
  ["Shameik Moore", "Hailee Steinfeld", "Oscar Isaac"],
  "Joaquim Dos Santos",
  "After reuniting with Gwen Stacy, Brooklyn's Spider-Man is catapulted across the Multiverse where he encounters a team of Spider-People.",
  "PG", "#0a0a1a",
);
const AVATAR_2 = M(
  "tmdb-av2",
  "Avatar: The Way of Water",
  tmdb("/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg"),
  2022, "3h 12m",
  ["Sci-Fi", "Adventure", "Action"],
  ["Sam Worthington", "Zoe Saldana", "Sigourney Weaver"],
  "James Cameron",
  "Set more than a decade after the first film, learn the story of the Sully family, the trouble that follows them, and the battles they fight to stay alive.",
  "PG-13", "#0a1a14",
);
const OPPENHEIMER = M(
  "tmdb-opp",
  "Oppenheimer",
  tmdb("/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg"),
  2023, "3h 0m",
  ["Drama", "History", "Biography"],
  ["Cillian Murphy", "Emily Blunt", "Robert Downey Jr.", "Matt Damon"],
  "Christopher Nolan",
  "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
  "R", "#0a0800",
);
const BARBIE = M(
  "tmdb-barb",
  "Barbie",
  tmdb("/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg"),
  2023, "1h 54m",
  ["Comedy", "Adventure", "Fantasy"],
  ["Margot Robbie", "Ryan Gosling", "America Ferrera"],
  "Greta Gerwig",
  "Barbie suffers a crisis that leads her to question her world and her existence.",
  "PG-13", "#1a0018",
);
const GLADIATOR_2 = M(
  "tmdb-glad2",
  "Gladiator II",
  tmdb("/6Wdlnr4ZKRuJXlFGVFpTxMiTbGp.jpg"),
  2024, "2h 28m",
  ["Action", "Adventure", "Drama"],
  ["Paul Mescal", "Pedro Pascal", "Denzel Washington"],
  "Ridley Scott",
  "Years after witnessing the death of the revered hero Maximus at the hands of his uncle, Lucius is forced to enter the Colosseum after his home is conquered.",
  "R", "#1a0800",
);
const ALIEN_ROMULUS = M(
  "tmdb-arom",
  "Alien: Romulus",
  tmdb("/b33nnKl1GSFbao4l3fZDDqsMx0F.jpg"),
  2024, "1h 59m",
  ["Sci-Fi", "Horror", "Action"],
  ["Cailee Spaeny", "David Jonsson", "Archie Renaux"],
  "Fede Álvarez",
  "While scavenging the deep ends of a derelict space station, a group of young space colonizers come face to face with the most terrifying life form in the universe.",
  "R", "#0a0d0a",
);
const KINGDOM_MOVIE = M(
  "tmdb-kindom",
  "Kingdom of the Planet of the Apes",
  tmdb("/gKkl37BQuKTanygYQG1pyYgLVgf.jpg"),
  2024, "2h 25m",
  ["Sci-Fi", "Action", "Adventure"],
  ["Owen Teague", "Freya Allan", "Kevin Durand"],
  "Wes Ball",
  "Many years after the reign of Caesar, a young ape embarks on a journey that will lead him to question everything he's been taught about the past.",
  "PG-13", "#0a1000",
);

// ====== Custom Originals ======
const MIDNIGHT_SEOUL = M(
  "m1", "Midnight in Seoul", LOCAL.p1,
  2025, "2h 12m",
  ["Crime", "Thriller", "Korean"],
  ["Park Ji-hoon", "Kim So-yeon", "Lee Min-jae", "Choi Hae-jin"],
  "Bong Soo-jin",
  "A jaded detective hunts a serial killer through the rain-drenched alleys of Seoul, uncovering a conspiracy that reaches into the highest corridors of power.",
  "TV-MA", "#0a0a14",
);
const MUMBAI_SKYLINE = M(
  "m2", "Mumbai Skyline", LOCAL.p2,
  2024, "2h 28m",
  ["Action", "Drama", "Bollywood"],
  ["Arjun Mehra", "Priya Sharma", "Vikram Singh", "Rhea Kapoor"],
  "Ravi Krishnan",
  "A self-made tycoon defends his empire from a ruthless rival in the cutthroat world of Mumbai's high-rise power players.",
  "TV-MA", "#1a0a00",
);
const BLADE_BLOSSOM = M(
  "m3", "Blade of the Blossom", LOCAL.p3,
  2026, "1h 47m",
  ["Anime", "Fantasy", "Adventure"],
  ["Voice: Yuki Kaji", "Voice: Saori Hayami", "Voice: Mamoru Miyano"],
  "Kenji Watanabe",
  "A young samurai bound by an ancient oath must master a cursed blade to save her village from a demon awakening beneath the cherry blossoms.",
  "TV-14", "#0d1a0a",
);
const STELLAR_VANGUARD = M(
  "m4", "Stellar Vanguard", LOCAL.p4,
  2025, "2h 35m",
  ["Sci-Fi", "Adventure", "Action"],
  ["Marcus Cole", "Aria Voss", "Dax Reyes", "Lyra Kane"],
  "Elena Romanova",
  "When a renegade fleet threatens the last free colony, an exiled commander must rally a band of misfits across the cosmos for one final stand.",
  "PG-13", "#0a0d1a",
);
const CHERRY_BLOSSOMS = M(
  "m5", "Cherry Blossoms in April", LOCAL.p5,
  2024, "1h 52m",
  ["Romance", "Drama", "Asian"],
  ["Aiko Mori", "Haruto Sato", "Yui Nakamura"],
  "Sayaka Kobayashi",
  "Two strangers meet under the falling petals of Ueno Park and discover a love that defies the impossible distance between their worlds.",
  "TV-PG", "#14001a",
);
const HOLLOW_HOUSE = M(
  "m6", "The Hollow House", LOCAL.p6,
  2025, "1h 58m",
  ["Horror", "Mystery", "Thriller"],
  ["Eleanor Vance", "Thomas Reed", "Marian Cole"],
  "James Whitcombe",
  "A grieving family inherits a Victorian mansion only to discover that something behind the walls remembers every soul who has ever lived there.",
  "TV-MA", "#0a0a0a",
);
const IRON_SENTINEL = M(
  "m7", "Iron Sentinel", LOCAL.p7,
  2026, "1h 41m",
  ["Anime", "Mecha", "Action"],
  ["Voice: Nobunaga Shimazaki", "Voice: Kana Hanazawa"],
  "Tetsuro Araki",
  "When colossal beasts emerge from the sea, a teenage pilot bonds with humanity's last giant mech to defend the floating city of New Yokohama.",
  "TV-14", "#0a1218",
);
const VAULT_JOB = M(
  "m8", "The Vault Job", LOCAL.p8,
  2025, "2h 04m",
  ["Crime", "Heist", "Thriller"],
  ["Dario Bellini", "Sienna Falcone", "Marcus Webb", "Luca Romano"],
  "Vincent Marsh",
  "A legendary thief assembles a crew of specialists for one last impossible heist — breaking into a vault no one has ever cracked.",
  "TV-MA", "#1a1000",
);

// ====== Exports ======
export const ALL_MOVIES: Movie[] = [
  HERO_MOVIE,
  IF_WISHES, DAREDEVIL_BORN, ANDOR_S2, WEDNESDAY_S2, ATLAS, REBEL_MOON_3, EXTRACTION_3,
  THE_DIPLOMAT_S2, SQUID_GAME_S3,
  STRANGER_THINGS, WEDNESDAY, SQUID_GAME, THE_WITCHER, MONEY_HEIST,
  PEAKY_BLINDERS, LUPIN, THE_CROWN, DARK, BRIDGERTON,
  ARCANE, HOUSE_OF_DRAGON, LAST_OF_US, BREAKING_BAD, BETTER_CALL_SAUL,
  QUEENS_GAMBIT, OZARK, SUCCESSION, SEVERANCE, TRUE_DETECTIVE,
  RRR, THREE_IDIOTS, DANGAL, KGF_CHAPTER2,
  KINGDOM, VINCENZO, CRASH_LANDING, MY_MISTER,
  JUJUTSU_KAISEN, ONE_PIECE, CHAINSAW_MAN, BLEACH, DEMON_SLAYER,
  ATTACK_ON_TITAN, FRIEREN,
  DUNE, SPIDER_VERSE, AVATAR_2, OPPENHEIMER, BARBIE, GLADIATOR_2, ALIEN_ROMULUS,
  KINGDOM_MOVIE,
  MIDNIGHT_SEOUL, MUMBAI_SKYLINE, BLADE_BLOSSOM, STELLAR_VANGUARD,
  CHERRY_BLOSSOMS, HOLLOW_HOUSE, IRON_SENTINEL, VAULT_JOB,
];

export const FEATURED_HERO_MOVIES: Movie[] = [
  {
    // Squid Game Season 2 — TMDB TV 93405, season-specific poster verified
    id: "squid-game-s2",
    title: "Squid Game (Season 2)",
    poster: tmdb("/sXZhtWLo3fecavpDuOyJiayjt32.jpg"),
    hero:   tmdbW780("/2meX1nMdScFOoV4370rqHWKmXhY.jpg"),
    year: 2024,
    rating: "TV-MA",
    duration: "~1h",
    genres: ["Drama", "Thriller", "Sci-Fi"],
    cast: ["Lee Jung-jae", "Wi Ha-jun", "Yim Si-wan"],
    director: "Hwang Dong-hyuk",
    synopsis: "The deadly games return with 456 new players facing impossible survival choices.",
    dominantColor: "#00F0FF",
    mediaType: "tv",
    tmdbId: 93405,
  },
  {
    // The Mummy (1999) — TMDB Movie 564, confirmed Brendan Fraser version
    id: "the-mummy-1999",
    title: "The Mummy",
    poster: tmdb("/yhIsVvcUm7QxzLfT6HW2wLf5ajY.jpg"),
    hero:   tmdbW780("/8zLS8p1tRyWFLRFfmgQq0j5WE6z.jpg"),
    year: 1999,
    rating: "PG-13",
    duration: "2h 4m",
    genres: ["Action", "Adventure", "Fantasy"],
    cast: ["Brendan Fraser", "Rachel Weisz", "John Hannah"],
    director: "Stephen Sommers",
    synopsis: "An ancient mummy is accidentally resurrected, unleashing catastrophic supernatural disasters.",
    dominantColor: "#C49A45",
    mediaType: "movie",
    tmdbId: 564,
  },
  {
    // The Boys — TMDB TV 76479, verified
    id: "the-boys-prime",
    title: "The Boys",
    poster: tmdb("/in1R2dDc421JxsoRWaIIAqVI2KE.jpg"),
    hero:   tmdbW780("/bq28ajZaoMyzEIm6REelqyqtEDZ.jpg"),
    year: 2019,
    rating: "TV-MA",
    duration: "~1h",
    genres: ["Action", "Sci-Fi", "Dark Comedy"],
    cast: ["Karl Urban", "Jack Quaid", "Antony Starr"],
    director: "Eric Kripke",
    synopsis: "A vigilante crew takes on the world's most corrupt and powerful superheroes.",
    dominantColor: "#E50914",
    mediaType: "tv",
    tmdbId: 76479,
  },
  {
    // Jujutsu Kaisen — TMDB TV 95479, verified
    id: "jujutsu-kaisen-hero",
    title: "Jujutsu Kaisen",
    poster: tmdb("/fHpKWq9ayzSk8nSwqRuaAUemRKh.jpg"),
    hero:   tmdbW780("/lthkKBLe1rX6iThgVFg22O02sJw.jpg"),
    year: 2020,
    rating: "TV-14",
    duration: "~24m",
    genres: ["Action", "Fantasy", "Animation"],
    cast: ["Junya Enoki", "Yûichi Nakamura"],
    director: "Sunghoo Park",
    synopsis: "A high schooler joins a secret organisation fighting against dangerous cursed spirits.",
    dominantColor: "#1A237E",
    mediaType: "tv",
    tmdbId: 95479,
  },
];

export const TRENDING_NOW: Movie[] = [
  IF_WISHES, DAREDEVIL_BORN, SQUID_GAME_S3, WEDNESDAY_S2, ANDOR_S2,
  STRANGER_THINGS, WEDNESDAY, SQUID_GAME, THE_WITCHER, MONEY_HEIST,
  HOUSE_OF_DRAGON, LAST_OF_US, BRIDGERTON, ARCANE, PEAKY_BLINDERS,
  SEVERANCE, THE_DIPLOMAT_S2,
];

export const TOP_10_INDIA: Movie[] = [
  { ...RRR, isTop10: true, top10Rank: 1 },
  { ...KGF_CHAPTER2, isTop10: true, top10Rank: 2 },
  { ...THREE_IDIOTS, isTop10: true, top10Rank: 3 },
  { ...SQUID_GAME, isTop10: true, top10Rank: 4 },
  { ...MONEY_HEIST, isTop10: true, top10Rank: 5 },
  { ...DANGAL, isTop10: true, top10Rank: 6 },
  { ...STRANGER_THINGS, isTop10: true, top10Rank: 7 },
  { ...WEDNESDAY, isTop10: true, top10Rank: 8 },
  { ...PEAKY_BLINDERS, isTop10: true, top10Rank: 9 },
  { ...HOUSE_OF_DRAGON, isTop10: true, top10Rank: 10 },
];

export const NEW_RELEASES: Movie[] = [
  IF_WISHES, DAREDEVIL_BORN, ANDOR_S2, REBEL_MOON_3, EXTRACTION_3,
  LAST_OF_US, HOUSE_OF_DRAGON, ARCANE, DUNE, GLADIATOR_2,
  ALIEN_ROMULUS, BRIDGERTON, WEDNESDAY, DEMON_SLAYER, JUJUTSU_KAISEN,
];

export const ASIAN_TV_SHOWS: Movie[] = [
  SQUID_GAME, KINGDOM, VINCENZO, CRASH_LANDING, MY_MISTER,
  MIDNIGHT_SEOUL, CHERRY_BLOSSOMS, RRR, KGF_CHAPTER2, THREE_IDIOTS,
  ONE_PIECE, JUJUTSU_KAISEN,
];

export const ANIME: Movie[] = [
  JUJUTSU_KAISEN, DEMON_SLAYER, ONE_PIECE, ATTACK_ON_TITAN, BLEACH,
  CHAINSAW_MAN, FRIEREN, ARCANE, SPIDER_VERSE, BLADE_BLOSSOM, IRON_SENTINEL,
];

export const CRIME_DRAMA: Movie[] = [
  BREAKING_BAD, BETTER_CALL_SAUL, PEAKY_BLINDERS, MONEY_HEIST, OZARK,
  VINCENZO, LUPIN, VAULT_JOB, MIDNIGHT_SEOUL, SQUID_GAME, TRUE_DETECTIVE,
];

export const SCIFI_FANTASY: Movie[] = [
  STRANGER_THINGS, DARK, HOUSE_OF_DRAGON, THE_WITCHER, LAST_OF_US,
  DUNE, AVATAR_2, ANDOR_S2, ARCANE, SEVERANCE, STELLAR_VANGUARD,
  ALIEN_ROMULUS, KINGDOM_MOVIE,
];

export const AWARD_WINNERS: Movie[] = [
  SUCCESSION, QUEENS_GAMBIT, OPPENHEIMER, SQUID_GAME, BREAKING_BAD,
  BETTER_CALL_SAUL, THE_CROWN, BRIDGERTON, LUPIN,
];

export const ACTION_HITS: Movie[] = [
  RRR, EXTRACTION_3, GLADIATOR_2, DAREDEVIL_BORN, KGF_CHAPTER2,
  DUNE, AVATAR_2, HOUSE_OF_DRAGON, THE_WITCHER, REBEL_MOON_3,
  ATTACK_ON_TITAN, MUMBAI_SKYLINE,
];

export const ROMANCE_DRAMA: Movie[] = [
  BRIDGERTON, CRASH_LANDING, MY_MISTER, CHERRY_BLOSSOMS, THE_CROWN,
  QUEENS_GAMBIT, BARBIE,
];

export const HORROR_THRILLER: Movie[] = [
  STRANGER_THINGS, HOLLOW_HOUSE, ALIEN_ROMULUS, KINGDOM, CHAINSAW_MAN,
  DARK, TRUE_DETECTIVE,
];

export const BOLLYWOOD_HITS: Movie[] = [
  RRR, THREE_IDIOTS, DANGAL, KGF_CHAPTER2, MUMBAI_SKYLINE,
];

export const NEW_AND_HOT: Movie[] = [
  IF_WISHES, DAREDEVIL_BORN, SQUID_GAME_S3, WEDNESDAY_S2, ANDOR_S2,
  REBEL_MOON_3, EXTRACTION_3, THE_DIPLOMAT_S2, ATLAS, KINGDOM_MOVIE,
];

export const ORIGINALS: Movie[] = [
  HERO_MOVIE, MIDNIGHT_SEOUL, MUMBAI_SKYLINE, BLADE_BLOSSOM,
  STELLAR_VANGUARD, CHERRY_BLOSSOMS, HOLLOW_HOUSE, IRON_SENTINEL, VAULT_JOB,
];

export const findMovie = (id: string): Movie | undefined => {
  if (id === HERO_MOVIE.id) return HERO_MOVIE;
  return ALL_MOVIES.find((m) => m.id === id);
};

export const PLAYABLE_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
