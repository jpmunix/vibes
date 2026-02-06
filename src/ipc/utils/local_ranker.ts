import { CodebaseFile } from "@/utils/codebase";

export interface RankedFile extends CodebaseFile {
  score: number;
}

export function rankFilesLocally({
  prompt,
  files,
  maxResults = 60,
}: {
  prompt: string;
  files: CodebaseFile[];
  maxResults?: number;
}): RankedFile[] {
  const terms = prompt
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return [];

  const scored = files.map((file) => {
    const pathLower = file.path.toLowerCase();
    const contentLower = file.content.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (pathLower.includes(term)) {
        score += 6;
      }
      const matches = contentLower.split(term).length - 1;
      score += Math.min(matches, 6);
    }

    // Bonus for shorter/targeted files
    const lengthBonus = Math.max(0, 4 - Math.floor(file.content.length / 4000));
    score += lengthBonus;

    return { ...file, score };
  });

  return scored
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export function buildCodebaseXml(files: CodebaseFile[]): string {
  return files
    .map(
      (file) =>
        `<dyad-file path="${file.path}">\n${file.content}\n</dyad-file>\n`,
    )
    .join("\n");
}
