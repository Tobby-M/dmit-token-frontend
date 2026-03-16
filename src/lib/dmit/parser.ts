export interface DmitSection {
  title: string;
  displayTitle: string;
  markdown: string;
}

export interface DmitReport {
  rawTitle: string;
  abilityTitle: string;
  finger: string;
  type: string;
  percentage: string;
  rc: string;
  descriptionMarkdown: string;
  traits: DmitSection | null;
  specificSuggestions: DmitSection | null;
  otherSuggestions: DmitSection | null;
  sourceText: string;
}

function cleanLine(line: string): string {
  return line.replace(/\r/g, "").trimEnd();
}

function stripMarkdownDecorators(value: string): string {
  return value.replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
}

function trimMarkdownBlock(lines: string[]): string {
  const trimmed = [...lines];

  while (trimmed.length > 0 && !trimmed[0]?.trim()) {
    trimmed.shift();
  }

  while (trimmed.length > 0 && !trimmed[trimmed.length - 1]?.trim()) {
    trimmed.pop();
  }

  return trimmed.join("\n").trim();
}

function toSection(section: { title: string; content: string[] } | undefined): DmitSection | null {
  if (!section) {
    return null;
  }

  return {
    title: section.title,
    displayTitle: section.title.replace(/^test\s*-\s*/i, "").trim(),
    markdown: trimMarkdownBlock(section.content)
  };
}

export function parseReport(text: string): DmitReport {
  const lines = text.split("\n");
  const cleaned = lines.map((line) => cleanLine(line));

  const titleLine = cleaned.find((line) => line.startsWith("# ")) ?? "# Unknown Report";
  const rawTitle = titleLine.replace(/^#\s+/, "").trim();
  const titleMatch = rawTitle.match(/^(.*)\((.*)\)$/);
  const abilityTitle = titleMatch ? titleMatch[1].trim() : rawTitle;
  const finger = titleMatch ? titleMatch[2].trim() : "Unknown Finger";

  const typeLine = cleaned.find((line) => line.startsWith("**Type**:")) ?? "**Type**: Unknown";
  const percentageLine = cleaned.find((line) => line.startsWith("**%**:")) ?? "**%**: 0.00%";
  const rcLine = cleaned.find((line) => line.startsWith("**RC**:")) ?? "**RC**: (0-Unlimited)";

  const type = stripMarkdownDecorators(typeLine.split(":")[1] ?? "Unknown");
  const percentage = stripMarkdownDecorators(percentageLine.split(":")[1] ?? "0.00%");
  const rc = stripMarkdownDecorators(rcLine.split(":")[1] ?? "(0-Unlimited)");

  const description: string[] = [];
  const sectionBlocks: Array<{ title: string; content: string[] }> = [];

  let activeSection: { title: string; content: string[] } | null = null;
  let inDescription = false;

  for (const line of cleaned) {
    if (line.startsWith("# ")) {
      inDescription = true;
      continue;
    }

    if (line.startsWith("**Type**:")) {
      inDescription = false;
      continue;
    }

    if (line.startsWith("## ")) {
      inDescription = false;
      if (activeSection) {
        sectionBlocks.push(activeSection);
      }
      activeSection = {
        title: line.replace(/^##\s+/, "").trim(),
        content: []
      };
      continue;
    }

    if (line === "---") {
      continue;
    }

    if (activeSection) {
      activeSection.content.push(line);
      continue;
    }

    if (inDescription && line.trim()) {
      description.push(line.trim());
    }
  }

  if (activeSection) {
    sectionBlocks.push(activeSection);
  }

  const traitsBlock = sectionBlocks.find((section) =>
    section.title.toLowerCase().startsWith("test -")
  );
  const specificBlock = sectionBlocks.find((section) =>
    section.title.toLowerCase().includes("specific suggestions")
  );
  const otherBlock = sectionBlocks.find((section) =>
    section.title.toLowerCase().includes("other suggestions")
  );

  return {
    rawTitle,
    abilityTitle,
    finger,
    type,
    percentage,
    rc,
    descriptionMarkdown: trimMarkdownBlock(description),
    traits: toSection(traitsBlock),
    specificSuggestions: toSection(specificBlock),
    otherSuggestions: toSection(otherBlock),
    sourceText: text
  };
}
