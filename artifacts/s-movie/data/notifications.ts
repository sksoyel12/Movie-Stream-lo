export type NotifItem = {
  id: string;
  type: "upcoming" | "new_arrival";
  title: string;
  subtitle: string;
  description: string;
  posterPath: string;
  backdropPath?: string;
  releaseDate: string;
  releaseDateISO: string;
  genres: string[];
  addedAt: number;
  tmdbId?: number;
};

// wsrv.nl = same CDN as weserv.nl but NOT blocked on Indian ISPs
const t = (path: string) => `https://wsrv.nl/?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w342${path}`)}&output=webp&q=85`;

// Fixed static timestamps — May 5, 2026 (UTC). Using a constant so
// LATEST_NOTIF_AT never changes on app restart, which would make the badge
// permanently stuck red.
const D = 1746403200000; // May 5, 2026 00:00:00 UTC

export const NOTIFICATIONS: NotifItem[] = [
  // ── UPCOMING PREMIERES ──────────────────────────────────────────────────────
  {
    id: "notif-jjk-s3",
    type: "upcoming",
    title: "Jujutsu Kaisen Season 3",
    subtitle: "New season · Crunchyroll Original",
    description:
      "The Culling Game arc begins. Yuji and friends race against time as cursed spirit battles escalate to an apocalyptic scale.",
    posterPath: t("/tDbFSXCJBAbxyJVqfMWOZSXwSqL.jpg"),
    releaseDate: "Jul 2, 2026",
    releaseDateISO: "2026-07-02",
    genres: ["Anime", "Action", "Supernatural"],
    addedAt: D + 1000 * 60 * 30,   // May 5 00:30 UTC
    tmdbId: 95479,
  },
  {
    id: "notif-rezero-s3",
    type: "upcoming",
    title: "Re:ZERO − Starting Life in Another World Season 3",
    subtitle: "New season · S-MOVIE Original",
    description:
      "Subaru faces his most harrowing trial yet as the Sanctuary arc reaches its emotional and brutal conclusion.",
    posterPath: t("/APppzljryFy2nYKqEqftFLrJwkl.jpg"),
    releaseDate: "Aug 14, 2026",
    releaseDateISO: "2026-08-14",
    genres: ["Anime", "Isekai", "Fantasy"],
    addedAt: D + 1000 * 60 * 40,   // May 5 00:40 UTC
    tmdbId: 65614,
  },
  {
    id: "notif-solo-leveling-s2",
    type: "upcoming",
    title: "Solo Leveling: Arise from the Shadow",
    subtitle: "Season 2 · S-MOVIE Exclusive",
    description:
      "Jinwoo Sung ascends further as the Shadow Monarch, confronting threats that eclipse everything he has faced before.",
    posterPath: t("/4mUAqdeCgH7HRPLbMqGPXHI2wce.jpg"),
    releaseDate: "Sep 6, 2026",
    releaseDateISO: "2026-09-06",
    genres: ["Anime", "Action", "Fantasy"],
    addedAt: D + 1000 * 60 * 50,   // May 5 00:50 UTC
    tmdbId: 127532,
  },
  {
    id: "notif-chainsaw-s2",
    type: "upcoming",
    title: "Chainsaw Man Part 2",
    subtitle: "New cour · Studio MAPPA",
    description:
      "The Academy Saga begins. Denji navigates high school — and a terrifying new Devil in a school uniform.",
    posterPath: t("/nACl7wdLmElWTL7LGkDnJ2ncjjF.jpg"),
    releaseDate: "Oct 11, 2026",
    releaseDateISO: "2026-10-11",
    genres: ["Anime", "Horror", "Action"],
    addedAt: D + 1000 * 60 * 55,   // May 5 00:55 UTC
    tmdbId: 114410,
  },
  {
    id: "notif-blue-lock-s2",
    type: "upcoming",
    title: "Blue Lock Season 2: Second Selection",
    subtitle: "New season · Football anime",
    description:
      "Isagi Yoichi enters the Second Selection, clashing with even more terrifying strikers in the battle to forge Japan's ultimate egoist.",
    posterPath: t("/s6pBCNXO0dDLNemqPBqfBhZYCZm.jpg"),
    releaseDate: "Nov 3, 2026",
    releaseDateISO: "2026-11-03",
    genres: ["Anime", "Sports", "Drama"],
    addedAt: D + 1000 * 60 * 58,   // May 5 00:58 UTC
    tmdbId: 207543,
  },
  {
    id: "notif-stranger-things-s5",
    type: "upcoming",
    title: "Stranger Things Season 5",
    subtitle: "Final season · Netflix Original",
    description:
      "Hawkins faces its ultimate reckoning. The final battle against Vecna and the Upside Down begins — and not everyone will survive.",
    posterPath: t("/49WJfeN0moxb9IPfGn8AIqMGskD.jpg"),
    releaseDate: "Nov 26, 2026",
    releaseDateISO: "2026-11-26",
    genres: ["Sci-Fi", "Horror", "Drama"],
    addedAt: D + 1000 * 60 * 59,   // May 5 00:59 UTC
    tmdbId: 66732,
  },

  // ── NEW ARRIVALS ─────────────────────────────────────────────────────────────
  {
    id: "notif-demon-slayer-movie",
    type: "new_arrival",
    title: "Demon Slayer: Infinity Castle",
    subtitle: "Now streaming · Movie",
    description:
      "The long-awaited theatrical arc arrives. Tanjiro and the Hashira storm the Infinity Castle in an all-out war against Muzan.",
    posterPath: t("/xUfRZu2mi8jH6SzQEJGP6tjBuYj.jpg"),
    releaseDate: "Available now",
    releaseDateISO: "2026-05-01",
    genres: ["Anime", "Action", "Adventure"],
    addedAt: D + 1000 * 60 * 20,   // May 5 00:20 UTC
    tmdbId: 945961,
  },
  {
    id: "notif-squid-game-s3",
    type: "new_arrival",
    title: "Squid Game Season 3",
    subtitle: "Now streaming · Netflix Original",
    description:
      "Gi-hun returns to the games — but this time he is playing by a different set of rules. The final chapter begins.",
    posterPath: t("/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg"),
    releaseDate: "Available now",
    releaseDateISO: "2026-04-20",
    genres: ["Thriller", "Drama", "Korean"],
    addedAt: D + 1000 * 60 * 15,   // May 5 00:15 UTC
    tmdbId: 93405,
  },
  {
    id: "notif-witcher-s4",
    type: "new_arrival",
    title: "The Witcher Season 4",
    subtitle: "Now streaming · Fantasy Epic",
    description:
      "Liam Hemsworth steps into the role of Geralt of Rivia, navigating a continent on the edge of war with Ciri now a powerful force.",
    posterPath: t("/7WeiAFSqJxGbIlYiAbxlzCDRMjz.jpg"),
    releaseDate: "Available now",
    releaseDateISO: "2026-04-10",
    genres: ["Fantasy", "Action", "Drama"],
    addedAt: D + 1000 * 60 * 10,   // May 5 00:10 UTC
    tmdbId: 71912,
  },
  {
    id: "notif-op-egghead",
    type: "new_arrival",
    title: "One Piece: Egghead Arc",
    subtitle: "Now streaming · Complete arc",
    description:
      "The Straw Hats arrive on Vegapunk's futuristic island — and set the entire world ablaze. The most explosive arc yet is now complete.",
    posterPath: t("/cMD9Ygz11zjJzAovURpO75Qg7rT.jpg"),
    releaseDate: "Available now",
    releaseDateISO: "2026-03-28",
    genres: ["Anime", "Adventure", "Action"],
    addedAt: D + 1000 * 60 * 5,    // May 5 00:05 UTC
    tmdbId: 37854,
  },
];

export const UPCOMING     = NOTIFICATIONS.filter((n) => n.type === "upcoming");
export const NEW_ARRIVALS = NOTIFICATIONS.filter((n) => n.type === "new_arrival");

// Static max — never changes on restart, so hasUnread logic works correctly
export const LATEST_NOTIF_AT = Math.max(...NOTIFICATIONS.map((n) => n.addedAt));
