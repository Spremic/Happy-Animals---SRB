function generateSlug(text) {
  if (!text) return "";
  const diacriticMap = {
    č: "c",
    ć: "c",
    đ: "dj",
    š: "s",
    ž: "z",
    Č: "c",
    Ć: "c",
    Đ: "dj",
    Š: "s",
    Ž: "z",
  };

  let slug = text.toString().toLowerCase().trim();

  for (const [char, replacement] of Object.entries(diacriticMap)) {
    slug = slug.replaceAll(char, replacement);
  }

  return slug
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = { generateSlug };

