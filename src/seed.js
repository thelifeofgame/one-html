export const examples = [
  [
    "tiny-sail",
    "Tiny Sail",
    "口袋帆船",
    "A little boat. An endless blue. Catch the wind and collect every buoy.",
    "驾着小船穿过碧蓝海面，收集浮标，享受一段海上漫游。",
    "game",
    "sail",
  ],
  [
    "midnight-drive",
    "Midnight Drive",
    "午夜疾驰",
    "Find your rhythm on a winding neon highway. How far can you go?",
    "在霓虹公路上左右闪避，找到节奏，看看你能开多远。",
    "game",
    "drive",
  ],
  [
    "orbital",
    "Orbital",
    "引力游乐场",
    "Paint your own tiny universe. Click to release a new orbit.",
    "点击放下星体，让引力描绘独一无二的轨道。",
    "visual",
    "orbit",
  ],
  [
    "bloom",
    "Bloom",
    "指尖花园",
    "A garden that grows with your cursor. Make something wonderfully imperfect.",
    "移动鼠标或轻触屏幕，种下一朵朵不断绽放的花。",
    "visual",
    "bloom",
  ],
  [
    "little-piano",
    "Little Piano",
    "口袋钢琴",
    "Eight keys, endless little melodies. A pocket piano for your next break.",
    "八个琴键，一点灵感。用键盘或轻触弹出自己的小旋律。",
    "tool",
    "piano",
  ],
  [
    "focus-island",
    "Focus Island",
    "专注小岛",
    "Take a breath, pick a timer, and give one thing your full attention.",
    "选好时间，专心做一件事。让思绪在这座小岛上慢慢安静。",
    "tool",
    "island",
  ],
].map(
  (
    [id, title, title_zh, description, description_zh, category, cover],
    index,
  ) => ({
    id,
    title,
    title_zh,
    description,
    description_zh,
    category,
    cover,
    credit: "OneHTML Lab",
    license: "MIT",
    status: "published",
    builtin_path: `/demos/${id}.html`,
    created_at: 1794787200000 - index * 3600000,
  }),
);

export async function seed(db) {
  await db.batch(
    examples.map((work) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO works
    (id,title,title_zh,description,description_zh,category,credit,license,status,builtin_path,cover,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          work.id,
          work.title,
          work.title_zh,
          work.description,
          work.description_zh,
          work.category,
          work.credit,
          work.license,
          work.status,
          work.builtin_path,
          work.cover,
          work.created_at,
        ),
    ),
  );
}
