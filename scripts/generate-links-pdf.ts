import fs from "node:fs";
import path from "node:path";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";

import { getPdfPrinter } from "@/lib/pdf/printer";

const links = [
  {
    label: "YouTube Demo",
    url: "https://youtu.be/hJAu5NF_61I",
  },
  {
    label: "GitHub Repository",
    url: "https://github.com/syntaxsurge/pack-trace",
  },
  {
    label: "Live Demo (Vercel)",
    url: "https://pack-trace.vercel.app/",
  },
  {
    label: "Pitch Deck (Canva)",
    url: "https://www.canva.com/design/DAG3XwUtWbQ/gQ-hhHi7xIjtI0EyhLazyg/edit?utm_content=DAG3XwUtWbQ&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton",
  },
  {
    label: "Docker Hub Image (amd64)",
    url: "https://hub.docker.com/r/syntaxsurge/pack-trace",
  },
  {
    label: "NodeOps Template (YAML in repo)",
    url: "https://raw.githubusercontent.com/syntaxsurge/pack-trace/main/nodeops_template.yaml",
  },
  {
    label: "Demo Runbook (GitHub)",
    url: "https://github.com/syntaxsurge/pack-trace/blob/main/docs/demo-runbook.md",
  },
  {
    label: "README (GitHub)",
    url: "https://github.com/syntaxsurge/pack-trace/blob/main/README.md",
  },
];

function linkItem(label: string, url: string): Content {
  return {
    margin: [0, 6, 0, 0],
    stack: [
      { text: label, bold: true },
      { text: url, link: url, color: "#0a66c2", decoration: "underline" },
    ],
  };
}

async function main() {
  const printer = getPdfPrinter();

  const docDefinition: TDocumentDefinitions = {
    info: {
      title: "PackTrace — Useful Links",
      author: "PackTrace",
      subject: "Project Links",
      keywords: "PackTrace, Hedera, supOS, NodeOps, Supabase",
    },
    content: [
      { text: "PackTrace — Useful Links", style: "title" },
      { text: "", margin: [0, 2, 0, 0] },
      { text: "Quick access to all public resources for PackTrace.", margin: [0, 0, 0, 10] },
      ...links.map((l) => linkItem(l.label, l.url)),
    ],
    styles: {
      title: { fontSize: 18, bold: true, margin: [0, 0, 0, 6] },
    },
    defaultStyle: { font: "Roboto", fontSize: 10 },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const outDir = path.join(process.cwd(), "docs");
  const outPath = path.join(outDir, "pack-trace-links.pdf");
  await fs.promises.mkdir(outDir, { recursive: true });

  const writeStream = fs.createWriteStream(outPath);
  pdfDoc.pipe(writeStream);
  pdfDoc.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", () => resolve());
    writeStream.on("error", (err) => reject(err));
  });

  // eslint-disable-next-line no-console
  console.log(`Generated: ${outPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

