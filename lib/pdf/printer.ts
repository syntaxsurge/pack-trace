import PdfPrinter from "pdfmake";
import vfsFonts from "pdfmake/build/vfs_fonts";

type FontDictionary = {
  [font: string]: {
    normal: Buffer;
    bold: Buffer;
    italics: Buffer;
    bolditalics: Buffer;
  };
};

function loadEmbeddedFonts(): FontDictionary {
  // pdfmake packages Roboto fonts inside its virtual file system bundle.
  // We decode the base64 values into Buffers so PdfPrinter can consume them in Node.
  const vfsModule = vfsFonts as {
    pdfMake?: { vfs: Record<string, string> };
    vfs?: Record<string, string>;
    default?: Record<string, string>;
    [key: string]: unknown;
  };

  const vfs =
    vfsModule.pdfMake?.vfs ??
    vfsModule.vfs ??
    (vfsModule.default as Record<string, string> | undefined);

  if (!vfs) {
    throw new Error("Unable to load pdfmake virtual fonts.");
  }

  const font = (name: string) => {
    const base64 = vfs[name];

    if (!base64) {
      throw new Error(`Font ${name} is missing from the pdfmake bundle.`);
    }

    return Buffer.from(base64, "base64");
  };

  return {
    Roboto: {
      normal: font("Roboto-Regular.ttf"),
      bold: font("Roboto-Medium.ttf"),
      italics: font("Roboto-Italic.ttf"),
      bolditalics: font("Roboto-MediumItalic.ttf"),
    },
  };
}

let cachedPrinter: PdfPrinter | null = null;

export function getPdfPrinter(): PdfPrinter {
  if (!cachedPrinter) {
    cachedPrinter = new PdfPrinter(loadEmbeddedFonts());
  }

  return cachedPrinter;
}
