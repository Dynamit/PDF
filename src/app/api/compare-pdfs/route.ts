// src/app/api/compare-pdfs/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const UPLOAD_DIR = "/tmp";
const PYTHON_SCRIPT_PATH = path.resolve(process.cwd(), "scripts/compare_texts.py");

async function extractTextFromPdf(pdfBuffer: Buffer, originalFileName: string): Promise<string> {
  const tempPdfFileName = `temp_${Date.now()}_${originalFileName}`;
  const tempPdfFilePath = path.join(UPLOAD_DIR, tempPdfFileName);

  try {
    await fs.writeFile(tempPdfFilePath, pdfBuffer);
    // Execute pdftotext: pdftotext <pdf_file_path> -
    // The trailing hyphen means output to stdout
    const { stdout, stderr } = await execFileAsync("pdftotext", [tempPdfFilePath, "-"]);
    if (stderr) {
      console.warn(`pdftotext stderr for ${originalFileName}: ${stderr}`);
    }
    return stdout;
  } catch (error: unknown) {
    console.error(`Error extracting text with pdftotext for ${originalFileName}:`, error);
    let errorMessage = `שגיאה בחילוץ טקסט מהקובץ ${originalFileName} באמצעות pdftotext.`;
    if (typeof error === "object" && error !== null) {
        if ("message" in error && typeof (error as {message: unknown}).message === "string") {
            errorMessage += ` פרטי השגיאה: ${(error as {message: string}).message}`;
        }
        if ("stderr" in error && typeof (error as {stderr: unknown}).stderr === "string" && (error as {stderr: string}).stderr.trim() !== "") {
            errorMessage += ` פלט שגיאה: ${(error as {stderr: string}).stderr.trim()}`;
        }
    }
    throw new Error(errorMessage);
  } finally {
    try {
      await fs.unlink(tempPdfFilePath);
    } catch (cleanupError) {
      console.error(`Failed to delete temporary PDF file ${tempPdfFilePath}:`, cleanupError);
    }
  }
}

export async function POST(request: NextRequest) {
  const tempTextFilePaths: string[] = [];
  let tempJsonOutputPath: string | null = null;

  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const formData = await request.formData();
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 || !file2) {
      return NextResponse.json({ error: "יש להעלות שני קבצים." }, { status: 400 });
    }

    const files = [file1, file2];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `הקובץ ${file.name} גדול מדי (מקסימום 1MB).` }, { status: 400 });
      }
      if (file.type !== "application/pdf") {
        return NextResponse.json({ error: `הקובץ ${file.name} אינו קובץ PDF.` }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      let extractedText;
      try {
        extractedText = await extractTextFromPdf(buffer, file.name);
      } catch (parseError: unknown) {
        let errorMessage = `שגיאה בפענוח הקובץ ${file.name}.`;
        if (parseError instanceof Error) {
            errorMessage = parseError.message; // Use the more specific error from extractTextFromPdf
        }
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }

      const tempTextFileName = `extracted_${Date.now()}_${i}.txt`;
      const tempTextFilePath = path.join(UPLOAD_DIR, tempTextFileName);
      await fs.writeFile(tempTextFilePath, extractedText);
      tempTextFilePaths.push(tempTextFilePath);
    }

    tempJsonOutputPath = path.join(UPLOAD_DIR, `comparison_output_${Date.now()}.json`);

    let pythonExecutable = "python3.11";
    try {
        await execFileAsync(pythonExecutable, ["--version"]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e: unknown) { 
        pythonExecutable = "python3";
        try {
            await execFileAsync(pythonExecutable, ["--version"]);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_e2: unknown) { 
            pythonExecutable = "python";
        }
    }

    try {
      await execFileAsync(pythonExecutable, [
        PYTHON_SCRIPT_PATH,
        tempTextFilePaths[0],
        tempTextFilePaths[1],
        tempJsonOutputPath,
      ]);
    } catch (err: unknown) {
      console.error("Error running Python comparison script:", err);
      let errorMessage = "שגיאה בביצוע השוואת הטקסטים.";
      let specificStdErr: string | undefined;
      let specificStdOut: string | undefined;
      let specificCode: number | undefined;

      if (typeof err === "object" && err !== null) {
          if ("stderr" in err && typeof (err as {stderr: unknown}).stderr === "string") {
              specificStdErr = (err as {stderr: string}).stderr;
          }
          if ("stdout" in err && typeof (err as {stdout: unknown}).stdout === "string") {
              specificStdOut = (err as {stdout: string}).stdout;
          }
          if ("code" in err && typeof (err as {code: unknown}).code === "number") {
              specificCode = (err as {code: number}).code;
          }
      }

      if (specificStdErr) errorMessage += ` פרטי השגיאה: ${specificStdErr}`;
      if (specificStdOut) errorMessage += ` פלט: ${specificStdOut}`;
      if (specificCode === 127) errorMessage = `שגיאה בהשוואה: פקודת ${pythonExecutable} לא נמצאה או שסקריפט הפייתון לא נמצא בנתיב ${PYTHON_SCRIPT_PATH}.`;
      return NextResponse.json({ error: errorMessage, scriptPath: PYTHON_SCRIPT_PATH, textFiles: tempTextFilePaths }, { status: 500 });
    }

    const comparisonResultJson = await fs.readFile(tempJsonOutputPath, "utf-8");
    const comparisonResult = JSON.parse(comparisonResultJson);

    return NextResponse.json(comparisonResult, { status: 200 });

  } catch (error: unknown) {
    console.error("שגיאה כללית בעיבוד הבקשה:", error);
    let detailsMessage = "שגיאה לא ידועה";
    if (error instanceof Error) {
        detailsMessage = error.message;
    } else if (typeof error === "object" && error !== null && "message" in error && typeof (error as {message: unknown}).message === "string") {
        detailsMessage = (error as {message: string}).message;
    } else if (typeof error === "string") {
        detailsMessage = error;
    }
    return NextResponse.json({ error: "שגיאה פנימית בשרת בעת עיבוד הקבצים.", details: detailsMessage }, { status: 500 });
  } finally {
    const filesToClean = [...tempTextFilePaths];
    if (tempJsonOutputPath) {
      filesToClean.push(tempJsonOutputPath);
    }
    for (const filePath of filesToClean) {
      try {
        if (filePath) await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error(`Failed to delete temporary file ${filePath}:`, cleanupError);
      }
    }
  }
}
